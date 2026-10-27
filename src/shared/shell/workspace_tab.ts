import type { DocumentSummary } from '@features/explorer/shared/types'
import type { AppView } from '@shared/shell/AppNav'
import type { DocumentTableViewState } from '@shared/ui/document_table_utils'

export type WorkspacePaneId = 'primary' | 'secondary'

/**
 * 上段タブの種別。Imp/Exp と Emulator はコレクションに紐づかない。
 * empty は＋で開く空タブ。コレクションを選ぶと collection に置き換わる。
 * auth は projectId の Auth ユーザー一覧。コレクションと同じく中身を切り替えられる。
 */
export type WorkspaceTabKind =
  | 'collection'
  | 'imp_exp'
  | 'emulator_imp_exp'
  | 'transport'
  | 'diff'
  | 'empty'
  | 'auth'

export const IMP_EXP_TAB_LABEL = 'Cloud Imp/Exp'
export const EMULATOR_IMP_EXP_TAB_LABEL = 'Emu Imp/Exp'
export const TRANSPORT_TAB_LABEL = 'Transport'
export const DIFF_TAB_LABEL = 'Diff'
export const AUTH_TAB_LABEL = 'Auth'

/**
 * 作業面 1 枚分。Phase 9 のタブ / Split の単位。
 * pane は左右どちらのエディタグループに属するかを表す。
 * 同じ collectionPath を左右（または同一ペインの別タブ）に同時に持てる。
 *
 * query* は Query モードの下書き・直近 Run 結果。simpleState は Simple モードの
 * ページ位置と表の見た目。Simple ⇄ Query 切替やタブ切替でアンマウントされても、
 * タブが生きている限りメモリ上に残す。
 * Imp/Exp タブでは query* / simpleState / collectionPath は使わない。
 */
export type WorkspaceTab = {
  id: string
  kind: WorkspaceTabKind
  projectId: string
  collectionPath: string
  view: AppView
  selectedDocumentPath: string | null
  pane: WorkspacePaneId
  /** null = 未グループ。セッション内のみ（再起動で消える） */
  groupId: string | null
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
  /** null = まだ Simple を開いていない（1 ページ目・既定の表示） */
  simpleState: WorkspaceTabSimpleState | null
  /**
   * 同じタブで前に開いていたコレクションの状態（Simple / Query / 選択ドキュメント）。
   * キーは pageCacheKey(projectId, collectionPath)。古い順に並ぶ。
   * 今開いているコレクションと合わせて PAGE_HISTORY_LIMIT 件まで覚える。
   */
  pageCache: Record<string, WorkspaceTabPageState>
}

/** Simple モードのページ位置と、表の列・並び替え・フィルタ。 */
export type WorkspaceTabSimpleState = {
  pageIndex: number
  /** pageStartCursors[i] = ページ i を読むときの startAfterId（0 ページ目は null） */
  pageStartCursors: (string | null)[]
  table: DocumentTableViewState | null
}

export type WorkspaceTabQueryState = {
  querySource: string | null
  querySeededPath: string | null
  querySelectedSavedId: string | null
  querySavedName: string
  queryDocuments: DocumentSummary[]
  queryResultCount: number | null
  queryLastSource: string | null
  queryResultSelectedPath: string | null
}

export type WorkspaceTabPageState = WorkspaceTabQueryState & {
  selectedDocumentPath: string | null
  simpleState: WorkspaceTabSimpleState | null
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
    kind: 'collection',
    projectId: input.projectId,
    collectionPath: input.collectionPath,
    view: input.view ?? 'simple',
    pane: input.pane ?? 'primary',
    groupId: null,
    ...emptyPageState(),
    selectedDocumentPath: input.selectedDocumentPath ?? null,
    pageCache: {}
  }
}

/** ＋で開く空タブ。「コレクションを開いてください」を出す。 */
export function createEmptyTab(input: {
  projectId: string
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'empty'
  }
}

/** 1 タブが覚えておくコレクション数（今開いている分を含む）。Query 結果は最大 1000 件 / コレクション。 */
export const PAGE_HISTORY_LIMIT = 10

export function pageCacheKey(projectId: string, collectionPath: string): string {
  return `${projectId}\u0000${collectionPath}`
}

function emptyPageState(): WorkspaceTabPageState {
  return {
    querySource: null,
    querySeededPath: null,
    querySelectedSavedId: null,
    querySavedName: '',
    queryDocuments: [],
    queryResultCount: null,
    queryLastSource: null,
    queryResultSelectedPath: null,
    selectedDocumentPath: null,
    simpleState: null
  }
}

function pickPageState(tab: WorkspaceTab): WorkspaceTabPageState {
  return {
    querySource: tab.querySource,
    querySeededPath: tab.querySeededPath,
    querySelectedSavedId: tab.querySelectedSavedId,
    querySavedName: tab.querySavedName,
    queryDocuments: tab.queryDocuments,
    queryResultCount: tab.queryResultCount,
    queryLastSource: tab.queryLastSource,
    queryResultSelectedPath: tab.queryResultSelectedPath,
    selectedDocumentPath: tab.selectedDocumentPath,
    simpleState: tab.simpleState
  }
}

/** 今のコレクションの状態を pageCache の末尾（新しい側）に入れた写しを返す。 */
function stashCurrentPage(tab: WorkspaceTab): Record<string, WorkspaceTabPageState> {
  const cache = { ...tab.pageCache }
  if (tab.kind === 'collection') {
    const currentKey = pageCacheKey(tab.projectId, tab.collectionPath)
    delete cache[currentKey]
    cache[currentKey] = pickPageState(tab)
  }
  return cache
}

