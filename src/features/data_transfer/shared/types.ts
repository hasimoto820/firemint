export type ExportDocument = {
  id: string
  path: string
  data: Record<string, unknown>
}

export type ExportCollectionJsonInput = {
  projectId: string
  collectionPath: string
  /**
   * true = 配下サブコレクションも再帰 export。
   * undefined = 実行前に確認ダイアログで選ぶ（デフォルトは除外）。
   */
  includeSubcollections?: boolean
}

export type ExportDocumentsInput = {
  documents: ExportDocument[]
  defaultFileName?: string
}

export type ExportSummary = {
  filePath: string
  documentCount: number
  includeSubcollections: boolean
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
