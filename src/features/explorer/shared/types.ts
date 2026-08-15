export type DocumentSummary = {
  id: string
  path: string
  data: Record<string, unknown>
  createTime: string | null
  updateTime: string | null
}

export type DocumentDetail = DocumentSummary

export type CreateDocumentInput = {
  projectId: string
  collectionPath: string
  data: Record<string, unknown>
  documentId?: string
}

export type UpdateDocumentInput = {
  projectId: string
  documentPath: string
  data: Record<string, unknown>
  /** 開いた時点の updateTime（ISO）。指定時は一致しないと conflict */
  expectedUpdateTime?: string | null
  /** true ならコンフリクト検出をスキップして上書き */
  forceOverwrite?: boolean
}

export type DuplicateDocumentInput = {
  projectId: string
  documentPath: string
  targetDocumentId?: string
  includeSubcollections?: boolean
}

export type DuplicateCollectionInput = {
  projectId: string
  sourceCollectionPath: string
  targetCollectionPath: string
  includeSubcollections?: boolean
}

export type DuplicateCollectionResult = {
  copiedCount: number
  targetCollectionPath: string
}

export type RenameCollectionInput = {
  projectId: string
  sourceCollectionPath: string
  targetCollectionPath: string
}

export type RenameCollectionResult = {
  movedCount: number
  targetCollectionPath: string
}

export type CreateCollectionInput = {
  projectId: string
  collectionId: string
}

export type CreateCollectionResult = {
  collectionPath: string
  documentId: string
}

export type CreateSubcollectionInput = {
  projectId: string
  documentPath: string
  subcollectionId: string
}

export type CreateSubcollectionResult = {
  subcollectionPath: string
  documentId: string
}

export type DeleteCollectionInput = {
  projectId: string
  collectionPath: string
}

export type DeleteCollectionResult = {
  deletedDocumentCount: number
}

export type ExplorerResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
      /** 保存時コンフリクトなど、UI が分岐するためのコード */
      code?: 'conflict'
      /** サーバ側の現在 updateTime（conflict 時） */
      currentUpdateTime?: string | null
    }
