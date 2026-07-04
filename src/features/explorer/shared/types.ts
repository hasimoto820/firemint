export type DocumentSummary = {
  id: string
  path: string
  data: Record<string, unknown>
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

export type ExplorerResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }
