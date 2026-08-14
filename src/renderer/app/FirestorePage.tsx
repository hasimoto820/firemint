import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AutocompleteProvider,
  useAutocompleteApi
} from '@features/autocomplete/renderer/hooks'
import AuthUsersView from '@features/auth_users/renderer/ui/AuthUsersView'
import type { ConnectionStatus } from '@features/connection/shared/types'
import { useT } from '@shared/i18n/renderer/I18nProvider'
import { confirmAction } from '@shared/ui/confirmAction'
import CollectionRenameDialog from '@features/explorer/renderer/ui/CollectionRenameDialog'
import FieldBulkRenameDialog from '@features/explorer/renderer/ui/FieldBulkRenameDialog'
import SubcollectionCreateDialog from '@features/explorer/renderer/ui/SubcollectionCreateDialog'
import SubcollectionDeleteDialog from '@features/explorer/renderer/ui/SubcollectionDeleteDialog'
import ExplorerSidebar from '@features/explorer/renderer/ui/ExplorerSidebar'
import { parentDocumentPathOfSubcollection } from '@features/explorer/shared/tree'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import {
  applyImpExpIntent,
  createImpExpDraft,
  type ImpExpDraft,
  type ImpExpIntent
} from '@features/data_transfer/shared/imp_exp'
import AppHeader from '@shared/shell/AppHeader'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'
import CommandPalette, { type CommandPaletteItem } from '@shared/shell/CommandPalette'
import TabBar from '@shared/shell/TabBar'
import WorkspacePane from '@shared/shell/WorkspacePane'
import {
  createImpExpTab,
  createWorkspaceTab,
  isCollectionTab,
  isImpExpTab,
  parentCollectionPath,
  remapFirestorePath,
  tabsInPane,
  workspaceTabLabel,
  type WorkspacePaneId,
  type WorkspaceTab
} from '@shared/shell/workspace_tab'

export type ShellCommands = {
  openCommandPalette: () => void
  openImpExp: (intent?: ImpExpIntent) => void
  toggleSplit: () => void
  closeActiveTab: () => void
  closeOtherTabs: () => void
  canCloseTab: boolean
  canCloseOtherTabs: boolean
  splitEnabled: boolean
  impExpActive: boolean
}

type FirestorePageProps = {
  status: ConnectionStatus
  view: AppView
  onNavigate: (view: AppView) => void
  onWorkspaceChanged: () => void
  onShellCommandsChange?: (commands: ShellCommands | null) => void
  /** インクリメントするとルートコレクション一覧を再読込 */
  rootsReloadToken?: number
  /** インクリメントすると左ツリーのプロジェクト一覧を再取得 */
  workspaceRefreshToken?: number
}

/**
 * 接続後の Firestore 作業画面。左ツリーは固定し、右はタブ（＋任意で Split）と
 * Simple / Query モードでコレクションを開く。Split 時は左右ペインが
 * それぞれ独立したタブグループを持つ。
 */
