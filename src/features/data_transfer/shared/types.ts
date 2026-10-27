import type { TransferFormat } from './official'

export type ExportDocument = {
  id: string
  path: string
  data: Record<string, unknown>
}

export type ExportCollectionInput = {
  projectId: string
  collectionPath: string
  format: TransferFormat
  /**
   * true = 配下サブコレクションも再帰 export。
   * undefined = 実行前に確認ダイアログで選ぶ（デフォルトは除外）。
   */
  includeSubcollections?: boolean
  /** 保存先のフォルダ。省略時は Documents/FireMint */
  directory?: string
  /** ファイル名。省略時は自動（時刻つき）。拡張子が無ければ付ける */
  fileName?: string
  /** 指定時はこのファイルに保存する（directory より優先） */
  filePath?: string
}

export type ExportGroupInput = {
  projectId: string
  collectionId: string
  format: TransferFormat
  /** 保存先のフォルダ。省略時は Documents/FireMint */
  directory?: string
  /** ファイル名。省略時は自動（時刻つき）。拡張子が無ければ付ける */
  fileName?: string
  /** 指定時はこのファイルに保存する（directory より優先） */
  filePath?: string
}

/** プロジェクトをエクスポート（選んだルート） */
export type ExportProjectInput = {
  projectId: string
  /** エクスポートするルートコレクション ID。空は不可 */
  rootCollectionIds: string[]
  includeSubcollections: boolean
  format: TransferFormat
  /** 保存先のフォルダ。省略時は Documents/FireMint */
  directory?: string
  /** ファイル名。省略時は自動（時刻つき）。拡張子が無ければ付ける */
  fileName?: string
  /** 指定時はこのファイルに保存する（directory より優先） */
  filePath?: string
}

export type ImportProjectProgress = {
  phase: 'extracting' | 'counting' | 'validating' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}
