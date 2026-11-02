import { net } from 'electron'
import { FIREBASE_API_KEY } from './firebase_config'

export type FirebaseTokens = {
  uid: string
  idToken: string
  refreshToken: string
  expiresAt: number
}

/** ログイン情報が無効（ユーザーの削除など）。やり直しても通らない。通信の失敗はこれにしない。 */
export class InvalidSessionError extends Error {}

// この値が返ったら、refresh token はもう使えない
const INVALID_SESSION_MESSAGES = [
  'TOKEN_EXPIRED',
  'USER_DISABLED',
  'USER_NOT_FOUND',
  'INVALID_REFRESH_TOKEN'
]

// この値が返ったら、その Google は既に別の uid に紐づいている
const ALREADY_LINKED_MESSAGES = ['FEDERATED_USER_ID_ALREADY_LINKED', 'EMAIL_EXISTS']

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function toExpiresAt(expiresInSeconds: string): number {
  return Date.now() + Number(expiresInSeconds) * 1000
}

export async function signUpAnonymous(): Promise<FirebaseTokens> {
  const response = await net.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    }
  )

  if (!response.ok) {
    throw new Error(`匿名ユーザーを作成できませんでした: ${await readErrorMessage(response)}`)
  }

  const body = (await response.json()) as {
    localId: string
    idToken: string
    refreshToken: string
    expiresIn: string
  }

  return {
    uid: body.localId,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: toExpiresAt(body.expiresIn)
  }
}

/**
 * Google の ID トークンで Firebase Auth にログインする。
 * currentIdToken を渡すと、そのユーザーに Google を紐付ける（昇格）。
 * その Google が既に別の uid に紐づいている時は、null を返す（合流）。
 */
export async function signInWithGoogleIdToken(
  googleIdToken: string,
  currentIdToken?: string
): Promise<FirebaseTokens | null> {
  const response = await net.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        postBody: new URLSearchParams({
          id_token: googleIdToken,
          providerId: 'google.com'
        }).toString(),
        returnSecureToken: true,
        ...(currentIdToken ? { idToken: currentIdToken } : {})
      })
    }
  )

  if (!response.ok) {
    const message = await readErrorMessage(response)
    if (currentIdToken && ALREADY_LINKED_MESSAGES.includes(message)) {
      return null
    }
    throw new Error(`Google でログインできませんでした: ${message}`)
  }

  const body = (await response.json()) as {
    localId: string
    idToken: string
    refreshToken: string
    expiresIn: string
  }

  return {
    uid: body.localId,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: toExpiresAt(body.expiresIn)
  }
}

export async function refreshTokens(refreshToken: string): Promise<FirebaseTokens> {
  const response = await net.fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }).toString()
    }
  )

  if (!response.ok) {
    const message = await readErrorMessage(response)
    if (INVALID_SESSION_MESSAGES.includes(message)) {
      throw new InvalidSessionError(message)
    }
    throw new Error(`ログイン情報を更新できませんでした: ${message}`)
  }

  const body = (await response.json()) as {
    user_id: string
    id_token: string
    refresh_token: string
    expires_in: string
  }

  return {
    uid: body.user_id,
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    expiresAt: toExpiresAt(body.expires_in)
  }
}
