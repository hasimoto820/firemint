import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { SavedQueriesStore } from '@features/query/shared/types'

const STORE_FILE_NAME = 'saved_queries.json'

const EMPTY_STORE: SavedQueriesStore = {
  version: 1,
  queries: []
}

function getStorePath(): string {
  return join(process.cwd(), 'config', STORE_FILE_NAME)
}

export async function loadSavedQueriesStore(): Promise<SavedQueriesStore> {
  const storePath = getStorePath()

  try {
    const raw = await readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SavedQueriesStore>

    if (parsed.version !== 1 || !Array.isArray(parsed.queries)) {
      return { ...EMPTY_STORE, queries: [] }
    }

    return {
      version: 1,
      queries: parsed.queries
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ...EMPTY_STORE, queries: [] }
    }

    throw error
  }
}

export async function saveSavedQueriesStore(store: SavedQueriesStore): Promise<void> {
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8')
}
