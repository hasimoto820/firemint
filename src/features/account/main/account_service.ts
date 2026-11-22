import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, net, shell } from 'electron'
import { translate } from '@shared/i18n/shared/translate'
import { logInfo, logWarn } from '@shared/logging/logger'
import { getSettings } from '@shared/settings/main/service'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import {
  computeEntitlement,
  computeTrialDaysLeft,
  type AccountDeleteDataResult,
  type AccountManageBillingResult,
  type AccountMember,
  type AccountMemberResult,
  type AccountPurchaseResult,
  type AccountSignInResult,
  type AccountStatus,
  type LatestSubscription
} from '@features/account/shared/types'
import {
  clearAccountCache,
  loadAccountCache,
  saveAccountCache,
  type AccountCache
} from './account_cache'
import {
  clearAccountSession,
  loadAccountSession,
  saveAccountSession
} from './account_session_store'
import {
  InvalidSessionError,
  refreshTokens,
  signInWithGoogleIdToken,
  signUpAnonymous,
  type FirebaseTokens
} from './firebase_auth_api'
import { FIREBASE_PROJECT_ID, FUNCTIONS_REGION } from './firebase_config'
import { requestGoogleIdToken } from './google_id_token'
import { readMachineGuid } from './machine_guid'

// 有効期限の少し前に更新する
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000
// ウィンドウに戻るたびに読みに行かない
const REFRESH_INTERVAL_MS = 15 * 1000
const CHECKOUT_URL_PREFIX = 'https://checkout.stripe.com/'
const PORTAL_URL_PREFIX = 'https://billing.stripe.com/'

type IdTokenClaims = { email?: string; name?: string }

let currentTokens: FirebaseTokens | null = null
let currentEmail: string | null = null
let currentCache: AccountCache | null = null
let inviteCheckInflight: Promise<void> | null = null
let currentIsOwner = false
let currentHasStripeCustomer = false
// 「課金中なので招待を受けられない」の案内は、起動している間に 1 回だけ出す
let inviteBlockedNoticeShown = false
let lastRefreshAt = 0

function readClaims(idToken: string): IdTokenClaims {
  const payload = idToken.split('.')[1] ?? ''
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as IdTokenClaims
}

async function adoptTokens(tokens: FirebaseTokens): Promise<void> {
  currentTokens = tokens
  currentEmail = readClaims(tokens.idToken).email ?? null
  await saveAccountSession({
    uid: tokens.uid,
    refreshToken: tokens.refreshToken,
    email: currentEmail
  })
}

async function getIdToken(): Promise<string> {
  if (!currentTokens) {
    throw new Error('ログインしていません')
  }
  if (currentTokens.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
    await adoptTokens(await refreshTokens(currentTokens.refreshToken))
  }
  return currentTokens.idToken
}

async function callFunction<T>(name: string, data: unknown = {}): Promise<T> {
  const response = await net.fetch(
    `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getIdToken()}`
      },
      body: JSON.stringify({ data })
    }
  )
  const body = (await response.json()) as { result?: T; error?: { message?: string } }

  if (!response.ok || body.result === undefined) {
    throw new Error(`${name} failed: ${body.error?.message ?? `HTTP ${response.status}`}`)
  }

  return body.result
}

/** ③ 端末を登録して、キャッシュをサーバーの値で作り直す。契約の写しは引き継ぐ。 */
async function registerDevice(
  uid: string,
  latestSubscription: LatestSubscription | null = null
): Promise<AccountCache> {
  const result = await callFunction<{ firstUseDate: number; accountId: string | null }>(
    'windows_registerDevice',
    { deviceId: await readMachineGuid() }
  )
  const registered: AccountCache = {
    uid,
    accountId: result.accountId,
    firstUseDate: result.firstUseDate,
    latestSubscription
  }
  await saveAccountCache(registered)
  logInfo('account', 'device registered')
  return registered
}

async function updateCachedAccountId(accountId: string | null): Promise<void> {
  if (currentCache) {
    currentCache = { ...currentCache, accountId }
    await saveAccountCache(currentCache)
  }
}

