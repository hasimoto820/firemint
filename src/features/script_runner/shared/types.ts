import type {
  ExportCollectionJsonInput,
  ExportProjectInput,
  ImportCollectionJsonInput,
  ImportProjectInput
} from '@features/data_transfer/shared/types'
import type { OfficialImportInput } from '@features/data_transfer/shared/official'
import type { TransportInput } from '@features/transport/shared/types'

export type ScriptJobKind =
  | 'export_collection'
  | 'export_group'
  | 'import_collection'
  | 'export_project'
  | 'import_project'
  | 'import_official'
  | 'transport'

export type ScriptJobStatus = 'running' | 'succeeded' | 'failed' | 'canceled'

export type ScriptJobLogLine = {
  at: string
  level: 'info' | 'error'
  message: string
}

export type ScriptJobSnapshot = {
  id: string
  kind: ScriptJobKind
  status: ScriptJobStatus
  title: string
  percent: number
  detail: string | null
  logs: ScriptJobLogLine[]
  error: string | null
  resultSummary: string | null
  /** Import で途中まで書いた件数。Export は null */
  writtenCount: number | null
}

export type StartScriptJobInput =
  | ({ kind: 'export_collection' } & ExportCollectionJsonInput)
  | ({ kind: 'export_group'; projectId: string; collectionId: string; filePath?: string })
  | ({ kind: 'import_collection' } & ImportCollectionJsonInput)
  | ({ kind: 'export_project' } & ExportProjectInput)
  | ({ kind: 'import_project' } & ImportProjectInput)
  | ({ kind: 'import_official' } & OfficialImportInput)
  | ({ kind: 'transport' } & TransportInput)

export type StartScriptJobResult =
  | {
      ok: true
      data: { id: string }
    }
  | {
      ok: false
      error: string
      canceled?: boolean
      busy?: boolean
    }

export type CancelScriptJobResult = {
  ok: true
}
