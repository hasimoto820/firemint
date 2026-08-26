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

/** プロジェクトをエクスポート（選んだルート → zip） */
export type ExportProjectInput = {
  projectId: string
  /** エクスポートするルートコレクション ID。空は不可 */
  rootCollectionIds: string[]
  includeSubcollections: boolean
  /** 指定時は保存ダイアログを出さない */
  filePath?: string
}

export type ImportProjectProgress = {
  phase: 'extracting' | 'validating' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}
