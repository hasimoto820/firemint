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

/** Import 1 件分（ファイル上）。id / path は省略可 */
export type ImportDocument = {
  id?: string
  path?: string
  data: Record<string, unknown>
}

export type ImportCollectionJsonInput = {
  projectId: string
  collectionPath: string
  filePath: string
  /** true = path が配下サブコレのものも書く */
  includeSubcollections: boolean
}

export type ImportCollectionProgress = {
  phase: 'loading' | 'validating' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type ImportCollectionValidation = {
  filePath: string
  writeCount: number
  skippedOutsideCount: number
  includeSubcollections: boolean
  existingIdCount: number
  autoIdCount: number
  hasCollisions: boolean
  collisionSamples: string[]
  checkedCount: number
}

export type ImportCollectionValidationResult =
  | {
      ok: true
      data: ImportCollectionValidation
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type ImportSummary = {
  writtenCount: number
  skippedOutsideCount: number
  includeSubcollections: boolean
  filePath: string
}

export type ImportResult =
  | {
      ok: true
      data: ImportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

/** プロジェクトをエクスポート（選んだルート → zip） */
export type ExportProjectInput = {
  projectId: string
  /** エクスポートするルートコレクション ID。空は不可 */
  rootCollectionIds: string[]
  includeSubcollections: boolean
}

export type ExportProjectProgress = {
  phase: 'reading' | 'zipping' | 'done'
  documentCount: number
  currentCollectionPath: string | null
  completedRootCount: number
  totalRootCount: number
  /** 0–100。ルート消化ベース（zip 中は 95、完了は 100） */
  percent: number
}

export type ExportProjectManifest = {
  version: 1
  kind: 'firemint-project-export'
  projectId: string
  createdAt: string
  includeSubcollections: boolean
  rootCollectionIds: string[]
  documentCount: number
}

export type ExportProjectSummary = {
  filePath: string
  documentCount: number
  rootCollectionIds: string[]
  includeSubcollections: boolean
}

export type ExportProjectResult =
  | {
      ok: true
      data: ExportProjectSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

/** プロジェクトにインポート（zip・検証独立） */
export type ImportProjectInput = {
  projectId: string
  filePath: string
  /**
   * manifest.projectId が宛先と違うとき、ユーザー確認済みなら true。
   * 不一致かつ false のとき実行は拒否。
   */
  acceptProjectIdMismatch?: boolean
}

export type ImportProjectProgress = {
  phase: 'extracting' | 'validating' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type ImportProjectValidation = {
  filePath: string
  documentCount: number
  rootCollectionIds: string[]
  includeSubcollections: boolean
  sourceProjectId: string
  projectIdMismatch: boolean
  /** 衝突ありなら import 不可 */
  hasCollisions: boolean
  collisionSamples: string[]
  checkedCount: number
}

export type ImportProjectValidationResult =
  | {
      ok: true
      data: ImportProjectValidation
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type ImportProjectSummary = {
  filePath: string
  writtenCount: number
  rootCollectionIds: string[]
  includeSubcollections: boolean
  sourceProjectId: string
}

export type ImportProjectResult =
  | {
      ok: true
      data: ImportProjectSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
