export type DiffRowStatus = 'dump_only' | 'project_only' | 'changed'

export type DumpDiffInput = {
  projectId: string
  dumpPath: string
}

export type DiffProgress = {
  phase: 'loading' | 'reading' | 'comparing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type DiffRow = {
  id: string
  path: string
  collectionPath: string
  status: DiffRowStatus
  dump: Record<string, unknown> | null
  project: Record<string, unknown> | null
}

export type DiffSummary = {
  projectId: string
  dumpPath: string
  sourceProjectId: string | null
  dumpCount: number
  projectCount: number
  sameCount: number
  dumpOnlyCount: number
  projectOnlyCount: number
  changedCount: number
  rows: DiffRow[]
}

export type DumpDiffResult =
  | {
      ok: true
      data: DiffSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type PeekDiffDumpResult =
  | {
      ok: true
      documentCount: number
      samplePaths: string[]
      sourceProjectId: string | null
    }
  | {
      ok: false
      error: string
    }

export type DiffExportFormat = 'json' | 'csv'

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
