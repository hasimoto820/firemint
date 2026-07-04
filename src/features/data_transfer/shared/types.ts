export type ExportDocument = {
  id: string
  path: string
  data: Record<string, unknown>
}

export type ExportCollectionJsonInput = {
  projectId: string
  collectionPath: string
}

export type ExportDocumentsInput = {
  documents: ExportDocument[]
  defaultFileName?: string
}

export type ExportSummary = {
  filePath: string
  documentCount: number
}

export type ExportResult =
  | {
      ok: true
      data: ExportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
