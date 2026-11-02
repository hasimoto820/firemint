import { randomBytes } from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { loadGoogleOAuthConfig } from '@features/connection/main/google_oauth_config'

// FireMint へのログインに要るのは、本人とメールアドレスだけ
const SCOPES = ['openid', 'email', 'profile']
const TIMEOUT_MS = 5 * 60 * 1000

export const GOOGLE_SIGN_IN_CANCELED_MESSAGE = 'Google ログインをキャンセルしました'

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
        reject(error ?? new Error('Google ログインに失敗しました'))
      }
    }

    const respond = (res: http.ServerResponse, status: number, message: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<html><body><h1>FireMint</h1><p>${message}</p></body></html>`)
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
          respond(res, 400, 'ログインに失敗しました。アプリからやり直してください。')
          finish(new Error('Google ログインがキャンセルまたは失敗しました'))
          return
        }

        try {
          const { tokens } = await client.getToken(code)
          if (!tokens.id_token) {
            throw new Error('ID トークンを取得できませんでした')
          }
          respond(res, 200, 'ログインが完了しました。アプリに戻ってください。')
          finish(null, tokens.id_token)
        } catch (error) {
          respond(res, 500, 'ログインに失敗しました。アプリからやり直してください。')
          finish(error instanceof Error ? error : new Error('Google ログインに失敗しました'))
        }
      })()
    })

    server.on('error', (error) => finish(error))

    const timeoutId = setTimeout(() => {
      finish(new Error('Google ログインがタイムアウトしました（5分）'))
    }, TIMEOUT_MS)

    cancelActive = () => finish(new Error(GOOGLE_SIGN_IN_CANCELED_MESSAGE))

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
        finish(error instanceof Error ? error : new Error('ブラウザを開けませんでした'))
      })
    })
  })
}
