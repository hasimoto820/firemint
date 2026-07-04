import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { WorkspaceStore } from '@features/workspace/shared/types'

const STORE_FILE_NAME = 'workspaces.json'

const EMPTY_STORE: WorkspaceStore = {
  version: 1,
  entries: [],
  focusedProjectId: null
}

function getStorePath(): string {
  return join(process.cwd(), 'config', STORE_FILE_NAME)
}

export async function loadWorkspaceStore(): Promise<WorkspaceStore> {
  const storePath = getStorePath()

  try {
    const raw = await readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceStore>

    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { ...EMPTY_STORE }
    }

    return {
      version: 1,
      entries: parsed.entries,
      focusedProjectId: parsed.focusedProjectId ?? null
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ...EMPTY_STORE }
    }

    throw error
  }
}

export async function saveWorkspaceStore(store: WorkspaceStore): Promise<void> {
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8')
}
