import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import CollectionRenameDialog from '@features/explorer/renderer/ui/CollectionRenameDialog'
import FieldBulkRenameDialog from '@features/explorer/renderer/ui/FieldBulkRenameDialog'
import ExplorerSidebar from '@features/explorer/renderer/ui/ExplorerSidebar'
import AppHeader from '@shared/shell/AppHeader'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'
import CommandPalette, { type CommandPaletteItem } from '@shared/shell/CommandPalette'
import TabBar from '@shared/shell/TabBar'
import WorkspacePane from '@shared/shell/WorkspacePane'
import {
  createWorkspaceTab,
  parentCollectionPath,
  remapFirestorePath,
  tabsInPane,
  workspaceTabLabel,
  type WorkspacePaneId,
  type WorkspaceTab
} from '@shared/shell/workspace_tab'

export type ShellCommands = {
  openCommandPalette: () => void
  toggleSplit: () => void
  closeActiveTab: () => void
  closeOtherTabs: () => void
  canCloseTab: boolean
  canCloseOtherTabs: boolean
  splitEnabled: boolean
}

type FirestorePageProps = {
  status: ConnectionStatus
  view: AppView
  onNavigate: (view: AppView) => void
  onDisconnected: () => void
  onWorkspaceChanged: () => void
  onShellCommandsChange?: (commands: ShellCommands | null) => void
  /** インクリメントするとルートコレクション一覧を再読込 */
  rootsReloadToken?: number
}

/**
 * 接続後の Firestore 作業画面。左ツリーは固定し、右はタブ（＋任意で Split）と
 * Simple / Query モードでコレクションを開く。Split 時は左右ペインが
 * それぞれ独立したタブグループを持つ。
 */
