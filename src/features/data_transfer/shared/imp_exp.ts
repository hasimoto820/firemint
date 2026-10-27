import type {
  ImportFileInfo,
  ImportWriteMode,
  OfficialImportValidation,
  TransferFormat
} from './official'

export type ImpExpDirection = 'import' | 'export'
export type ImpExpTarget = 'collection' | 'group' | 'project'

export type ImpExpIntent = {
  direction: ImpExpDirection
  target: ImpExpTarget
}

export type ImpExpDraft = ImpExpIntent & {
  collectionPath: string
  filePath: string | null
  includeSubcollections: boolean
  selectedRoots: string[]
  destinationProjectId: string
  acceptMismatch: boolean
  projectValidation: OfficialImportValidation | null
  /** エクスポートの形式（公式ダンプ / JSON） */
  format: TransferFormat
  /** エクスポートの保存先のフォルダ。null は Documents/FireMint */
  exportDirectory: string | null
  /** エクスポートのファイル名。null は自動（時刻つき） */
  exportFileName: string | null
  /** インポートの書き方。最初は追記 */
  writeMode: ImportWriteMode
  /** インポートするファイルの形式と、エクスポート元のプロジェクト */
  fileInfo: ImportFileInfo | null
}

/** パスの最後（ファイル名）を除いた、置き場のフォルダ */
export function folderOf(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]+$/, '')
}

/** パスの最後（ファイル名） */
export function fileNameOf(filePath: string): string {
  return filePath.replace(/^.*[\\/]/, '')
}

/** フォルダとファイル名をつなぐ（区切りはフォルダに合わせる） */
export function joinFilePath(folder: string, fileName: string): string {
  return `${folder}${folder.includes('\\') ? '\\' : '/'}${fileName}`
}

export function formatLabel(format: TransferFormat): string {
  return format === 'jsonl' ? 'JSON（.jsonl）' : '公式ダンプ'
}

/** 書き方の説明。targetLabel は書き込む側の呼び名（クラウド / Emulator） */
export function writeModeHint(writeMode: ImportWriteMode, targetLabel: string): string {
  return writeMode === 'append'
    ? `${targetLabel}に無いドキュメントだけを作ります。既にあるドキュメントには触れません。`
    : `ファイルにあるドキュメントは、ファイルの中身で丸ごと置き換わります。${targetLabel}にだけあるフィールドは消えます。`
}

export function lastPathSegment(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function createImpExpDraft(projectId: string): ImpExpDraft {
  return {
    direction: 'export',
    target: 'collection',
    collectionPath: '',
    filePath: null,
    includeSubcollections: true,
    selectedRoots: [],
    destinationProjectId: projectId,
    acceptMismatch: false,
    projectValidation: null,
    format: 'official',
    exportDirectory: null,
    exportFileName: null,
    writeMode: 'append',
    fileInfo: null
  }
}

export function applyImpExpIntent(
  draft: ImpExpDraft,
  intent: ImpExpIntent,
  lastCollectionPath: string | null,
  rootCollectionIds: string[] = []
): ImpExpDraft {
  const direction = intent.direction
  const target = direction === 'import' ? 'project' : intent.target
  const switched = draft.direction !== direction || draft.target !== target

  return {
    ...draft,
    direction,
    target,
    collectionPath:
      target === 'collection'
        ? draft.collectionPath || lastCollectionPath || ''
        : target === 'group'
          ? lastPathSegment(draft.collectionPath || lastCollectionPath || '')
          : draft.collectionPath,
    acceptMismatch: false,
    selectedRoots:
      direction === 'export' &&
      target === 'project' &&
      draft.selectedRoots.length === 0
        ? rootCollectionIds
        : draft.selectedRoots,
    projectValidation: switched ? null : draft.projectValidation
  }
}
