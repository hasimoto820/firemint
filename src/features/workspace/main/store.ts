import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  defaultWorkspaceEntryColor,
  type WorkspaceEntry,
  type WorkspaceStore
} from '@features/workspace/shared/types'

const STORE_FILE_NAME = 'workspaces.json'

const EMPTY_STORE: WorkspaceStore = {
  version: 1,
  entries: [],
  focusedProjectId: null,
  loadedProjectIds: []
}

function getStorePath(): string {
  return join(process.cwd(), 'config', STORE_FILE_NAME)
}

function normalizeEntry(raw: Partial<WorkspaceEntry> & { id?: string }): WorkspaceEntry | null {
  if (!raw.id) {
    return null
  }

  const authType =
    raw.authType === 'emulator' ? 'emulator' : raw.authType === 'google' ? 'google' : 'serviceAccount'

  return {
    id: raw.id,
    label: raw.label?.trim() || raw.id,
    color: defaultWorkspaceEntryColor(authType, { existing: raw.color }),
    authType,
    serviceAccountPath: raw.serviceAccountPath ?? '',
    googleAccountEmail: raw.googleAccountEmail,
    googleAccountKey: raw.googleAccountKey,
    emulatorHost: raw.emulatorHost,
    emulatorProjectId: raw.emulatorProjectId,
    readOnly: Boolean(raw.readOnly)
  }
}

export async function loadWorkspaceStore(): Promise<WorkspaceStore> {
  const storePath = getStorePath()

  try {
    const raw = await readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceStore>

    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { ...EMPTY_STORE }
    }

    const entries = parsed.entries
      .map((entry) => normalizeEntry(entry as Partial<WorkspaceEntry>))
      .filter((entry): entry is WorkspaceEntry => entry !== null)
      .filter((entry) => entry.authType !== 'emulator')

    const entryIds = new Set(entries.map((entry) => entry.id))
    const focusedProjectId =
      parsed.focusedProjectId && entryIds.has(parsed.focusedProjectId)
        ? parsed.focusedProjectId
        : null
    const loadedFromFile = Array.isArray(parsed.loadedProjectIds)
      ? parsed.loadedProjectIds.filter(
          (id): id is string => typeof id === 'string' && entryIds.has(id)
        )
      : []
    const loadedProjectIds = [
      ...new Set(
        loadedFromFile.length > 0
          ? loadedFromFile
          : focusedProjectId
            ? [focusedProjectId]
            : []
      )
    ]

    return {
      version: 1,
      entries,
      focusedProjectId,
      loadedProjectIds
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ...EMPTY_STORE }
    }

    throw error
  }
}

export async function saveWorkspaceStore(store: WorkspaceStore): Promise<void> {
  const entries = store.entries.filter((entry) => entry.authType !== 'emulator')
  const entryIds = new Set(entries.map((entry) => entry.id))
  const focusedProjectId =
    store.focusedProjectId && entryIds.has(store.focusedProjectId)
      ? store.focusedProjectId
      : null
  const loadedProjectIds = store.loadedProjectIds.filter((id) => entryIds.has(id))
  const persisted: WorkspaceStore = {
    version: 1,
    entries,
    focusedProjectId,
    loadedProjectIds
  }
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(persisted, null, 2), 'utf-8')
}
