export type BulkOperationSummary = {
  affectedCount: number
  batchCount: number
}

export type BulkFieldWriteResult = BulkOperationSummary & {
  skippedCount: number
  collisionPaths: string[]
}

export type BulkFieldPreview = {
  items: DiffPreviewItem[]
  /** 実際に変更される予定の件数（見本の 50 件とは別） */
  matchedCount: number
  skippedCount: number
  collisionPaths: string[]
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

export type BulkFieldValueType = 'string' | 'number' | 'boolean' | 'null' | 'timestamp'

export type BulkFieldMode = 'create' | 'update' | 'rename' | 'delete'

export type BulkCreateFieldInput = {
  projectId: string
  collectionPath: string
  field: string
  valueType: BulkFieldValueType
  value: string
  includeSubcollections?: boolean
}

/** コレクション全体のフィールド値を上書き（無いドキュメントにも付与） */
export type BulkUpdateFieldValueInput = {
  projectId: string
  collectionPath: string
  field: string
  valueType: BulkFieldValueType
  value: string
  includeSubcollections?: boolean
}

/** コレクション一段。includeSubcollections で配下も再帰 */
export type BulkRenameFieldInput = {
  projectId: string
  collectionPath: string
  fromField: string
  toField: string
  includeSubcollections?: boolean
}

export type BulkDeleteFieldInput = {
  projectId: string
  collectionPath: string
  field: string
  includeSubcollections?: boolean
}

export type DiffPreviewItem = {
  documentPath: string
  field: string
  before: unknown
  after: unknown
}