function FirestorePageInner({
  status,
  view,
  onNavigate,
  onWorkspaceChanged,
  onShellCommandsChange,
  rootsReloadToken = 0,
  workspaceRefreshToken = 0
}: FirestorePageProps): React.JSX.Element {
  const projectId = status.projectId
  const t = useT()
  const autocomplete = useAutocompleteApi()
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [primaryActiveId, setPrimaryActiveId] = useState<string | null>(null)
  const [secondaryActiveId, setSecondaryActiveId] = useState<string | null>(null)
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [focusedPane, setFocusedPane] = useState<WorkspacePaneId>('primary')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeReloadToken, setTreeReloadToken] = useState(0)
  const [treeContentReloadToken, setTreeContentReloadToken] = useState(0)
  const [collectionDataReloadToken, setCollectionDataReloadToken] = useState(0)
  const [renameCollectionPath, setRenameCollectionPath] = useState<string | null>(null)
  const [fieldBulkRenamePath, setFieldBulkRenamePath] = useState<string | null>(null)
  const [createSubcollectionDocumentPath, setCreateSubcollectionDocumentPath] = useState<string | null>(
    null
  )
  const [deleteSubcollectionPath, setDeleteSubcollectionPath] = useState<string | null>(null)
  const [mainSection, setMainSection] = useState<'firestore' | 'auth'>('firestore')
  const [impExpJob, setImpExpJob] = useState<ScriptJobSnapshot | null>(null)
  const [impExpDraft, setImpExpDraft] = useState<ImpExpDraft>(() => createImpExpDraft(projectId))
  const lastCollectionPathRef = useRef<string | null>(null)
  const impExpJobRef = useRef<ScriptJobSnapshot | null>(null)
  impExpJobRef.current = impExpJob
  const handledImportJobIdRef = useRef<string | null>(null)

  const primaryTabs = useMemo(() => tabsInPane(tabs, 'primary'), [tabs])
  const secondaryTabs = useMemo(() => tabsInPane(tabs, 'secondary'), [tabs])
  const primaryTab = tabs.find((tab) => tab.id === primaryActiveId) ?? null
  const secondaryTab = tabs.find((tab) => tab.id === secondaryActiveId) ?? null
  const focusedActiveId = focusedPane === 'primary' ? primaryActiveId : secondaryActiveId
  const focusedTab = tabs.find((tab) => tab.id === focusedActiveId) ?? null
  const treeCollectionPath =
    focusedTab && isCollectionTab(focusedTab) ? focusedTab.collectionPath : null
  const treeDocumentPath =
    focusedTab && isCollectionTab(focusedTab) ? focusedTab.selectedDocumentPath : null

  useEffect(() => {
    if (focusedTab && isCollectionTab(focusedTab)) {
      lastCollectionPathRef.current = focusedTab.collectionPath
    }
  }, [focusedTab])

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
    setMainSection('firestore')
  }, [projectId])

  useEffect(() => {
    if (rootsReloadToken <= 0) {
      return
    }

    void loadRootCollections()
  }, [rootsReloadToken, loadRootCollections])

  useEffect(() => {
    let cancelled = false

    void window.api.scriptRunner.getSnapshot().then((snapshot) => {
      if (!cancelled) {
        setImpExpJob(snapshot)
      }
    })

    const unsubscribe = window.api.scriptRunner.onSnapshot(setImpExpJob)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!impExpJob) {
      return
    }

    if (impExpJob.status !== 'succeeded') {
      return
    }

    if (impExpJob.kind !== 'import_collection' && impExpJob.kind !== 'import_project') {
      return
    }

    if (handledImportJobIdRef.current === impExpJob.id) {
      return
    }

    handledImportJobIdRef.current = impExpJob.id
    void loadRootCollections()
    setTreeReloadToken((token) => token + 1)
    setCollectionDataReloadToken((token) => token + 1)
  }, [impExpJob, loadRootCollections])

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
      if (tab && isCollectionTab(tab)) {
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
      setMainSection('firestore')
      const targetPane = options?.pane ?? (splitEnabled ? focusedPane : 'primary')
      const nextView = options?.view
      const nextDoc = options?.selectedDocumentPath

      setTabs((current) => {
        // 同じペイン内なら既存タブを再利用。左右で同じコレクションを開くのは許可する。
        const existingInPane = current.find(
          (tab) =>
            isCollectionTab(tab) && tab.collectionPath === collectionPath && tab.pane === targetPane
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

  const openImpExp = useCallback(
    (intent?: ImpExpIntent): void => {
      setMainSection('firestore')

      if (intent) {
        setImpExpDraft((current) =>
          applyImpExpIntent(current, intent, lastCollectionPathRef.current, rootCollections)
        )
      } else {
        setImpExpDraft((current) => ({
          ...current,
          collectionPath: current.collectionPath || lastCollectionPathRef.current || ''
        }))
      }

      setTabs((current) => {
        const existing = current.find(isImpExpTab)
        if (existing) {
          if (existing.pane === 'primary') {
            setPrimaryActiveId(existing.id)
          } else {
            setSecondaryActiveId(existing.id)
          }
          setFocusedPane(existing.pane)
          return current
        }

        const created = createImpExpTab({ projectId, pane: 'primary' })
        setPrimaryActiveId(created.id)
        setFocusedPane('primary')
        return [...current, created]
      })
    },
    [projectId, rootCollections]
  )

  const handleImpExpDraftChange = useCallback((patch: Partial<ImpExpDraft>): void => {
    setImpExpDraft((current) => ({ ...current, ...patch }))
  }, [])

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
      autocomplete.removeCollectionPaths(projectId, [sourceCollectionPath])
      autocomplete.addCollectionPaths(projectId, [targetCollectionPath])

      setImpExpDraft((current) => ({
        ...current,
        collectionPath:
          remapFirestorePath(current.collectionPath, sourceCollectionPath, targetCollectionPath) ??
          current.collectionPath
      }))

      setTabs((current) => {
        const remapped = current.map((tab) => {
          if (isImpExpTab(tab)) {
            return tab
          }

          return {
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
          }
        })

        const deduped: WorkspaceTab[] = []
        for (const tab of remapped) {
          if (isImpExpTab(tab)) {
            if (deduped.some(isImpExpTab)) {
              continue
            }
            deduped.push(tab)
            continue
          }

          if (
            deduped.some(
              (existing) =>
                isCollectionTab(existing) &&
                existing.pane === tab.pane &&
                existing.collectionPath === tab.collectionPath
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
    [autocomplete, loadRootCollections, openCollection, projectId]
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

  const handleRequestCreateSubcollection = useCallback(
    (documentPath: string): void => {
      if (status.readOnly) {
        return
      }

      const collectionPath = parentCollectionPath(documentPath)
      if (!collectionPath) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: documentPath })
      setCreateSubcollectionDocumentPath(documentPath)
    },
    [openCollection, status.readOnly]
  )

  const handleRequestDeleteSubcollection = useCallback(
    (collectionPath: string): void => {
      if (status.readOnly) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null })
      setDeleteSubcollectionPath(collectionPath)
    },
    [openCollection, status.readOnly]
  )

  const handleSubcollectionCreated = useCallback(
    (subcollectionPath: string, documentId: string): void => {
      autocomplete.addCollectionPaths(projectId, [subcollectionPath])
      setTreeReloadToken((token) => token + 1)
      openCollection(subcollectionPath, {
        selectedDocumentPath: `${subcollectionPath}/${documentId}`
      })
    },
    [autocomplete, openCollection, projectId]
  )

  const handleSubcollectionDeleted = useCallback(
    (collectionPath: string): void => {
      autocomplete.removeCollectionPaths(projectId, [collectionPath])
      const prefix = `${collectionPath}/`

      setTabs((current) => {
        const filtered = current
          .filter(
            (tab) =>
              isImpExpTab(tab) ||
              (tab.collectionPath !== collectionPath && !tab.collectionPath.startsWith(prefix))
          )
          .map((tab) => ({
            ...tab,
            selectedDocumentPath:
              tab.selectedDocumentPath?.startsWith(prefix) ||
              tab.selectedDocumentPath === collectionPath
                ? null
                : tab.selectedDocumentPath,
            queryResultSelectedPath: tab.queryResultSelectedPath?.startsWith(prefix)
              ? null
              : tab.queryResultSelectedPath
          }))

        setPrimaryActiveId((active) =>
          active && filtered.some((tab) => tab.id === active)
            ? active
            : (filtered.find((tab) => tab.pane === 'primary')?.id ?? null)
        )
        setSecondaryActiveId((active) =>
          active && filtered.some((tab) => tab.id === active)
            ? active
            : (filtered.find((tab) => tab.pane === 'secondary')?.id ?? null)
        )

        return filtered
      })

      setTreeReloadToken((token) => token + 1)

      const parentDocument = parentDocumentPathOfSubcollection(collectionPath)
      if (parentDocument) {
        openCollection(parentCollectionPath(parentDocument), {
          selectedDocumentPath: parentDocument
        })
      }
    },
    [autocomplete, openCollection, projectId]
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

  const confirmStopImpExpJob = useCallback(async (): Promise<boolean> => {
    const job = impExpJobRef.current
    if (!job || job.status !== 'running') {
      return true
    }

    const accepted = await confirmAction('Imp/Exp の処理中です。中止してタブを閉じますか？')
    if (accepted) {
      void window.api.scriptRunner.cancel()
    }

    return accepted
  }, [])

  const handleCancelImpExp = useCallback((): void => {
    void window.api.scriptRunner.cancel()
  }, [])

  const handleCloseTab = useCallback(
    async (tabId: string): Promise<void> => {
      const closing = tabs.find((tab) => tab.id === tabId)
      if (!closing) {
        return
      }

      if (isImpExpTab(closing) && !(await confirmStopImpExpJob())) {
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
    [confirmStopImpExpJob, tabs]
  )

  const handleCloseOtherTabs = useCallback(async (): Promise<void> => {
    if (!focusedActiveId || !focusedTab) {
      return
    }

    const pane = focusedTab.pane
    const wouldCloseRunningImpExp = tabs.some(
      (tab) =>
        isImpExpTab(tab) &&
        tab.id !== focusedActiveId &&
        (!splitEnabled || tab.pane === pane)
    )
    if (wouldCloseRunningImpExp && !(await confirmStopImpExpJob())) {
      return
    }

    setTabs((current) =>
      current.filter((tab) => tab.id === focusedActiveId || (splitEnabled && tab.pane !== pane))
    )

    if (pane === 'primary') {
      setPrimaryActiveId(focusedActiveId)
    } else {
      setSecondaryActiveId(focusedActiveId)
    }
  }, [confirmStopImpExpJob, focusedActiveId, focusedTab, splitEnabled, tabs])

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

  // メニュー等の view 変更 → フォーカス中のコレクションタブへ
  useEffect(() => {
    if (!focusedActiveId || !focusedTab || isImpExpTab(focusedTab)) {
      return
    }

    if (focusedTab.view !== view) {
      updateTab(focusedActiveId, { view })
    }
  }, [view, focusedActiveId, focusedTab, updateTab])

  // フォーカス切替時に App 側 view を同期（Imp/Exp は Simple/Query ではない）
  useEffect(() => {
    if (!focusedTab || isImpExpTab(focusedTab)) {
      return
    }

    if (focusedTab.view !== view) {
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
      openImpExp,
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
      splitEnabled,
      impExpActive: Boolean(focusedTab && isImpExpTab(focusedTab))
    }),
    [
      focusedActiveId,
      focusedTab,
      handleCloseTab,
      handleCloseOtherTabs,
      handleToggleSplit,
      openImpExp,
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
          isCollectionTab(tab) &&
          tab.collectionPath === collectionPath &&
          tab.pane === currentTab.pane &&
          tab.id !== tabId
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
        id: 'open-imp-exp',
        group: 'タブ',
        label: 'Imp/Exp',
        detail: 'Import / Export',
        run: () => openImpExp()
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
      const label = workspaceTabLabel(tab)
      items.push({
        id: `focus-tab-${tab.id}`,
        group: '開いているタブ',
        label,
        detail: isImpExpTab(tab)
          ? 'Import / Export'
          : `${tab.collectionPath}（${tab.pane === 'primary' ? '左' : '右'}）`,
        run: () => activateInPane(tab.id, tab.pane)
      })

      if (splitEnabled && tab.pane === 'primary') {
        items.push({
          id: `move-right-${tab.id}`,
          group: 'Split',
          label: `右ペインへ移す: ${label}`,
          detail: isImpExpTab(tab) ? 'Import / Export' : tab.collectionPath,
          run: () => moveTabToPane(tab.id, 'secondary')
        })
      }

      if (splitEnabled && tab.pane === 'secondary') {
        items.push({
          id: `move-left-${tab.id}`,
          group: 'Split',
          label: `左ペインへ移す: ${label}`,
          detail: isImpExpTab(tab) ? 'Import / Export' : tab.collectionPath,
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
    openImpExp,
    rootCollections,
    splitEnabled,
    tabs
  ])

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
        impExpBusy={impExpJob?.status === 'running'}
        onActivate={(tabId) => activateInPane(tabId, pane)}
        onClose={handleCloseTab}
      />

      {active ? (
        <WorkspacePane
          status={status}
          tab={active}
          menuEnabled={
            focusedPane === pane && isCollectionTab(active) && active.view === 'simple'
          }
          impExpJob={impExpJob}
          impExpDraft={impExpDraft}
          rootCollections={rootCollections}
          onImpExpDraftChange={handleImpExpDraftChange}
          onCancelImpExp={handleCancelImpExp}
          onOpenImpExp={openImpExp}
          onChangeView={(nextView) => handlePaneViewChange(active.id, nextView)}
          onSelectCollection={(path) => handlePaneCollectionChange(active.id, path)}
          onSelectDocument={(path) => handlePaneDocumentChange(active.id, path)}
          onRootCollectionsChanged={() => void loadRootCollections()}
          onRequestRenameCollection={handleRequestRenameCollection}
          onRequestFieldBulkRename={handleRequestFieldBulkRename}
          onRequestCreateSubcollection={handleRequestCreateSubcollection}
          onRequestDeleteSubcollection={handleRequestDeleteSubcollection}
          collectionDataReloadToken={collectionDataReloadToken}
          onCollectionDocumentsChanged={() =>
            setTreeContentReloadToken((token) => token + 1)
          }
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
        header={<AppHeader status={status} />}
        sidebar={
          <ExplorerSidebar
            projectId={projectId}
            rootCollections={rootCollections}
            activeCollectionPath={treeCollectionPath}
            selectedDocumentPath={treeDocumentPath}
            mainSection={mainSection}
            onSelectFirestore={() => setMainSection('firestore')}
            onSelectAuth={() => setMainSection('auth')}
            onSelectCollection={handleSelectCollection}
            onSelectDocument={handleSelectDocument}
            onRenameCollection={handleRequestRenameCollection}
            onRenameFieldBulk={handleRequestFieldBulkRename}
            onCreateSubcollection={handleRequestCreateSubcollection}
            onDeleteSubcollection={handleRequestDeleteSubcollection}
            canRename={!status.readOnly}
            canManageSubcollections={!status.readOnly}
            onWorkspaceChanged={onWorkspaceChanged}
            treeReloadToken={treeReloadToken}
            treeContentReloadToken={treeContentReloadToken}
            workspaceRefreshToken={workspaceRefreshToken}
            disabled={treeLoading}
          />
        }
        main={
          <div className="firestore-main">
            {mainSection === 'auth' ? (
              <AuthUsersView projectId={projectId} readOnly={status.readOnly} />
            ) : tabs.length === 0 ? (
              <div className="simple-main simple-main--empty">
                <p className="simple-main__empty-title">{t('explorer.open_title')}</p>
                <p className="simple-main__empty-hint">{t('explorer.open_hint')}</p>
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

      {createSubcollectionDocumentPath && (
        <SubcollectionCreateDialog
          projectId={projectId}
          documentPath={createSubcollectionDocumentPath}
          open
          onClose={() => setCreateSubcollectionDocumentPath(null)}
          onCreated={handleSubcollectionCreated}
        />
      )}

      {deleteSubcollectionPath && (
        <SubcollectionDeleteDialog
          projectId={projectId}
          collectionPath={deleteSubcollectionPath}
          open
          onClose={() => setDeleteSubcollectionPath(null)}
          onDeleted={() => {
            handleSubcollectionDeleted(deleteSubcollectionPath)
            setDeleteSubcollectionPath(null)
          }}
        />
      )}

      <CommandPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
    </>
  )
}

function FirestorePage(props: FirestorePageProps): React.JSX.Element {
  return (
    <AutocompleteProvider>
      <FirestorePageInner {...props} />
    </AutocompleteProvider>
  )
}

export default FirestorePage
