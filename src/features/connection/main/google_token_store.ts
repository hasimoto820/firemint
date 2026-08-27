import { safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { logInfo, logWarn } from '@shared/logging/logger'

type TokenStoreFile = {
  version: 1
  accounts: Record<
    string,
    {
      email: string
      refreshToken: string
      encrypted: boolean
    }
  >
}

const EMPTY_STORE: TokenStoreFile = {
  version: 1,
  accounts: {}
}

function getStorePath(): string {
  return join(process.cwd(), 'config', 'google_oauth_tokens.json')
}

function encodeToken(refreshToken: string): { value: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      value: safeStorage.encryptString(refreshToken).toString('base64'),
      encrypted: true
    }
  }

  logWarn('connection:google', 'safeStorage unavailable; storing refresh token as plaintext')
  return { value: refreshToken, encrypted: false }
}

function decodeToken(value: string, encrypted: boolean): string {
  if (!encrypted) {
    return value
  }

  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}

async function loadStore(): Promise<TokenStoreFile> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TokenStoreFile>

    if (parsed.version !== 1 || !parsed.accounts || typeof parsed.accounts !== 'object') {
      return { ...EMPTY_STORE, accounts: {} }
    }

    return {
      version: 1,
      accounts: parsed.accounts
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ...EMPTY_STORE, accounts: {} }
    }

    throw error
  }
}

async function saveStore(store: TokenStoreFile): Promise<void> {
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8')
}

export async function saveGoogleRefreshToken(email: string, refreshToken: string): Promise<string> {
  const key = email.trim().toLowerCase()
  const store = await loadStore()
  const encoded = encodeToken(refreshToken)

  store.accounts[key] = {
    email: email.trim(),
    refreshToken: encoded.value,
    encrypted: encoded.encrypted
  }

  await saveStore(store)
  logInfo('connection:google', 'refresh token saved')
  return key
}

export async function loadGoogleRefreshToken(accountKey: string): Promise<string | null> {
  const store = await loadStore()
  const entry = store.accounts[accountKey.trim().toLowerCase()]

  if (!entry) {
    return null
  }

  return decodeToken(entry.refreshToken, entry.encrypted)
}

export async function removeGoogleRefreshToken(accountKey: string): Promise<void> {
  const store = await loadStore()
  const key = accountKey.trim().toLowerCase()

  if (!store.accounts[key]) {
    return
  }

  delete store.accounts[key]
  await saveStore(store)
}
