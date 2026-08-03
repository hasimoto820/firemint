import http from 'http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { logInfo } from '@shared/logging/logger'
import type { GoogleOAuthConfig } from './google_oauth_config'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/cloud-platform'
]

export type GoogleOAuthSession = {
  email: string
  accountKey: string
  refreshToken: string
  accessToken: string
}

export type GoogleCloudProject = {
  projectId: string
  displayName: string
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('OAuth 用ポートを確保できませんでした'))
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
    throw new Error('Google アカウントの email を取得できませんでした')
  }

  return data.email
}

export const GOOGLE_OAUTH_CANCELED_MESSAGE = 'Google 認証をキャンセルしました'

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
        reject(new Error('OAuth に失敗しました'))
        return
      }

      resolve(value)
    }

    const cancel = (): void => {
      logInfo('connection:google', 'oauth canceled by user')
      finish(new Error(GOOGLE_OAUTH_CANCELED_MESSAGE))
    }

    activeOAuth = { cancel }

    const server = http.createServer((req, res) => {
      void (async () => {
        try {
          if (!req.url) {
            throw new Error('不正な OAuth コールバックです')
          }

          const url = new URL(req.url, `http://127.0.0.1:${port}`)

          if (url.pathname !== '/oauth2callback') {
            res.writeHead(404)
            res.end('Not found')
            return
          }

          const errorParam = url.searchParams.get('error')

          if (errorParam) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`<html><body><h1>認証に失敗しました</h1><p>${errorParam}</p></body></html>`)
            finish(new Error(`Google 認証がキャンセルまたは失敗しました: ${errorParam}`))
            return
          }

          const code = url.searchParams.get('code')

          if (!code) {
            throw new Error('認可コードがありません')
          }

          const tokenResponse = await client.getToken(code)
          const tokens = tokenResponse.tokens

          if (!tokens.access_token) {
            throw new Error('access_token を取得できませんでした')
          }

          if (!tokens.refresh_token) {
            throw new Error(
              'refresh_token を取得できませんでした。Google Cloud の同意画面で再同意するか、prompt=consent を確認してください。'
            )
          }

          const email = await fetchAccountEmail(tokens.access_token)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(
            '<html><body><h1>FireMint</h1><p>認証が完了しました。アプリに戻ってください。</p></body></html>'
          )

          finish(null, {
            email,
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token
          })
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body><h1>認証エラー</h1><p>アプリ側のログを確認してください。</p></body></html>')
          finish(error instanceof Error ? error : new Error('OAuth コールバック処理に失敗しました'))
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
        finish(error instanceof Error ? error : new Error('ブラウザを開けませんでした'))
      })
    })

    const timeoutId = setTimeout(() => {
      finish(new Error('Google 認証がタイムアウトしました（5分）'))
    }, 5 * 60 * 1000)
  })
}

export async function listGoogleCloudProjects(accessToken: string): Promise<GoogleCloudProject[]> {
  const projects: GoogleCloudProject[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://cloudresourcemanager.googleapis.com/v1/projects')
    url.searchParams.set('filter', 'lifecycleState:ACTIVE')
    url.searchParams.set('pageSize', '100')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    let data: {
      projects?: Array<{ projectId?: string; name?: string }>
      nextPageToken?: string
    }

    try {
      data = await googleApiGet(accessToken, url.toString())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`プロジェクト一覧の取得に失敗しました: ${detail}`)
    }

    for (const project of data.projects ?? []) {
      if (!project.projectId) {
        continue
      }

      projects.push({
        projectId: project.projectId,
        displayName: project.name ?? project.projectId
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  projects.sort((left, right) => left.projectId.localeCompare(right.projectId))
  return projects
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string
): Promise<string> {
  const client = new OAuth2Client(config.clientId, config.clientSecret)
  client.setCredentials({ refresh_token: refreshToken })
  const response = await client.getAccessToken()
  const token = typeof response.token === 'string' ? response.token : response.token ?? null

  if (!token) {
    throw new Error('access_token の更新に失敗しました。再サインインしてください。')
  }

  return token
}
