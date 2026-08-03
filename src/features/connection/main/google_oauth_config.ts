import { readFile } from 'fs/promises'
import { join } from 'path'
import { logInfo } from '@shared/logging/logger'

export type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
}

function getConfigPath(): string {
  return join(process.cwd(), 'config', 'google_oauth.json')
}

export async function loadGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
  const envClientId = process.env.FIREMINT_GOOGLE_CLIENT_ID?.trim()
  const envClientSecret = process.env.FIREMINT_GOOGLE_CLIENT_SECRET?.trim()

  if (envClientId && envClientSecret) {
    logInfo('connection:google', 'oauth config loaded from env')
    return { clientId: envClientId, clientSecret: envClientSecret }
  }

  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<GoogleOAuthConfig>
    const clientId = parsed.clientId?.trim()
    const clientSecret = parsed.clientSecret?.trim()

    if (!clientId || !clientSecret) {
      throw new Error('google_oauth.json に clientId / clientSecret がありません')
    }

    logInfo('connection:google', 'oauth config loaded from config/google_oauth.json')
    return { clientId, clientSecret }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'Google OAuth 設定がありません。config/google_oauth.json を置くか、FIREMINT_GOOGLE_CLIENT_ID / FIREMINT_GOOGLE_CLIENT_SECRET を設定してください。'
      )
    }

    throw error
  }
}
