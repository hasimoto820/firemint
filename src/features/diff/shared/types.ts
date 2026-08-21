export type CollectionDiffStatus = 'json_only' | 'collection_only' | 'changed'

export type CollectionDiffInput = {
  projectId: string
  collectionPath: string
  filePath: string
  includeSubcollections: boolean
}

export type CollectionDiffProgress = {
  phase: 'loading' | 'reading' | 'comparing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type CollectionDiffRow = {
  id: string
  path: string
  collectionPath: string
  status: CollectionDiffStatus
  json: Record<string, unknown> | null
  collection: Record<string, unknown> | null
}

export type CollectionDiffSummary = {
  projectId: string
  collectionPath: string
  filePath: string
  includeSubcollections: boolean
  jsonCount: number
  collectionCount: number
  sameCount: number
  jsonOnlyCount: number
  collectionOnlyCount: number
  changedCount: number
  missingIdCount: number
  skippedOutsideCount: number
  rows: CollectionDiffRow[]
}

export type CollectionDiffResult =
  | {
      ok: true
      data: CollectionDiffSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type PeekDiffJsonResult =
  | {
      ok: true
      collectionPath: string | null
    }
  | {
      ok: false
      error: string
    }

export type DiffExportResult =
  | {
      ok: true
      data: { filePath: string }
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
