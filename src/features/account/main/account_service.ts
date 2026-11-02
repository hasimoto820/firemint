import { net } from 'electron'
import { logInfo, logWarn } from '@shared/logging/logger'
import { loadAccountCache, saveAccountCache, type AccountCache } from './account_cache'
import {
  clearAccountSession,
  loadAccountSession,
  saveAccountSession
} from './account_session_store'
import {
  InvalidSessionError,
  refreshTokens,
  signUpAnonymous,
  type FirebaseTokens
} from './firebase_auth_api'
import { FIREBASE_PROJECT_ID, FUNCTIONS_REGION } from './firebase_config'
import { readMachineGuid } from './machine_guid'

// 有効期限の少し前に更新する
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000

let currentTokens: FirebaseTokens | null = null

async function adoptTokens(tokens: FirebaseTokens): Promise<void> {
  currentTokens = tokens
  await saveAccountSession({ uid: tokens.uid, refreshToken: tokens.refreshToken })
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

async function callFunction<T>(name: string, data: unknown): Promise<T> {
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

/**
 * 002_005_flow.txt「起動時の判定順」① 〜 ③。
 * 通信できない時は、キャッシュを信じる（未策定 J）。キャッシュも無ければ null（次の起動でやり直す）。
 */
export async function initializeAccount(): Promise<AccountCache | null> {
  const session = await loadAccountSession()
  let uid: string | null = session?.uid ?? null

  // ① ログイン中の uid があるか
  if (session) {
    try {
      await adoptTokens(await refreshTokens(session.refreshToken))
    } catch (error) {
      if (!(error instanceof InvalidSessionError)) {
        logWarn('account', 'session refresh failed; using cache', error)
        return loadAccountCache(session.uid)
      }
      logInfo('account', 'session is no longer valid; creating a new anonymous user')
      await clearAccountSession()
      uid = null
    }
  }

  if (!uid) {
    const tokens = await signUpAnonymous()
    await adoptTokens(tokens)
    uid = tokens.uid
    logInfo('account', 'anonymous user created')
  }

  // ② この uid の写しがあるか
  const cache = await loadAccountCache(uid)
  if (cache) {
    return cache
  }

  // ③ 端末を登録する
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
