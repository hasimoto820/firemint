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
}

export type DuplicateDocumentInput = {
  projectId: string
  documentPath: string
  targetDocumentId?: string
}

export type DuplicateCollectionInput = {
  projectId: string
  sourceCollectionPath: string
  targetCollectionPath: string
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

export type ExplorerResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }
