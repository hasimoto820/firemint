import type { AppView } from '@shared/shell/AppNav'

export type WorkspacePaneId = 'primary' | 'secondary'

/**
 * 作業面 1 枚分。Phase 9 のタブ / Split の単位。
 * pane は左右どちらのエディタグループに属するかを表す。
 * 同じ collectionPath を左右（または同一ペインの別タブ）に同時に持てる。
 */
export type WorkspaceTab = {
  id: string
  projectId: string
  collectionPath: string
  view: AppView
  selectedDocumentPath: string | null
  pane: WorkspacePaneId
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
    pane: input.pane ?? 'primary'
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

export function tabsInPane(tabs: WorkspaceTab[], pane: WorkspacePaneId): WorkspaceTab[] {
  return tabs.filter((tab) => tab.pane === pane)
}
