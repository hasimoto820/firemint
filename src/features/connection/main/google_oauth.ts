import { tr } from '@shared/i18n/shared/current'
import http from 'http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { logInfo } from '@shared/logging/logger'
import { sendOAuthCallbackPage } from './oauth_callback_page'
import type { GoogleOAuthConfig } from './google_oauth_config'

// Firestore と Authentication の操作に要るものだけ（002_004 の 11）
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit'
]

export type GoogleOAuthSession = {
  email: string
  accountKey: string
  refreshToken: string
  accessToken: string
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error(tr('conn.err_oauth_port')))
        return
      }

      const port = address.port
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
    server.on('error', reject)
  })
}

/**
 * Node の global fetch（undici）は win-ca の CA 注入を拾わないことがある。
 * google-auth-library（gaxios / https）経由なら既存の TLS 設定と揃う。
 */
async function googleApiGet<T>(accessToken: string, url: string): Promise<T> {
  const client = new OAuth2Client()
  client.setCredentials({ access_token: accessToken })
  const response = await client.request<T>({ url })
  return response.data
}

async function fetchAccountEmail(accessToken: string): Promise<string> {
  const data = await googleApiGet<{ email?: string }>(
    accessToken,
    'https://www.googleapis.com/oauth2/v2/userinfo'
  )

  if (!data.email) {
    throw new Error(tr('conn.err_no_email'))
  }

  return data.email
}

/** キャンセルの時のメッセージ。比べる側も同じ関数で作るので、言語が変わっても一致する */
export function googleOAuthCanceledMessage(): string {
  return tr('conn.google_canceled')
}

type ActiveOAuthSession = {
  cancel: () => void
}

let activeOAuth: ActiveOAuthSession | null = null

export function cancelGoogleOAuthLogin(): void {
  activeOAuth?.cancel()
}

export async function runGoogleOAuthLogin(config: GoogleOAuthConfig): Promise<{
  email: string
  refreshToken: string
  accessToken: string
}> {
  cancelGoogleOAuthLogin()

  const port = await getFreePort()
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const client = new OAuth2Client(config.clientId, config.clientSecret, redirectUri)

  logInfo('connection:google', `oauth start redirect=${redirectUri}`)

  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (
      error: Error | null,
      value?: { email: string; refreshToken: string; accessToken: string }
    ): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutId)
      if (activeOAuth?.cancel === cancel) {
        activeOAuth = null
      }
      server.close()

      if (error) {
        reject(error)
        return
      }

      if (!value) {
        reject(new Error(tr('conn.err_oauth')))
        return
      }

      resolve(value)
    }

    const cancel = (): void => {
      logInfo('connection:google', 'oauth canceled by user')
      finish(new Error(googleOAuthCanceledMessage()))
    }

    activeOAuth = { cancel }

    const server = http.createServer((req, res) => {
      void (async () => {
        try {
          if (!req.url) {
            throw new Error(tr('conn.err_bad_callback'))
          }

          const url = new URL(req.url, `http://127.0.0.1:${port}`)

          if (url.pathname !== '/oauth2callback') {
            res.writeHead(404)
            res.end('Not found')
            return
          }

          const errorParam = url.searchParams.get('error')

          if (errorParam) {
            await sendOAuthCallbackPage(res, 400, 'failed', errorParam)
            finish(new Error(tr('conn.err_google_failed', { error: errorParam })))
            return
          }

          const code = url.searchParams.get('code')

          if (!code) {
            throw new Error(tr('conn.err_no_code'))
          }

          const tokenResponse = await client.getToken(code)
          const tokens = tokenResponse.tokens

          if (!tokens.access_token) {
            throw new Error(tr('conn.err_no_access_token'))
          }

          if (!tokens.refresh_token) {
            throw new Error(tr('conn.err_no_refresh_token'))
          }

          const email = await fetchAccountEmail(tokens.access_token)

          await sendOAuthCallbackPage(res, 200, 'done')

          finish(null, {
            email,
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token
          })
        } catch (error) {
          await sendOAuthCallbackPage(res, 500, 'failed')
          finish(error instanceof Error ? error : new Error(tr('conn.err_callback')))
        }
      })()
    })

    server.on('error', (error) => {
      finish(error)
    })

    server.listen(port, '127.0.0.1', () => {
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      })

      void shell.openExternal(authUrl).catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error(tr('conn.err_open_browser')))
      })
    })

    const timeoutId = setTimeout(
      () => {
        finish(new Error(tr('conn.err_google_timeout')))
      },
      5 * 60 * 1000
    )
  })
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string
): Promise<string> {
  const client = new OAuth2Client(config.clientId, config.clientSecret)
  client.setCredentials({ refresh_token: refreshToken })
  const response = await client.getAccessToken()
  const token = typeof response.token === 'string' ? response.token : (response.token ?? null)

  if (!token) {
    throw new Error(tr('conn.err_refresh'))
  }

  return token
}