function trimPageCache(cache: Record<string, WorkspaceTabPageState>): void {
  const keys = Object.keys(cache)
  const keep = PAGE_HISTORY_LIMIT - 1
  for (const key of keys.slice(0, Math.max(0, keys.length - keep))) {
    delete cache[key]
  }
}

/** Auth タブを新しく作る。 */
export function createAuthTab(input: { projectId: string; pane?: WorkspacePaneId }): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'auth'
  }
}

/**
 * タブの中身を Auth に切り替える。開いていたコレクションの状態は pageCache に残すので、
 * 同じタブでコレクションに戻ったときに戻せる。
 */
export function retargetAuthTab(tab: WorkspaceTab, projectId: string): WorkspaceTab {
  if (tab.kind === 'auth' && tab.projectId === projectId) {
    return tab
  }

  const cache = stashCurrentPage(tab)
  trimPageCache(cache)

  return {
    ...tab,
    ...emptyPageState(),
    kind: 'auth',
    projectId,
    collectionPath: '',
    pageCache: cache
  }
}

/**
 * タブの中身を別のコレクションに切り替える。
 * 今のコレクションの状態（Simple / Query）を pageCache に退避し、行き先の分があれば戻す。
 * selectedDocumentPath を指定しない / null のときは、行き先で前に選んでいたドキュメントを戻す。
 */
export function retargetCollectionTab(
  tab: WorkspaceTab,
  input: {
    projectId: string
    collectionPath: string
    view?: AppView
    selectedDocumentPath?: string | null
  }
): WorkspaceTab {
  const sameTarget =
    tab.kind === 'collection' &&
    tab.projectId === input.projectId &&
    tab.collectionPath === input.collectionPath

  if (sameTarget) {
    return {
      ...tab,
      view: input.view ?? tab.view,
      selectedDocumentPath:
        input.selectedDocumentPath !== undefined
          ? input.selectedDocumentPath
          : tab.selectedDocumentPath
    }
  }

  const cache = stashCurrentPage(tab)
  const nextKey = pageCacheKey(input.projectId, input.collectionPath)
  const restored = cache[nextKey] ?? emptyPageState()
  delete cache[nextKey]

  trimPageCache(cache)

  return {
    ...tab,
    ...restored,
    kind: 'collection',
    projectId: input.projectId,
    collectionPath: input.collectionPath,
    view: input.view ?? tab.view,
    selectedDocumentPath: input.selectedDocumentPath ?? restored.selectedDocumentPath,
    pageCache: cache
  }
}

/** ウィンドウに 1 つだけの Imp/Exp タブ。コレクションには紐づけない。 */
export function createImpExpTab(input: {
  projectId: string
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'imp_exp'
  }
}

export function isCollectionTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'collection'
}

export function isEmptyTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'empty'
}

export function isAuthTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'auth'
}

/** クリックで中身を切り替えてよいタブ（コレクション / 空タブ / Auth）。ツール系は入力途中なので除く。 */
export function isReplaceableTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'collection' || tab.kind === 'empty' || tab.kind === 'auth'
}

export function isImpExpTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'imp_exp'
}

export function isEmulatorImpExpTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'emulator_imp_exp'
}

export function isTransportTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'transport'
}

export function isDiffTab(tab: WorkspaceTab): boolean {
  return tab.kind === 'diff'
}

/** Imp/Exp / Emulator / Transport / Diff。コレクションタブではない。 */
export function isWorkspaceToolTab(tab: WorkspaceTab): boolean {
  return (
    tab.kind === 'imp_exp' ||
    tab.kind === 'emulator_imp_exp' ||
    tab.kind === 'transport' ||
    tab.kind === 'diff'
  )
}

/** ウィンドウに 1 つだけの Emulator Imp/Exp タブ。 */
export function createEmulatorImpExpTab(input: {
  projectId: string
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'emulator_imp_exp'
  }
}

/** ウィンドウに 1 つだけの Transport タブ。 */
export function createTransportTab(input: {
  projectId: string
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'transport'
  }
}

/** ウィンドウに 1 つだけの Diff タブ。 */
export function createDiffTab(input: {
  projectId: string
  pane?: WorkspacePaneId
}): WorkspaceTab {
  return {
    ...createWorkspaceTab({
      projectId: input.projectId,
      collectionPath: '',
      pane: input.pane ?? 'primary'
    }),
    kind: 'diff'
  }
}

/** タブ見出し。コレクションはパス末尾、Imp/Exp・Emulator は固定名。混在時は projectLabel を付ける。 */
export function workspaceTabLabel(
  tab: WorkspaceTab,
  projectLabel?: string,
  newTabLabel = 'New tab'
): string {
  if (tab.kind === 'empty') {
    return newTabLabel
  }

  if (tab.kind === 'auth') {
    const trimmed = projectLabel?.trim()
    return trimmed ? `${AUTH_TAB_LABEL} · ${trimmed}` : AUTH_TAB_LABEL
  }

  if (tab.kind === 'imp_exp') {
    return IMP_EXP_TAB_LABEL
  }

  if (tab.kind === 'emulator_imp_exp') {
    return EMULATOR_IMP_EXP_TAB_LABEL
  }

  if (tab.kind === 'transport') {
    return TRANSPORT_TAB_LABEL
  }

  if (tab.kind === 'diff') {
    return DIFF_TAB_LABEL
  }

  const segments = tab.collectionPath.split('/').filter(Boolean)
  const name = segments[segments.length - 1] ?? tab.collectionPath
  const trimmed = projectLabel?.trim()

  if (!trimmed) {
    return name
  }

  return `${name} · ${trimmed}`
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
