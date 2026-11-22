import { tr } from '@shared/i18n/shared/current'
import { randomBytes } from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { loadGoogleOAuthConfig } from '@features/connection/main/google_oauth_config'
import { sendOAuthCallbackPage } from '@features/connection/main/oauth_callback_page'

// FireMint へのログインに要るのは、本人とメールアドレスだけ
const SCOPES = ['openid', 'email', 'profile']
const TIMEOUT_MS = 5 * 60 * 1000

export function googleSignInCanceledMessage(): string {
  return tr('account.google_sign_in_canceled')
}

let cancelActive: (() => void) | null = null

export function cancelGoogleIdTokenRequest(): void {
  cancelActive?.()
}

/**
 * 002_005_flow.txt「Google ログイン」。ブラウザでログインして、アプリ（127.0.0.1）に戻り、
 * Google の ID トークンを受け取る。
 */
export async function requestGoogleIdToken(): Promise<string> {
  const config = await loadGoogleOAuthConfig()
  const state = randomBytes(16).toString('hex')

  return new Promise((resolve, reject) => {
    let client: OAuth2Client

    const finish = (error: Error | null, idToken?: string): void => {
      clearTimeout(timeoutId)
      cancelActive = null
      server.close()
      if (idToken) {
        resolve(idToken)
      } else {
        reject(error ?? new Error(tr('account.err_google_sign_in_failed')))
      }
    }

    const server = http.createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const code = url.searchParams.get('code')
        if (url.searchParams.get('state') !== state || !code) {
          await sendOAuthCallbackPage(res, 400, 'failed')
          finish(new Error(tr('account.err_google_canceled_or_failed')))
          return
        }

        try {
          const { tokens } = await client.getToken(code)
          if (!tokens.id_token) {
            throw new Error(tr('account.err_no_id_token'))
          }
          await sendOAuthCallbackPage(res, 200, 'done')
          finish(null, tokens.id_token)
        } catch (error) {
          await sendOAuthCallbackPage(res, 500, 'failed')
          finish(
            error instanceof Error ? error : new Error(tr('account.err_google_sign_in_failed'))
          )
        }
      })()
    })

    server.on('error', (error) => finish(error))

    const timeoutId = setTimeout(() => {
      finish(new Error(tr('account.err_google_timeout')))
    }, TIMEOUT_MS)

    cancelActive = () => finish(new Error(googleSignInCanceledMessage()))

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      client = new OAuth2Client(
        config.clientId,
        config.clientSecret,
        `http://127.0.0.1:${port}/oauth2callback`
      )
      const authUrl = client.generateAuthUrl({
        scope: SCOPES,
        state,
        prompt: 'select_account'
      })
      void shell.openExternal(authUrl).catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error(tr('conn.err_open_browser')))
      })
    })
  })
}
