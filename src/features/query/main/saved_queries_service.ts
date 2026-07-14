import { logError, logInfo } from '@shared/logging/logger'
import type {
  SavedQuery,
  SavedQueryResult,
  SaveSavedQueryInput
} from '@features/query/shared/types'
import { loadSavedQueriesStore, saveSavedQueriesStore } from './saved_queries_store'

function toSavedQueryError<T>(error: unknown): SavedQueryResult<T> {
  logError('query:saved', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Saved query operation failed'
  }
}

function createId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function listSavedQueries(
  projectId?: string
): Promise<SavedQueryResult<SavedQuery[]>> {
  try {
    const store = await loadSavedQueriesStore()
    const queries = projectId
      ? store.queries.filter((query) => query.projectId === projectId)
      : store.queries

    const sorted = [...queries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return { ok: true, data: sorted }
  } catch (error) {
    return toSavedQueryError(error)
  }
}

export async function saveSavedQuery(
  input: SaveSavedQueryInput
): Promise<SavedQueryResult<SavedQuery>> {
  try {
    const name = input.name.trim()
    if (!name) {
      throw new Error('名前を入力してください')
    }

    if (!input.source.trim()) {
      throw new Error('クエリコードが空です')
    }

    if (!input.projectId.trim()) {
      throw new Error('projectId がありません')
    }

    const store = await loadSavedQueriesStore()
    const updatedAt = new Date().toISOString()
    const existingIndex = input.id
      ? store.queries.findIndex((query) => query.id === input.id)
      : -1

    let saved: SavedQuery

    if (existingIndex >= 0) {
      const current = store.queries[existingIndex]
      saved = {
        ...current,
        name,
        projectId: input.projectId,
        source: input.source,
        collectionPathHint: input.collectionPathHint ?? current.collectionPathHint,
        updatedAt
      }
      store.queries[existingIndex] = saved
    } else {
      saved = {
        id: createId(),
        name,
        projectId: input.projectId,
        source: input.source,
        collectionPathHint: input.collectionPathHint ?? null,
        updatedAt
      }
      store.queries.push(saved)
    }

    await saveSavedQueriesStore(store)
    logInfo('query:saved', `save id=${saved.id} name=${saved.name} projectId=${saved.projectId}`)
    return { ok: true, data: saved }
  } catch (error) {
    return toSavedQueryError(error)
  }
}

export async function deleteSavedQuery(id: string): Promise<SavedQueryResult<null>> {
  try {
    if (!id.trim()) {
      throw new Error('id がありません')
    }

    const store = await loadSavedQueriesStore()
    const next = store.queries.filter((query) => query.id !== id)

    if (next.length === store.queries.length) {
      throw new Error('保存クエリが見つかりません')
    }

    await saveSavedQueriesStore({ version: 1, queries: next })
    logInfo('query:saved', `delete id=${id}`)
    return { ok: true, data: null }
  } catch (error) {
    return toSavedQueryError(error)
  }
}