/** accountId の最新の subscription を読む（モバイル版の fetchLatestSubscription と同じ）。 */
async function fetchLatestSubscription(accountId: string): Promise<LatestSubscription | null> {
  const response = await net.fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getIdToken()}`
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'subscriptions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'accountId' },
              op: 'EQUAL',
              value: { stringValue: accountId }
            }
          },
          orderBy: [{ field: { fieldPath: 'expiryTime' }, direction: 'DESCENDING' }],
          limit: 1
        }
      })
    }
  )

  if (!response.ok) {
    throw new Error(`fetchLatestSubscription failed: HTTP ${response.status}`)
  }

  const rows = (await response.json()) as Array<{
    document?: {
      fields?: {
        expiryTime?: { timestampValue?: string }
        lastNotificationType?: { stringValue?: string }
      }
    }
  }>
  const fields = rows[0]?.document?.fields
  if (!fields) {
    return null
  }

  return {
    expiryTimeMillis: Date.parse(fields.expiryTime?.timestampValue ?? '') || 0,
    lastNotificationType: fields.lastNotificationType?.stringValue ?? null
  }
}

/** 契約の写しを更新する。読めなければ、前の写しを使い続ける（未策定 J）。 */
async function refreshLatestSubscription(): Promise<void> {
  if (!currentCache) {
    return
  }
  try {
    const latestSubscription = currentCache.accountId
      ? await fetchLatestSubscription(currentCache.accountId)
      : null
    currentCache = { ...currentCache, latestSubscription }
    await saveAccountCache(currentCache)
    const account = currentCache.accountId ? await fetchAccountInfo(currentCache.accountId) : null
    currentIsOwner = account !== null && account.ownerUid === currentTokens?.uid
    currentHasStripeCustomer = account !== null && account.stripeCustomerId !== null
  } catch (error) {
    logWarn('account', 'subscription refresh failed; using cache', error)
  }
}

/** accounts/{accountId} の ownerUid と stripeCustomerId を読む（モバイル版の fetchAccountOwnerUid と同じ読み方）。 */
async function fetchAccountInfo(
  accountId: string
): Promise<{ ownerUid: string | null; stripeCustomerId: string | null }> {
  const response = await net.fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/accounts/${accountId}`,
    { headers: { Authorization: `Bearer ${await getIdToken()}` } }
  )
  if (!response.ok) {
    throw new Error(`fetchAccountInfo failed: HTTP ${response.status}`)
  }
  const body = (await response.json()) as {
    fields?: { ownerUid?: { stringValue?: string }; stripeCustomerId?: { stringValue?: string } }
  }
  return {
    ownerUid: body.fields?.ownerUid?.stringValue ?? null,
    stripeCustomerId: body.fields?.stripeCustomerId?.stringValue ?? null
  }
}

/** 契約を読み直す。購入した後にブラウザからアプリへ戻った時など。 */
export async function refreshAccount(): Promise<void> {
  if (!currentTokens || Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) {
    return
  }
  lastRefreshAt = Date.now()
  await refreshLatestSubscription()
  notifyStatusChanged()
}

/** Stripe の購入画面をブラウザで開く。 */
export async function purchaseSubscription(): Promise<AccountPurchaseResult> {
  try {
    const { url } = await callFunction<{ url: string }>('windows_createCheckoutSession')
    if (!url.startsWith(CHECKOUT_URL_PREFIX)) {
      throw new Error('購入画面の URL が正しくありません')
    }
    await shell.openExternal(url)
    return { ok: true }
  } catch (error) {
    logWarn('account', 'purchase failed', error)
    return { ok: false, error: error instanceof Error ? error.message : '購入できませんでした' }
  }
}

/**
 * 002_005_flow.txt「解約」。Stripe の Customer Portal をブラウザで開く。
 * 開けるのは Stripe で買った本人（owner）だけ（サーバー側でも確かめる）。
 */