function FirestorePage({
  status,
  view,
  onNavigate,
  onDisconnected,
  onWorkspaceChanged,
  onShellCommandsChange,
  rootsReloadToken = 0
}: FirestorePageProps): React.JSX.Element {
  const projectId = status.projectId
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [primaryActiveId, setPrimaryActiveId] = useState<string | null>(null)
  const [secondaryActiveId, setSecondaryActiveId] = useState<string | null>(null)
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [focusedPane, setFocusedPane] = useState<WorkspacePaneId>('primary')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeReloadToken, setTreeReloadToken] = useState(0)
  const [collectionDataReloadToken, setCollectionDataReloadToken] = useState(0)
  const [renameCollectionPath, setRenameCollectionPath] = useState<string | null>(null)
  const [fieldBulkRenamePath, setFieldBulkRenamePath] = useState<string | null>(null)

  const primaryTabs = useMemo(() => tabsInPane(tabs, 'primary'), [tabs])
  const secondaryTabs = useMemo(() => tabsInPane(tabs, 'secondary'), [tabs])
  const primaryTab = tabs.find((tab) => tab.id === primaryActiveId) ?? null
  const secondaryTab = tabs.find((tab) => tab.id === secondaryActiveId) ?? null
  const focusedActiveId = focusedPane === 'primary' ? primaryActiveId : secondaryActiveId
  const focusedTab = tabs.find((tab) => tab.id === focusedActiveId) ?? null
  const treeCollectionPath = focusedTab?.collectionPath ?? null
  const treeDocumentPath = focusedTab?.selectedDocumentPath ?? null

  const loadRootCollections = useCallback(async (): Promise<void> => {
    setTreeLoading(true)

    try {
      const result = await window.api.explorer.listRootCollections(projectId)
      if (result.ok) {
        setRootCollections(result.data)
      }
    } finally {
      setTreeLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadRootCollections()
  }, [loadRootCollections])

  useEffect(() => {
    if (rootsReloadToken <= 0) {
      return
    }

    void loadRootCollections()
  }, [rootsReloadToken, loadRootCollections])

  const updateTab = useCallback((tabId: string, patch: Partial<WorkspaceTab>): void => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)))
  }, [])

  const activateInPane = useCallback(
    (tabId: string, pane: WorkspacePaneId): void => {
      const tab = tabs.find((item) => item.id === tabId)
      if (pane === 'primary') {
        setPrimaryActiveId(tabId)
      } else {
        setSecondaryActiveId(tabId)
      }
      setFocusedPane(pane)
      if (tab) {
        onNavigate(tab.view)
      }
    },
    [tabs, onNavigate]
  )

  const openCollection = useCallback(
    (
      collectionPath: string,
      options?: { view?: AppView; selectedDocumentPath?: string | null; pane?: WorkspacePaneId }
    ): void => {
      const targetPane = options?.pane ?? (splitEnabled ? focusedPane : 'primary')
      const nextView = options?.view
      const nextDoc = options?.selectedDocumentPath

      setTabs((current) => {
        // 同じペイン内なら既存タブを再利用。左右で同じコレクションを開くのは許可する。
        const existingInPane = current.find(
          (tab) => tab.collectionPath === collectionPath && tab.pane === targetPane
        )
        if (existingInPane) {
          const resolvedView = nextView ?? existingInPane.view
          if (targetPane === 'primary') {
            setPrimaryActiveId(existingInPane.id)
          } else {
            setSecondaryActiveId(existingInPane.id)
          }
          setFocusedPane(targetPane)
          onNavigate(resolvedView)
          return current.map((tab) =>
            tab.id === existingInPane.id
              ? {
                  ...tab,
                  view: resolvedView,
                  selectedDocumentPath: nextDoc !== undefined ? nextDoc : tab.selectedDocumentPath
                }
              : tab
          )
        }

        const created = createWorkspaceTab({
          projectId,
          collectionPath,
          view: nextView ?? view,
          selectedDocumentPath: nextDoc ?? null,
          pane: targetPane
        })
        if (targetPane === 'primary') {
          setPrimaryActiveId(created.id)
        } else {
          setSecondaryActiveId(created.id)
        }
        setFocusedPane(targetPane)
        onNavigate(created.view)
        return [...current, created]
      })
    },
    [projectId, view, onNavigate, splitEnabled, focusedPane]
  )

  const handleSelectCollection = useCallback(
    (collectionPath: string): void => {
      openCollection(collectionPath, { selectedDocumentPath: null })
    },
    [openCollection]
  )

  const handleSelectDocument = useCallback(
    (documentPath: string): void => {
      const collectionPath = parentCollectionPath(documentPath)
      if (!collectionPath) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: documentPath })
    },
    [openCollection]
  )

  const handleCollectionRenamed = useCallback(
    (sourceCollectionPath: string, targetCollectionPath: string): void => {
      setTabs((current) => {
        const remapped = current.map((tab) => ({
          ...tab,
          collectionPath:
            remapFirestorePath(tab.collectionPath, sourceCollectionPath, targetCollectionPath) ??
            tab.collectionPath,
          selectedDocumentPath: remapFirestorePath(
            tab.selectedDocumentPath,
            sourceCollectionPath,
            targetCollectionPath
          ),
          queryResultSelectedPath: remapFirestorePath(
            tab.queryResultSelectedPath,
            sourceCollectionPath,
            targetCollectionPath
          )
        }))

        const deduped: WorkspaceTab[] = []
        for (const tab of remapped) {
          if (
            deduped.some(
              (existing) =>
                existing.pane === tab.pane && existing.collectionPath === tab.collectionPath
            )
          ) {
            continue
          }
          deduped.push(tab)
        }

        return deduped
      })

      setTreeReloadToken((token) => token + 1)
      void loadRootCollections()

      openCollection(targetCollectionPath, { selectedDocumentPath: null })
    },
    [loadRootCollections, openCollection]
  )

  const handleRequestRenameCollection = useCallback(
    (collectionPath: string): void => {
      if (status.readOnly) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null })
      setRenameCollectionPath(collectionPath)
    },
    [openCollection, status.readOnly]
  )

  const handleRequestFieldBulkRename = useCallback(
    (collectionPath: string): void => {
      if (status.readOnly) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null })
      setFieldBulkRenamePath(collectionPath)
    },
    [openCollection, status.readOnly]
  )

  const handleFieldBulkRenameCompleted = useCallback((): void => {
    setFieldBulkRenamePath(null)
    setTreeReloadToken((token) => token + 1)
    setCollectionDataReloadToken((token) => token + 1)
  }, [])

  const handleRenameDialogCompleted = useCallback(
    (targetCollectionPath: string, _movedCount: number): void => {
      if (!renameCollectionPath) {
        return
      }

      handleCollectionRenamed(renameCollectionPath, targetCollectionPath)
      setRenameCollectionPath(null)
    },
    [handleCollectionRenamed, renameCollectionPath]
  )

  const handleCloseTab = useCallback(
    (tabId: string): void => {
      const closing = tabs.find((tab) => tab.id === tabId)
      if (!closing) {
        return
      }

      const pane = closing.pane
      const paneTabs = tabsInPane(tabs, pane)
      const index = paneTabs.findIndex((tab) => tab.id === tabId)
      const nextPaneTabs = paneTabs.filter((tab) => tab.id !== tabId)
      const neighbor = nextPaneTabs[index] ?? nextPaneTabs[index - 1] ?? null

      setTabs((current) => current.filter((tab) => tab.id !== tabId))

      if (pane === 'primary') {
        setPrimaryActiveId((active) => (active === tabId ? (neighbor?.id ?? null) : active))
      } else {
        setSecondaryActiveId((active) => (active === tabId ? (neighbor?.id ?? null) : active))
      }
    },
    [tabs]
  )

  const handleCloseOtherTabs = useCallback((): void => {
    if (!focusedActiveId || !focusedTab) {
      return
    }

    const pane = focusedTab.pane
    setTabs((current) =>
      current.filter((tab) => tab.id === focusedActiveId || (splitEnabled && tab.pane !== pane))
    )

    if (pane === 'primary') {
      setPrimaryActiveId(focusedActiveId)
    } else {
      setSecondaryActiveId(focusedActiveId)
    }
  }, [focusedActiveId, focusedTab, splitEnabled])

  const moveTabToPane = useCallback(
    (tabId: string, pane: WorkspacePaneId): void => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? { ...tab, pane } : tab))
      )
      activateInPane(tabId, pane)
    },
    [activateInPane]
  )

  const handleToggleSplit = useCallback((): void => {
    setSplitEnabled((enabled) => {
      const next = !enabled
      if (next) {
        const candidates = tabs.filter((tab) => tab.id !== primaryActiveId)
        const moveTarget = candidates[0] ?? null
        if (moveTarget) {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === moveTarget.id ? { ...tab, pane: 'secondary' as const } : tab
            )
          )
          setSecondaryActiveId(moveTarget.id)
        } else {
          setSecondaryActiveId(null)
        }
        return true
      }

      setTabs((current) => current.map((tab) => ({ ...tab, pane: 'primary' as const })))
      setSecondaryActiveId(null)
      setFocusedPane('primary')
      return false
    })
  }, [tabs, primaryActiveId])

  // メニュー等の view 変更 → フォーカス中タブへ
  useEffect(() => {
    if (!focusedActiveId || !focusedTab) {
      return
    }

    if (focusedTab.view !== view) {
      updateTab(focusedActiveId, { view })
    }
  }, [view, focusedActiveId, focusedTab, updateTab])

  // フォーカス切替時に App 側 view を同期
  useEffect(() => {
    if (focusedTab && focusedTab.view !== view) {
      onNavigate(focusedTab.view)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedActiveId, focusedPane])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.key === 'p' || event.key === 'P') && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }

      if ((event.key === 'w' || event.key === 'W') && (event.ctrlKey || event.metaKey)) {
        if (!focusedActiveId) {
          return
        }

        event.preventDefault()
        handleCloseTab(focusedActiveId)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedActiveId, handleCloseTab])

  const shellCommands = useMemo<ShellCommands>(
    () => ({
      openCommandPalette: () => setPaletteOpen(true),
      toggleSplit: () => handleToggleSplit(),
      closeActiveTab: () => {
        if (focusedActiveId) {
          handleCloseTab(focusedActiveId)
        }
      },
      closeOtherTabs: handleCloseOtherTabs,
      canCloseTab: Boolean(focusedActiveId),
      canCloseOtherTabs:
        Boolean(focusedTab) &&
        tabsInPane(tabs, focusedTab?.pane ?? 'primary').length > 1,
      splitEnabled
    }),
    [
      focusedActiveId,
      focusedTab,
      handleCloseTab,
      handleCloseOtherTabs,
      handleToggleSplit,
      splitEnabled,
      tabs
    ]
  )

  useEffect(() => {
    onShellCommandsChange?.(shellCommands)
    return () => onShellCommandsChange?.(null)
  }, [shellCommands, onShellCommandsChange])

  const handlePaneViewChange = useCallback(
    (tabId: string, nextView: AppView): void => {
      updateTab(tabId, { view: nextView })
      if (tabId === focusedActiveId) {
        onNavigate(nextView)
      }
    },
    [focusedActiveId, onNavigate, updateTab]
  )

  const handlePaneDocumentChange = useCallback(
    (tabId: string, documentPath: string | null): void => {
      updateTab(tabId, { selectedDocumentPath: documentPath })
    },
    [updateTab]
  )

  const handlePaneCollectionChange = useCallback(
    (tabId: string, collectionPath: string): void => {
      const currentTab = tabs.find((tab) => tab.id === tabId)
      if (!currentTab) {
        return
      }

      const existingInPane = tabs.find(
        (tab) =>
          tab.collectionPath === collectionPath && tab.pane === currentTab.pane && tab.id !== tabId
      )
      if (existingInPane) {
        activateInPane(existingInPane.id, existingInPane.pane)
        updateTab(existingInPane.id, { selectedDocumentPath: null })
        return
      }

      updateTab(tabId, { collectionPath, selectedDocumentPath: null })
    },
    [tabs, updateTab, activateInPane]
  )

  const paletteItems = useMemo((): CommandPaletteItem[] => {
    const items: CommandPaletteItem[] = [
      {
        id: 'view-simple',
        group: '表示',
        label: 'Simple モード',
        run: () => onNavigate('simple')
      },
      {
        id: 'view-query',
        group: '表示',
        label: 'Query モード',
        run: () => onNavigate('query')
      },
      {
        id: 'toggle-split',
        group: 'レイアウト',
        label: splitEnabled ? 'Split View を解除' : 'Split View を開く',
        run: () => handleToggleSplit()
      },
      {
        id: 'close-tab',
        group: 'タブ',
        label: 'アクティブタブを閉じる',
        run: () => {
          if (focusedActiveId) {
            handleCloseTab(focusedActiveId)
          }
        }
      },
      {
        id: 'close-other-tabs',
        group: 'タブ',
        label: '他のタブを閉じる（同じペイン）',
        run: () => handleCloseOtherTabs()
      }
    ]

    for (const collection of rootCollections) {
      items.push({
        id: `open-root-${collection}`,
        group: 'コレクション',
        label: collection,
        detail: 'フォーカス中ペインで開く',
        run: () => openCollection(collection)
      })
    }

    for (const tab of tabs) {
      items.push({
        id: `focus-tab-${tab.id}`,
        group: '開いているタブ',
        label: workspaceTabLabel(tab.collectionPath),
        detail: `${tab.collectionPath}（${tab.pane === 'primary' ? '左' : '右'}）`,
        run: () => activateInPane(tab.id, tab.pane)
      })

      if (splitEnabled && tab.pane === 'primary') {
        items.push({
          id: `move-right-${tab.id}`,
          group: 'Split',
          label: `右ペインへ移す: ${workspaceTabLabel(tab.collectionPath)}`,
          detail: tab.collectionPath,
          run: () => moveTabToPane(tab.id, 'secondary')
        })
      }

      if (splitEnabled && tab.pane === 'secondary') {
        items.push({
          id: `move-left-${tab.id}`,
          group: 'Split',
          label: `左ペインへ移す: ${workspaceTabLabel(tab.collectionPath)}`,
          detail: tab.collectionPath,
          run: () => moveTabToPane(tab.id, 'primary')
        })
      }
    }

    return items
  }, [
    activateInPane,
    focusedActiveId,
    handleCloseOtherTabs,
    handleCloseTab,
    handleToggleSplit,
    moveTabToPane,
    onNavigate,
    openCollection,
    rootCollections,
    splitEnabled,
    tabs
  ])

  const handleDisconnect = async (): Promise<void> => {
    await window.api.connection.disconnect()
    onDisconnected()
  }

  const renderEditorGroup = (
    pane: WorkspacePaneId,
    paneTabs: WorkspaceTab[],
    activeId: string | null,
    active: WorkspaceTab | null
  ): React.JSX.Element => (
    <div
      className={
        focusedPane === pane
          ? 'firestore-split__pane firestore-split__pane--focused'
          : 'firestore-split__pane'
      }
      onMouseDown={() => setFocusedPane(pane)}
    >
      <TabBar
        tabs={paneTabs}
        activeTabId={activeId}
        ariaLabel={pane === 'primary' ? '左ペインのタブ' : '右ペインのタブ'}
        onActivate={(tabId) => activateInPane(tabId, pane)}
        onClose={handleCloseTab}
      />

      {active ? (
        <WorkspacePane
          status={status}
          tab={active}
          menuEnabled={focusedPane === pane && active.view === 'simple'}
          onChangeView={(nextView) => handlePaneViewChange(active.id, nextView)}
          onSelectCollection={(path) => handlePaneCollectionChange(active.id, path)}
          onSelectDocument={(path) => handlePaneDocumentChange(active.id, path)}
          onRootCollectionsChanged={() => void loadRootCollections()}
          onRequestRenameCollection={handleRequestRenameCollection}
          onRequestFieldBulkRename={handleRequestFieldBulkRename}
          collectionDataReloadToken={collectionDataReloadToken}
          onQueryDraftChange={(patch) => updateTab(active.id, patch)}
        />
      ) : (
        <div className="firestore-split__pane-empty">
          <p className="simple-main__empty-title">
            {pane === 'primary' ? '左ペイン' : '右ペイン'}
          </p>
          <p className="simple-main__empty-hint">
            このペインをクリックしてフォーカスし、ツリーまたは Command Palette
            からコレクションを開くと、ここにタブが追加されます。
          </p>
        </div>
      )}
    </div>
  )

  return (
    <>
      <AppShell
        header={<AppHeader status={status} onDisconnect={() => void handleDisconnect()} />}
        sidebar={
          <ExplorerSidebar
            projectId={projectId}
            rootCollections={rootCollections}
            activeCollectionPath={treeCollectionPath}
            selectedDocumentPath={treeDocumentPath}
            onSelectCollection={handleSelectCollection}
            onSelectDocument={handleSelectDocument}
            onRenameCollection={handleRequestRenameCollection}
            onRenameFieldBulk={handleRequestFieldBulkRename}
            canRename={!status.readOnly}
            onWorkspaceChanged={onWorkspaceChanged}
            treeReloadToken={treeReloadToken}
            disabled={treeLoading}
          />
        }
        main={
          <div className="firestore-main">
            {tabs.length === 0 ? (
              <div className="simple-main simple-main--empty">
                <p className="simple-main__empty-title">コレクションを開いてください</p>
                <p className="simple-main__empty-hint">
                  左のツリーからコレクションを選ぶか、Ctrl+P（Mac: ⌘P）で Command Palette
                  を開き、タブとして開けます。
                </p>
              </div>
            ) : splitEnabled ? (
              <div className="firestore-split">
                {renderEditorGroup('primary', primaryTabs, primaryActiveId, primaryTab)}
                <div className="firestore-split__divider" aria-hidden />
                {renderEditorGroup('secondary', secondaryTabs, secondaryActiveId, secondaryTab)}
              </div>
            ) : (
              renderEditorGroup('primary', primaryTabs, primaryActiveId, primaryTab)
            )}
          </div>
        }
      />

      {renameCollectionPath && (
        <CollectionRenameDialog
          projectId={projectId}
          collectionPath={renameCollectionPath}
          open
          onClose={() => setRenameCollectionPath(null)}
          onRenamed={handleRenameDialogCompleted}
        />
      )}

      {fieldBulkRenamePath && (
        <FieldBulkRenameDialog
          projectId={projectId}
          collectionPath={fieldBulkRenamePath}
          open
          onClose={() => setFieldBulkRenamePath(null)}
          onCompleted={handleFieldBulkRenameCompleted}
        />
      )}

      <CommandPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
    </>
  )
}

export default FirestorePage
