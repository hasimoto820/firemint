import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { logInfo } from '@shared/logging/logger'
import { DEFAULT_ENTRY_COLOR } from '@features/workspace/shared/types'

export type GoogleProjectProfile = {
  label: string
  color: string
  readOnly: boolean
}

export type GoogleAccountProfile = {
  email: string
  lastFocusedProjectId: string | null
  projects: Record<string, GoogleProjectProfile>
  updatedAt: string
}

type GoogleProfileStoreFile = {
  version: 1
  accounts: Record<string, GoogleAccountProfile>
}

const EMPTY_STORE: GoogleProfileStoreFile = {
  version: 1,
  accounts: {}
}

function getStorePath(): string {
  return join(process.cwd(), 'config', 'google_profiles.json')
}

function normalizeKey(accountKey: string): string {
  return accountKey.trim().toLowerCase()
}

async function loadStore(): Promise<GoogleProfileStoreFile> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<GoogleProfileStoreFile>

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

async function saveStore(store: GoogleProfileStoreFile): Promise<void> {
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8')
}

export async function loadGoogleAccountProfile(
  accountKey: string
): Promise<GoogleAccountProfile | null> {
  const store = await loadStore()
  return store.accounts[normalizeKey(accountKey)] ?? null
}

export async function saveGoogleAccountProfile(
  accountKey: string,
  profile: Omit<GoogleAccountProfile, 'updatedAt'> & { updatedAt?: string }
): Promise<void> {
  const store = await loadStore()
  const key = normalizeKey(accountKey)

  store.accounts[key] = {
    email: profile.email,
    lastFocusedProjectId: profile.lastFocusedProjectId,
    projects: profile.projects,
    updatedAt: profile.updatedAt ?? new Date().toISOString()
  }

  await saveStore(store)
  logInfo(
    'connection:google',
    `profile saved projects=${Object.keys(profile.projects).length}`
  )
}

export async function patchGoogleProjectProfile(
  accountKey: string,
  email: string,
  projectId: string,
  patch: Partial<GoogleProjectProfile> & { lastFocused?: boolean }
): Promise<void> {
  const store = await loadStore()
  const key = normalizeKey(accountKey)
  const existing = store.accounts[key]
  const projects = { ...(existing?.projects ?? {}) }
  const current = projects[projectId] ?? {
    label: projectId,
    color: DEFAULT_ENTRY_COLOR,
    readOnly: false
  }

  projects[projectId] = {
    label: patch.label ?? current.label,
    color: patch.color ?? current.color,
    readOnly: patch.readOnly ?? current.readOnly
  }

  store.accounts[key] = {
    email: email || existing?.email || key,
    lastFocusedProjectId: patch.lastFocused
      ? projectId
      : (existing?.lastFocusedProjectId ?? null),
    projects,
    updatedAt: new Date().toISOString()
  }

  await saveStore(store)
}
