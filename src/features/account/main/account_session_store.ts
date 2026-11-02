import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { logWarn } from '@shared/logging/logger'

const STORE_FILE_NAME = 'account_session.json'

export type AccountSession = {
  uid: string
  refreshToken: string
}

type AccountSessionFile = {
  version: 1
  uid: string
  refreshToken: string
  encrypted: boolean
}

function getStorePath(): string {
  return join(app.getPath('userData'), STORE_FILE_NAME)
}

/** 無い・壊れている・復号できない時は null。 */
export async function loadAccountSession(): Promise<AccountSession | null> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AccountSessionFile>

    if (
      parsed.version !== 1 ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null
    }

    return {
      uid: parsed.uid,
      refreshToken: parsed.encrypted
        ? safeStorage.decryptString(Buffer.from(parsed.refreshToken, 'base64'))
        : parsed.refreshToken
    }
  } catch {
    return null
  }
}

export async function saveAccountSession(session: AccountSession): Promise<void> {
  const encrypted = safeStorage.isEncryptionAvailable()
  if (!encrypted) {
    logWarn('account', 'safeStorage unavailable; storing refresh token as plaintext')
  }

  const file: AccountSessionFile = {
    version: 1,
    uid: session.uid,
    refreshToken: encrypted
      ? safeStorage.encryptString(session.refreshToken).toString('base64')
      : session.refreshToken,
    encrypted
  }
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, `${JSON.stringify(file, null, 2)}\n`, 'utf-8')
}

export async function clearAccountSession(): Promise<void> {
  await rm(getStorePath(), { force: true })
}
