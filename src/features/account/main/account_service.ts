import { BrowserWindow, dialog, net } from 'electron'
import { translate } from '@shared/i18n/shared/translate'
import { logInfo, logWarn } from '@shared/logging/logger'
import { getSettings } from '@shared/settings/main/service'
import type { AccountSignInResult, AccountStatus } from '@features/account/shared/types'
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

type IdTokenClaims = { email?: string; name?: string }

let currentTokens: FirebaseTokens | null = null
let currentEmail: string | null = null
let currentCache: AccountCache | null = null
let inviteCheckInflight: Promise<void> | null = null

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

/** ③ 端末を登録して、キャッシュを作り直す。 */
async function registerDevice(uid: string): Promise<AccountCache> {
  const result = await callFunction<{ firstUseDate: number; accountId: string | null }>(
    'windows_registerDevice',
    { deviceId: await readMachineGuid() }
  )
  const registered: AccountCache = {
    uid,
    accountId: result.accountId,
    firstUseDate: result.firstUseDate
  }
  await saveAccountCache(registered)
  logInfo('account', 'device registered')
  return registered
}

async function updateCachedAccountId(accountId: string): Promise<void> {
  if (currentCache) {
    currentCache = { ...currentCache, accountId }
    await saveAccountCache(currentCache)
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
  }>('joinAccount')

  if (joined.joined && joined.accountId) {
    await updateCachedAccountId(joined.accountId)
    return
  }

  if (joined.pendingInvite) {
    const accept = await confirmInvite(joined.pendingInvite.ownerEmail)
    const responded = await callFunction<{ joined: boolean; accountId?: string }>(
      'respondToInvite',
      { accept }
    )
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

  // ② この uid の写しがあるか。無ければ ③ 端末を登録する
  currentCache = (await loadAccountCache(uid)) ?? (await registerDevice(uid))

  await checkForInvite()
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
  logInfo('account', 'signed out')

  try {
    await initializeAccount()
  } catch (error) {
    // 通信できない時は、次の起動でやり直す
    logWarn('account', 'account initialization failed after sign-out', error)
  }

  return getAccountStatus()
}

export function getAccountStatus(): AccountStatus {
  return {
    email: currentEmail,
    accountId: currentCache?.accountId ?? null,
    firstUseDate: currentCache?.firstUseDate ?? null
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
    return { ok: true, status: getAccountStatus() }
  } catch (error) {
    logWarn('account', 'google sign-in failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Google ログインに失敗しました'
    }
  }
}