export async function manageBilling(): Promise<AccountManageBillingResult> {
  try {
    const { url } = await callFunction<{ url: string }>('windows_createPortalSession')
    if (!url.startsWith(PORTAL_URL_PREFIX)) {
      throw new Error('支払いの管理画面の URL が正しくありません')
    }
    await shell.openExternal(url)
    return { ok: true }
  } catch (error) {
    logWarn('account', 'manage billing failed', error)
    const { locale } = await getSettings()
    return {
      ok: false,
      error: functionErrorMessage(error, translate(locale, 'account.manage_billing_failed'))
    }
  }
}

/** callFunction のエラーから、サーバーの理由だけを取り出す（「addMember failed: 」を外す） */
function functionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }
  return error.message.replace(/^[A-Za-z_]+ failed: /, '') || fallback
}

/**
 * accounts/{accountId}/members を読む（モバイル版の fetchMembers と同じ）。
 * 読めるのは、その account のメンバーだけ（firestore.rules）。オーナー自身もメンバーに入っている。
 */
export async function listAccountMembers(): Promise<AccountMember[]> {
  const accountId = currentCache?.accountId
  if (!accountId || !currentEmail) {
    return []
  }

  const response = await net.fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/accounts/${accountId}/members?pageSize=20`,
    { headers: { Authorization: `Bearer ${await getIdToken()}` } }
  )
  if (!response.ok) {
    throw new Error(`listAccountMembers failed: HTTP ${response.status}`)
  }

  const body = (await response.json()) as {
    documents?: Array<{ name: string; fields?: { email?: { stringValue?: string } } }>
  }
  const selfUid = currentTokens?.uid ?? null

  return (body.documents ?? []).map((doc) => {
    const id = doc.name.split('/').pop() ?? ''
    return {
      id,
      email: doc.fields?.email?.stringValue ?? null,
      // 招待中は、ドキュメント ID が email（参加すると uid に替わる）
      pending: id.includes('@'),
      isSelf: id === selfUid
    }
  })
}

/** オーナーがメンバーを招待する（addMember。上限やメールアドレスの確認はサーバー側） */
export async function addAccountMember(email: string): Promise<AccountMemberResult> {
  try {
    await callFunction('addMember', { email: email.trim() })
    logInfo('account', 'member invited')
    return { ok: true }
  } catch (error) {
    logWarn('account', 'addMember failed', error)
    return { ok: false, error: functionErrorMessage(error, '追加できませんでした') }
  }
}

/** オーナーがメンバーを外す（removeMember）。招待中の人は email、参加済みの人は uid を渡す */
export async function removeAccountMember(memberId: string): Promise<AccountMemberResult> {
  try {
    await callFunction('removeMember', { uid: memberId })
    logInfo('account', 'member removed')
    return { ok: true }
  } catch (error) {
    logWarn('account', 'removeMember failed', error)
    return { ok: false, error: functionErrorMessage(error, '外せませんでした') }
  }
}

/**
 * メンバーが自分でグループから抜ける（removeMember に自分の uid を渡す。モバイル版の onLeaveAccount と同じ）。
 * 抜けた直後は accountId が空になる。招待が無ければ checkForInvite が新しい account を作る。
 * オーナーは抜けられない（サーバー側で拒否）。
 */
export async function leaveAccount(): Promise<AccountMemberResult> {
  const uid = currentTokens?.uid
  if (!uid) {
    return { ok: false, error: 'ログインしていません' }
  }
  try {
    await callFunction('removeMember', { uid })
    logInfo('account', 'left account')
  } catch (error) {
    logWarn('account', 'leave account failed', error)
    return { ok: false, error: functionErrorMessage(error, '脱退できませんでした') }
  }

  // ここから先は、抜けた後の後始末。失敗しても、脱退そのものは済んでいる
  try {
    await updateCachedAccountId(null)
    await checkForInvite()
    await refreshLatestSubscription()
  } catch (error) {
    logWarn('account', 'after leaving: account setup failed', error)
  }
  notifyStatusChanged()
  return { ok: true }
}

function notifyStatusChanged(): void {
  const status = getAccountStatus()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.ACCOUNT_CHANGED, status)
    }
  }
}

/** 自分の users/{uid} の email / name を更新する（モバイル版の updateUserProfile と同じ）。 */
async function updateUserProfile(uid: string): Promise<void> {
  const idToken = await getIdToken()
  const claims = readClaims(idToken)
  const params = new URLSearchParams()
  params.append('updateMask.fieldPaths', 'email')
  params.append('updateMask.fieldPaths', 'name')
  params.append('currentDocument.exists', 'true')
  const response = await net.fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        fields: {
          email: { stringValue: claims.email ?? '' },
          name: { stringValue: claims.name ?? '' }
        }
      })
    }
  )

  if (!response.ok) {
    throw new Error(`updateUserProfile failed: HTTP ${response.status}`)
  }
}

async function showNotice(message: string, detail: string): Promise<void> {
  const options = {
    type: 'info' as const,
    buttons: ['OK'],
    defaultId: 0,
    noLink: true,
    message,
    detail
  }
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    await dialog.showMessageBox(window, options)
  } else {
    await dialog.showMessageBox(options)
  }
}

/** 003_015_billing_core.txt「招待を受けて、別の account に入る」。請求が続いている間は招待を受けられない */
async function showInviteBlocked(providers: string[]): Promise<void> {
  if (inviteBlockedNoticeShown) {
    return
  }
  inviteBlockedNoticeShown = true
  const { locale } = await getSettings()
  await showNotice(
    translate(locale, 'account.invite_blocked_title'),
    translate(locale, 'account.invite_blocked_message', {
      providers: providers.length > 0 ? providers.join(' / ') : '?'
    })
  )
}

async function confirmInvite(ownerEmail: string | null): Promise<boolean> {
  const { locale } = await getSettings()
  const options = {
    type: 'question' as const,
    buttons: [
      translate(locale, 'account.join_invite_accept'),
      translate(locale, 'account.join_invite_decline')
    ],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: translate(locale, 'account.join_invite_title'),
    detail: translate(locale, 'account.join_invite_message', { ownerEmail: ownerEmail ?? '?' })
  }
  const window = BrowserWindow.getFocusedWindow()
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

/**
 * 招待の確認（モバイル版の checkForInvite と同じ）。匿名のままなら何もしない。
 * 招待があれば「参加しますか？」を出す。招待が無く accountId も無ければ、account を作る。
 */
async function doCheckForInvite(): Promise<void> {
  if (!currentEmail || !currentCache) {
    return
  }

  const joined = await callFunction<{
    joined: boolean
    accountId?: string
    pendingInvite?: { accountId: string; ownerEmail: string | null }
    blockedByBilling?: { providers: string[] }
  }>('joinAccount')

  if (joined.blockedByBilling) {
    logInfo('account', 'invite is blocked while billing is active')
    await showInviteBlocked(joined.blockedByBilling.providers)
    return
  }

  if (joined.joined && joined.accountId) {
    await updateCachedAccountId(joined.accountId)
    return
  }

  if (joined.pendingInvite) {
    const accept = await confirmInvite(joined.pendingInvite.ownerEmail)
    let responded: { joined: boolean; accountId?: string }
    try {
      responded = await callFunction<{ joined: boolean; accountId?: string }>('respondToInvite', {
        accept
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('BILLING_ACTIVE')) {
        // 確認を出した後に、課金が始まった時など。サーバーのメッセージの（）の中が決済元
        const providers = /\(([^)]+)\)/.exec(message)?.[1]?.split(', ') ?? []
        await showInviteBlocked(providers)
        return
      }
      throw error
    }
    if (responded.joined && responded.accountId) {
      await updateCachedAccountId(responded.accountId)
      return
    }
    if (accept) {
      return
    }
  }

  if (!currentCache.accountId) {
    const created = await callFunction<{ accountId: string }>('createAccount')
    await updateCachedAccountId(created.accountId)
    logInfo('account', 'account created')
  }
}

function checkForInvite(): Promise<void> {
  if (!inviteCheckInflight) {
    inviteCheckInflight = doCheckForInvite().finally(() => {
      inviteCheckInflight = null
    })
  }
  return inviteCheckInflight
}

/**
 * 002_005_flow.txt「起動時の判定順」① 〜 ③。
 * 通信できない時は、キャッシュを信じる（未策定 J）。キャッシュも無ければ、次の起動でやり直す。
 */
export async function initializeAccount(): Promise<void> {
  const session = await loadAccountSession()
  let uid: string | null = session?.uid ?? null
  currentEmail = session?.email ?? null

  // ① ログイン中の uid があるか
  if (session) {
    try {
      await adoptTokens(await refreshTokens(session.refreshToken))
    } catch (error) {
      if (!(error instanceof InvalidSessionError)) {
        logWarn('account', 'session refresh failed; using cache', error)
        currentCache = await loadAccountCache(session.uid)
        notifyStatusChanged()
        return
      }
      logInfo('account', 'session is no longer valid; creating a new anonymous user')
      await clearAccountSession()
      currentEmail = null
      uid = null
    }
  }

  if (!uid) {
    const tokens = await signUpAnonymous()
    await adoptTokens(tokens)
    uid = tokens.uid
    logInfo('account', 'anonymous user created')
  }

  // ② 通信できる時は、③ 端末を登録して、サーバーの日付を取り直す（キャッシュの書き換えを効かなくする）
  const cached = await loadAccountCache(uid)

  // 開発中のテスト用。キャッシュだけで判定する（配布版では効かない）
  if (!app.isPackaged && process.env.FIREMINT_ACCOUNT_CACHE_ONLY === '1') {
    if (cached) {
      logInfo('account', 'cache-only mode for testing')
      currentCache = cached
      notifyStatusChanged()
      return
    }
    logWarn('account', 'cache-only mode: cache is missing or invalid; using server')
  }

  try {
    currentCache = await registerDevice(uid, cached?.latestSubscription ?? null)
  } catch (error) {
    logWarn('account', 'device registration failed; using cache', error)
    currentCache = cached
    notifyStatusChanged()
    return
  }
  notifyStatusChanged()

  try {
    await checkForInvite()
  } catch (error) {
    logWarn('account', 'invite check failed', error)
  }
  await refreshLatestSubscription()
  notifyStatusChanged()
}

/**
 * 002_005_flow.txt「ログアウト」。この PC のログイン情報とキャッシュを消して、新しい匿名ユーザーで始め直す。
 * サーバーのデータには触らない。トライアルは、この PC の日付のまま続く。
 */
export async function signOutOfAccount(): Promise<AccountStatus> {
  await clearAccountSession()
  await clearAccountCache()
  currentTokens = null
  currentEmail = null
  currentCache = null
  currentIsOwner = false
  currentHasStripeCustomer = false
  logInfo('account', 'signed out')

  try {
    await initializeAccount()
  } catch (error) {
    // 通信できない時は、次の起動でやり直す
    logWarn('account', 'account initialization failed after sign-out', error)
  }

  notifyStatusChanged()
  return getAccountStatus()
}

export function getAccountStatus(): AccountStatus {
  const firstUseDate = currentCache?.firstUseDate ?? null
  const now = Date.now()

  return {
    email: currentEmail,
    accountId: currentCache?.accountId ?? null,
    firstUseDate,
    entitlement: computeEntitlement(firstUseDate, currentCache?.latestSubscription ?? null, now),
    trialDaysLeft: firstUseDate === null ? null : computeTrialDaysLeft(firstUseDate, now),
    isOwner: currentIsOwner,
    hasStripeCustomer: currentIsOwner && currentHasStripeCustomer
  }
}

/**
 * ④ Google でログイン。未使用の Google なら昇格、既に別の uid に紐づいていれば合流。
 * モバイル版の linkWithGoogle と同じ順番。
 */
export async function signInWithGoogle(): Promise<AccountSignInResult> {
  try {
    if (!currentTokens || currentEmail) {
      throw new Error('今の状態では Google ログインできません')
    }

    const googleIdToken = await requestGoogleIdToken()
    const linked = await signInWithGoogleIdToken(googleIdToken, await getIdToken())

    if (linked) {
      await adoptTokens(linked)
      logInfo('account', 'anonymous user upgraded to google')
    } else {
      // 合流。用済みの匿名ユーザーは、切り替える前に（まだ自分のセッションのうちに）削除してもらう
      try {
        await callFunction('discardAnonymous')
      } catch (error) {
        // 掃除に失敗しても、ログイン自体は続ける（残骸が残るだけ）
        logWarn('account', 'discardAnonymous failed', error)
      }
      const switched = await signInWithGoogleIdToken(googleIdToken)
      if (!switched) {
        throw new Error('Google でログインできませんでした')
      }
      await adoptTokens(switched)
      currentCache = await registerDevice(switched.uid)
      logInfo('account', 'switched to existing google user')
    }

    await updateUserProfile(currentTokens.uid)
    await checkForInvite()
    await refreshLatestSubscription()
    notifyStatusChanged()
    return { ok: true, status: getAccountStatus() }
  } catch (error) {
    logWarn('account', 'google sign-in failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Google ログインに失敗しました'
    }
  }
}

/**
 * データ削除の後に消す、この PC のファイル（002_005_flow.txt「データ削除」）。
 * extra_ca.pem（ユーザーが自分で置いた証明書）と、ユーザーが選んだ場所に保存したファイルは消さない。
 */
const LOCAL_DATA_FILES = [
  'account_session.json',
  'account_cache.json',
  'google_oauth_tokens.json',
  'google_profiles.json',
  'workspaces.json',
  'saved_queries.json',
  'settings.json'
]

/** この PC のデータを消す。1 つでも消せなければ false */
async function wipeLocalData(): Promise<boolean> {
  let ok = true
  for (const name of LOCAL_DATA_FILES) {
    try {
      await rm(join(app.getPath('userData'), name), { force: true })
    } catch (error) {
      ok = false
      logWarn('account', `could not delete ${name}`, error)
    }
  }
  return ok
}

/**
 * 002_005_flow.txt「データ削除」。確認は画面側で済ませてから呼ぶ。
 * owner は deleteAccount、それ以外は deleteMyData。どちらも app = windows を渡す
 * （003_015_billing_core.txt。Stripe はすぐ解約し、Google Play の請求が続いていれば断られる）。
 * 成功したら、この PC のデータも消して、案内を出してからアプリを閉じる（返らない）。
 * 失敗した時（断られた時を含む）は、この PC の中は何も消さない。
 */
export async function deleteAccountData(): Promise<AccountDeleteDataResult> {
  // settings.json を消す前に、案内の言語を読んでおく
  const { locale } = await getSettings()
  try {
    await callFunction(currentIsOwner ? 'deleteAccount' : 'deleteMyData', { app: 'windows' })
    logInfo('account', 'account data deleted on the server')
  } catch (error) {
    logWarn('account', 'delete account data failed', error)
    const message = error instanceof Error ? error.message : ''
    return {
      ok: false,
      error: message.includes('OTHER_BILLING_ACTIVE')
        ? translate(locale, 'account.delete_other_billing')
        : functionErrorMessage(error, translate(locale, 'account.delete_failed'))
    }
  }

  // ここから先は、サーバーの削除は済んでいる。失敗しても「削除できませんでした」とは出さない
  currentTokens = null
  currentEmail = null
  currentCache = null
  currentIsOwner = false
  currentHasStripeCustomer = false
  const wiped = await wipeLocalData()
  await showNotice(
    translate(locale, 'account.delete_done_title'),
    translate(locale, wiped ? 'account.delete_done' : 'account.delete_done_local_failed')
  )
  // before-quit などで設定を書き戻さないよう、終了の処理を飛ばして閉じる
  app.exit(0)
  return { ok: false, error: '' }
}
