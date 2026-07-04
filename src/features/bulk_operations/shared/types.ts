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
  documentPaths: string[]
}

export type BulkUpdateFieldInput = {
  documentPaths: string[]
  field: string
  value: string
}

export type DiffPreviewItem = {
  documentPath: string
  field: string
  before: unknown
  after: unknown
}
