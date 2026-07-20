import type { DocumentSummary } from '@features/explorer/shared/types'
import type { AppView } from '@shared/shell/AppNav'

export type WorkspacePaneId = 'primary' | 'secondary'

/**
 * 作業面 1 枚分。Phase 9 のタブ / Split の単位。
 * pane は左右どちらのエディタグループに属するかを表す。
 * 同じ collectionPath を左右（または同一ペインの別タブ）に同時に持てる。
 *
 * query* は Query モードの下書き・直近 Run 結果。Simple ⇄ Query 切替で
 * アンマウントされても、タブが生きている限りメモリ上に残す。
 */
export type WorkspaceTab = {
  id: string
  projectId: string
  collectionPath: string
  view: AppView
  selectedDocumentPath: string | null
  pane: WorkspacePaneId
  /** null = 未初期化。初回 Query 表示で default JS を埋める */
  querySource: string | null
  /** querySource が「未編集の seed」として紐づく path（Saved 読込後は null） */
  querySeededPath: string | null
  querySelectedSavedId: string | null
  querySavedName: string
  /** 直近 Run の結果行（未実行は [] かつ queryResultCount === null） */
  queryDocuments: DocumentSummary[]
  /** null = まだ一度も Run していない */
  queryResultCount: number | null
  /** 成功した直近 Run に使った source（一括操作後の再実行用） */
  queryLastSource: string | null
  /** Query 結果テーブルで選択中のドキュメント path */
  queryResultSelectedPath: string | null
}

export type WorkspaceTabQueryDraftPatch = {
  querySource?: string | null
  querySeededPath?: string | null
  querySelectedSavedId?: string | null
  querySavedName?: string
  queryDocuments?: DocumentSummary[]
  queryResultCount?: number | null
  queryLastSource?: string | null
  queryResultSelectedPath?: string | null
}

let tabSeq = 0

export function createWorkspaceTabId(): string {
  tabSeq += 1
  return `tab-${Date.now()}-${tabSeq}`
}

export function createWorkspaceTab(input: {
  projectId: string
  collectionPath: string
  view?: AppView
  selectedDocumentPath?: string | null
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    id: createWorkspaceTabId(),
    projectId: input.projectId,
    collectionPath: input.collectionPath,
    view: input.view ?? 'simple',
    selectedDocumentPath: input.selectedDocumentPath ?? null,
    pane: input.pane ?? 'primary',
    querySource: null,
    querySeededPath: null,
    querySelectedSavedId: null,
    querySavedName: '',
    queryDocuments: [],
    queryResultCount: null,
    queryLastSource: null,
    queryResultSelectedPath: null
  }
}

/** タブ見出し用。パス末尾セグメントを短く見せる。 */
export function workspaceTabLabel(collectionPath: string): string {
  const segments = collectionPath.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? collectionPath
}

/** ドキュメント path の親コレクション path。 */
export function parentCollectionPath(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

/** コレクションリネーム後に path を付け替える（自身と配下）。 */
export function remapFirestorePath(
  path: string | null,
  sourceCollectionPath: string,
  targetCollectionPath: string
): string | null {
  if (!path) {
    return null
  }

  if (path === sourceCollectionPath) {
    return targetCollectionPath
  }

  const prefix = `${sourceCollectionPath}/`
  if (path.startsWith(prefix)) {
    return `${targetCollectionPath}${path.slice(sourceCollectionPath.length)}`
  }

  return path
}

export function tabsInPane(tabs: WorkspaceTab[], pane: WorkspacePaneId): WorkspaceTab[] {
  return tabs.filter((tab) => tab.pane === pane)
}
