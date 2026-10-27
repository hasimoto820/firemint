import type { ExportDocument } from './types'

export type OfficialDumpSummary = {
  sourcePath: string
  dumpRoot: string
  outputFiles: string[]
  documents: ExportDocument[]
  sourceProjectId: string | null
}

export type OfficialDumpReadResult =
  | {
      ok: true
      data: OfficialDumpSummary
    }
  | {
      ok: false
      error: string
    }

/** ファイルの形式。公式ダンプ（zip / フォルダ）か JSON（.jsonl） */
export type TransferFormat = 'official' | 'jsonl'

/** インポートの書き方。追記 = 無いドキュメントだけ作る / 上書き = 丸ごと置き換える */
export type ImportWriteMode = 'append' | 'overwrite'

export type TransferScopeKind = 'project' | 'collection' | 'group'

/** インポートするファイルの見出し（ファイルを選んだ時に読む） */
export type ImportFileInfo = {
  filePath: string
  format: TransferFormat
  /** エクスポート元のプロジェクト。分からない時は null */
  sourceProjectId: string | null
  /** エクスポートの範囲。分からない時は null */
  scopeKind: TransferScopeKind | null
}

export type ImportFileInfoResult = { ok: true; data: ImportFileInfo } | { ok: false; error: string }

export type OfficialImportInput = {
  projectId: string
  /** 公式ダンプ（zip / フォルダ）または .jsonl */
  dumpPath: string
  /** 省略時は追記 */
  writeMode?: ImportWriteMode
  /**
   * Emulator に新しいプロジェクトを作って入れる時のホスト。書き込み先は projectId ではなく、
   * このホストの emulatorProjectId（省略時はファイルのエクスポート元）。既にあれば、そこへ書く
   */
  emulatorHost?: string
  emulatorProjectId?: string
}

export type OfficialImportSummary = {
  dumpPath: string
  format: TransferFormat
  writeMode: ImportWriteMode
  documentCount: number
  writtenCount: number
  skippedCount: number
  failedCount: number
  skippedSamples: string[]
  failedSamples: string[]
  /** 途中で止まった理由。最後まで書いた時は null */
  stoppedReason: string | null
  sourceProjectId: string | null
  writtenProjectId: string
}

export type OfficialImportResult =
  | {
      ok: true
      data: OfficialImportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
      /** 書き始めた後に止まった時、それまでの件数 */
      partial?: OfficialImportSummary
    }

export type ImportVerifyLevel = 'quick' | 'detailed'

export type ImportVerifyInput = OfficialImportInput & {
  level: ImportVerifyLevel
}

/** 検証の片側（クラウド / ファイル）。only は詳細の時だけ（側ごとの「だけ」の件数） */
export type ImportVerifySide = {
  total: number
  only: number | null
}

/** コレクション ID ごとの行。片側に無い時は null */
export type ImportVerifyRow = {
  collectionId: string
  cloud: ImportVerifySide | null
  file: ImportVerifySide | null
}

export type OfficialImportValidation = {
  dumpPath: string
  format: TransferFormat
  level: ImportVerifyLevel
  documentCount: number
  rows: ImportVerifyRow[]
  /** 詳細の時だけ。両方にあって中身が違うドキュメントの数 */
  changedCount: number | null
  sourceProjectId: string | null
  writtenProjectId: string
}

export type OfficialImportValidationResult =
  | {
      ok: true
      data: OfficialImportValidation
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type OfficialExportKind = TransferScopeKind

export type OfficialExportInput = {
  projectId: string
  kind: OfficialExportKind
  format?: TransferFormat
  rootCollectionIds?: string[]
  collectionId?: string
  collectionPath?: string
  includeSubcollections?: boolean
  /** 保存先のフォルダ。省略時は Documents/FireMint */
  directory?: string
  /** ファイル名。省略時は自動（時刻つき）。拡張子が無ければ付ける */
  fileName?: string
  /** 指定時はこのファイルに保存する（directory より優先） */
  filePath?: string
}

export type OfficialExportProgress = {
  phase: 'reading' | 'writing' | 'done'
  processedCount: number
  totalCount: number
  percent: number
  detail: string | null
}

export type OfficialExportSummary = {
  filePath: string
  documentCount: number
  kind: OfficialExportKind
  format: TransferFormat
}

export type OfficialExportResult =
  | {
      ok: true
      data: OfficialExportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
