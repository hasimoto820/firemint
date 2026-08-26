import type { ExportDocument } from './types'

export type OfficialDumpSummary = {
  sourcePath: string
  dumpRoot: string
  outputFiles: string[]
  documents: ExportDocument[]
  sourceProjectId: string | null
}

export type OfficialDumpReadResult =
  | {
      ok: true
      data: OfficialDumpSummary
    }
  | {
      ok: false
      error: string
    }

export type OfficialImportInput = {
  projectId: string
  dumpPath: string
}

export type OfficialImportSummary = {
  dumpPath: string
  documentCount: number
  writtenCount: number
  skippedCount: number
  collisionSamples: string[]
  sourceProjectId: string | null
  writtenProjectId: string
}

export type OfficialImportResult =
  | {
      ok: true
      data: OfficialImportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type OfficialImportValidation = {
  dumpPath: string
  documentCount: number
  samplePaths: string[]
  hasCollisions: boolean
  collisionSamples: string[]
  checkedCount: number
  sourceProjectId: string | null
  writtenProjectId: string
}

export type OfficialImportValidationResult =
  | {
      ok: true
      data: OfficialImportValidation
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type OfficialExportKind = 'project' | 'group' | 'collection'

export type OfficialExportInput = {
  projectId: string
  kind: OfficialExportKind
  rootCollectionIds?: string[]
  collectionId?: string
  collectionPath?: string
  includeSubcollections?: boolean
  filePath?: string
}

export type OfficialExportProgress = {
  phase: 'reading' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type OfficialExportSummary = {
  filePath: string
  documentCount: number
  kind: OfficialExportKind
}

export type OfficialExportResult =
  | {
      ok: true
      data: OfficialExportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
