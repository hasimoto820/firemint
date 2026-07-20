export type BulkOperationSummary = {
  affectedCount: number
  batchCount: number
}

export type BulkResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type BulkDeleteInput = {
  projectId: string
  documentPaths: string[]
}

export type BulkUpdateFieldInput = {
  projectId: string
  documentPaths: string[]
  field: string
  value: string
}

/** コレクション一段の全ドキュメントが対象（サブコレは含まない） */
export type BulkRenameFieldInput = {
  projectId: string
  collectionPath: string
  fromField: string
  toField: string
}

/** コレクション一段の全ドキュメントが対象（サブコレは含まない） */
export type BulkDeleteFieldInput = {
  projectId: string
  collectionPath: string
  field: string
}

export type DiffPreviewItem = {
  documentPath: string
  field: string
  before: unknown
  after: unknown
}
