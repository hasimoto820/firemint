import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AutocompleteProvider,
  useAutocompleteApi
} from '@features/autocomplete/renderer/hooks'
import type { BulkFieldMode } from '@features/bulk_operations/shared/types'
import AuthUsersView from '@features/auth_users/renderer/ui/AuthUsersView'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import type { EmulatorPageMode } from '@features/emulator/shared/types'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import { useT } from '@shared/i18n/renderer/I18nProvider'
import { detectEnvironment } from '@shared/safety/environment'
import { confirmAction } from '@shared/ui/confirmAction'
import CollectionCreateDialog from '@features/explorer/renderer/ui/CollectionCreateDialog'
import CollectionRenameDialog from '@features/explorer/renderer/ui/CollectionRenameDialog'
import DocumentCreateDialog from '@features/explorer/renderer/ui/DocumentCreateDialog'
import DocumentDuplicateDialog from '@features/explorer/renderer/ui/DocumentDuplicateDialog'
import FieldBulkRenameDialog from '@features/explorer/renderer/ui/FieldBulkRenameDialog'
import SubcollectionCreateDialog from '@features/explorer/renderer/ui/SubcollectionCreateDialog'
import SubcollectionDeleteDialog from '@features/explorer/renderer/ui/SubcollectionDeleteDialog'
import ExplorerSidebar from '@features/explorer/renderer/ui/ExplorerSidebar'
import {
  collectionKindLabel,
  parentDocumentPathOfSubcollection
} from '@features/explorer/shared/tree'
import { runDuplicateCollection } from '@features/explorer/renderer/duplicateCollection'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import {
  applyImpExpIntent,
  createImpExpDraft,
  type ImpExpDraft,
  type ImpExpIntent
} from '@features/data_transfer/shared/imp_exp'
import {
  applyDiffIntent,
  createDiffDraft,
  type DiffDraft,
  type DiffIntent
} from '@features/diff/shared/diff'
import {
  applyTransportIntent,
  createTransportDraft,
  type TransportDraft,
  type TransportIntent
} from '@features/transport/shared/transport'
import AppHeader from '@shared/shell/AppHeader'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'
import CommandPalette, { type CommandPaletteItem } from '@shared/shell/CommandPalette'
import TabBar from '@shared/shell/TabBar'
import WorkspacePane from '@shared/shell/WorkspacePane'
import {
  createDiffTab,
  createEmulatorImpExpTab,
  createImpExpTab,
  createTransportTab,
  createWorkspaceTab,
  DIFF_TAB_LABEL,
  EMULATOR_IMP_EXP_TAB_LABEL,
  IMP_EXP_TAB_LABEL,
  TRANSPORT_TAB_LABEL,
  isCollectionTab,
  isDiffTab,
  isEmulatorImpExpTab,
  isImpExpTab,
  isTransportTab,
  isWorkspaceToolTab,
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
  openEmulatorImpExp: (mode: EmulatorPageMode) => void
  openTransport: (intent?: TransportIntent) => void
  openDiff: (intent?: DiffIntent) => void
  toggleSplit: () => void
  closeActiveTab: () => void
  closeOtherTabs: () => void
  canCloseTab: boolean
  canCloseOtherTabs: boolean
  splitEnabled: boolean
  impExpActive: boolean
  toolTabActive: boolean
  hasRootCollections: boolean
  hasCollectionPath: boolean
  sourceIsEmulator: boolean
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
  workspaceEntries?: WorkspaceEntry[]
  loadedProjectIds?: string[]
}

function connectionStatusForTab(
  focused: ConnectionStatus,
  tab: WorkspaceTab,
  entries: WorkspaceEntry[]
): ConnectionStatus {
  if (tab.projectId === focused.projectId) {
    return focused
  }

  const entry = entries.find((item) => item.id === tab.projectId)
  return {
    projectId: tab.projectId,
    clientEmail: focused.clientEmail,
    environment: detectEnvironment(tab.projectId),
    readOnly: entry?.readOnly ?? false,
    authType: entry?.authType
  }
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
  workspaceRefreshToken = 0,
  workspaceEntries = [],
  loadedProjectIds = []
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
  const [fieldBulk, setFieldBulk] = useState<{ path: string; mode: BulkFieldMode } | null>(null)
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false)
  const [createDocumentCollectionPath, setCreateDocumentCollectionPath] = useState<string | null>(
    null
  )
  const [duplicateDocumentPath, setDuplicateDocumentPath] = useState<string | null>(null)
  const [createSubcollectionDocumentPath, setCreateSubcollectionDocumentPath] = useState<string | null>(
    null
  )
  const [deleteSubcollectionPath, setDeleteSubcollectionPath] = useState<string | null>(null)
  const [dialogProjectId, setDialogProjectId] = useState(projectId)
  const [mainSection, setMainSection] = useState<'firestore' | 'auth'>('firestore')
  const [impExpJob, setImpExpJob] = useState<ScriptJobSnapshot | null>(null)
  const [impExpDraft, setImpExpDraft] = useState<ImpExpDraft>(() => createImpExpDraft(projectId))
  const [transportDraft, setTransportDraft] = useState<TransportDraft>(() => createTransportDraft())
  const [diffDraft, setDiffDraft] = useState<DiffDraft>(() => createDiffDraft())
  const [lastCollectionPath, setLastCollectionPath] = useState('')
  const [emulatorImpExpMode, setEmulatorImpExpMode] =
    useState<EmulatorPageMode>('import-project')
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
  const focusedEntry = workspaceEntries.find((entry) => entry.id === status.projectId)
  const loadedEmulator = workspaceEntries.find(
    (entry) => entry.authType === 'emulator' && loadedProjectIds.includes(entry.id)
  )
  const emulatorHost =
    (status.authType === 'emulator' ? focusedEntry?.emulatorHost : undefined) ??
    loadedEmulator?.emulatorHost ??
    DEFAULT_EMULATOR_HOST
  const treeCollectionPath =
    focusedTab && isCollectionTab(focusedTab) && focusedTab.projectId === projectId
      ? focusedTab.collectionPath
      : null
  const treeDocumentPath =
    focusedTab && isCollectionTab(focusedTab) && focusedTab.projectId === projectId
      ? focusedTab.selectedDocumentPath
      : null

  useEffect(() => {
    lastCollectionPathRef.current = ''
    setLastCollectionPath('')
  }, [projectId])

  useEffect(() => {
    if (focusedTab && isCollectionTab(focusedTab) && focusedTab.projectId === projectId) {
      lastCollectionPathRef.current = focusedTab.collectionPath
      setLastCollectionPath(focusedTab.collectionPath)
    }
  }, [focusedTab, projectId])

  const projectLabelFor = useCallback(
    (id: string): string => workspaceEntries.find((entry) => entry.id === id)?.label || id,
    [workspaceEntries]
  )
  const showProjectLabel = useMemo(() => {
    const ids = new Set(tabs.filter((tab) => isCollectionTab(tab)).map((tab) => tab.projectId))
    return ids.size > 1
  }, [tabs])
  const isReadOnlyProject = useCallback(
    (id: string): boolean => {
      if (id === status.projectId) {
        return status.readOnly
      }

      return workspaceEntries.find((entry) => entry.id === id)?.readOnly ?? false
    },
    [status.projectId, status.readOnly, workspaceEntries]
  )

  useEffect(() => {
    setTabs((current) =>
      current.map((tab) => (isWorkspaceToolTab(tab) ? { ...tab, projectId } : tab))
    )
    setImpExpDraft((current) =>
      current.destinationProjectId === projectId
        ? current
        : { ...current, destinationProjectId: projectId }
    )
  }, [projectId])

  useEffect(() => {
    if (loadedProjectIds.length === 0) {
      return
    }

    const loaded = new Set(loadedProjectIds)
    setTabs((current) => {
      const next = current.filter((tab) => isWorkspaceToolTab(tab) || loaded.has(tab.projectId))
      if (next.length === current.length) {
        return current
      }

      setPrimaryActiveId((active) =>
        active && next.some((tab) => tab.id === active)
          ? active
          : (next.find((tab) => tab.pane === 'primary')?.id ?? null)
      )
      setSecondaryActiveId((active) =>
        active && next.some((tab) => tab.id === active)
          ? active
          : (next.find((tab) => tab.pane === 'secondary')?.id ?? null)
      )
      return next
    })
  }, [loadedProjectIds])

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

    if (
      impExpJob.kind !== 'import_collection' &&
      impExpJob.kind !== 'import_project' &&
      impExpJob.kind !== 'transport'
    ) {
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
      options?: {
        view?: AppView
        selectedDocumentPath?: string | null
        pane?: WorkspacePaneId
        projectId?: string
      }
    ): void => {
      setMainSection('firestore')
      const targetPane = options?.pane ?? (splitEnabled ? focusedPane : 'primary')
      const nextView = options?.view
      const nextDoc = options?.selectedDocumentPath
      const tabProjectId = options?.projectId ?? projectId

      // setTabs の updater 内で onNavigate / setActiveId すると、まだ旧タブが
      // focused のまま App の view だけ simple になり、旧タブの view が上書きされる。
      // フォーカス切替とタブ更新を同バッチで行い、その後に navigate する。
      const existingInPane = tabs.find(
        (tab) =>
          isCollectionTab(tab) &&
          tab.projectId === tabProjectId &&
          tab.collectionPath === collectionPath &&
          tab.pane === targetPane
      )

      if (existingInPane) {
        const resolvedView = nextView ?? existingInPane.view
        if (targetPane === 'primary') {
          setPrimaryActiveId(existingInPane.id)
        } else {
          setSecondaryActiveId(existingInPane.id)
        }
        setFocusedPane(targetPane)
        setTabs((current) =>
          current.map((tab) =>
            tab.id === existingInPane.id
              ? {
                  ...tab,
                  view: resolvedView,
                  selectedDocumentPath: nextDoc !== undefined ? nextDoc : tab.selectedDocumentPath
                }
              : tab
          )
        )
        onNavigate(resolvedView)
        return
      }

      const created = createWorkspaceTab({
        projectId: tabProjectId,
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
      setTabs((current) => [...current, created])
      onNavigate(created.view)
    },
    [projectId, view, onNavigate, splitEnabled, focusedPane, tabs]
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

  const openEmulatorImpExp = useCallback(
    (mode: EmulatorPageMode): void => {
      setMainSection('firestore')
      setEmulatorImpExpMode(mode)

      setTabs((current) => {
        const existing = current.find(isEmulatorImpExpTab)
        if (existing) {
          if (existing.pane === 'primary') {
            setPrimaryActiveId(existing.id)
          } else {
            setSecondaryActiveId(existing.id)
          }
          setFocusedPane(existing.pane)
          return current
        }

        const created = createEmulatorImpExpTab({ projectId, pane: 'primary' })
        setPrimaryActiveId(created.id)
        setFocusedPane('primary')
        return [...current, created]
      })
    },
    [projectId]
  )

  const openTransport = useCallback(
    (intent?: TransportIntent): void => {
      setMainSection('firestore')

      if (intent) {
        setTransportDraft((current) =>
          applyTransportIntent(
            current,
            intent,
            lastCollectionPathRef.current || lastCollectionPath,
            rootCollections
          )
        )
      }

      setTabs((current) => {
        const existing = current.find(isTransportTab)
        if (existing) {
          if (existing.pane === 'primary') {
            setPrimaryActiveId(existing.id)
          } else {
            setSecondaryActiveId(existing.id)
          }
          setFocusedPane(existing.pane)
          return current
        }

        const created = createTransportTab({ projectId, pane: 'primary' })
        setPrimaryActiveId(created.id)
        setFocusedPane('primary')
        return [...current, created]
      })
    },
    [lastCollectionPath, projectId, rootCollections]
  )

  const openDiff = useCallback(
    (intent?: DiffIntent): void => {
      setMainSection('firestore')

      if (intent) {
        setDiffDraft((current) =>
          applyDiffIntent(current, intent, lastCollectionPathRef.current || lastCollectionPath)
        )
      } else {
        setDiffDraft((current) => ({
          ...current,
          collectionPath: current.collectionPath || lastCollectionPathRef.current || lastCollectionPath
        }))
      }

      setTabs((current) => {
        const existing = current.find(isDiffTab)
        if (existing) {
          if (existing.pane === 'primary') {
            setPrimaryActiveId(existing.id)
          } else {
            setSecondaryActiveId(existing.id)
          }
          setFocusedPane(existing.pane)
          return current
        }

        const created = createDiffTab({ projectId, pane: 'primary' })
        setPrimaryActiveId(created.id)
        setFocusedPane('primary')
        return [...current, created]
      })
    },
    [lastCollectionPath, projectId]
  )

  const handleImpExpDraftChange = useCallback((patch: Partial<ImpExpDraft>): void => {
    setImpExpDraft((current) => ({ ...current, ...patch }))
  }, [])

  const handleTransportDraftChange = useCallback((patch: Partial<TransportDraft>): void => {
    setTransportDraft((current) => ({ ...current, ...patch }))
  }, [])

  const handleDiffDraftChange = useCallback((patch: Partial<DiffDraft>): void => {
    setDiffDraft((current) => ({ ...current, ...patch }))
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

  const handleOpenDocumentPath = useCallback(
    async (documentPath: string, targetProjectId = projectId): Promise<void> => {
      const trimmed = documentPath.trim()
      const segments = trimmed.split('/').filter(Boolean)

      if (segments.length === 0 || segments.length % 2 !== 0) {
        await confirmAction(`ドキュメント path が不正です: ${documentPath}`, {
          confirmLabel: '閉じる'
        })
        return
      }

      const collectionPath = parentCollectionPath(trimmed)
      if (!collectionPath) {
        return
      }

      const result = await window.api.explorer.getDocument(targetProjectId, trimmed)
      if (!result.ok) {
        await confirmAction(result.error || 'ドキュメントを開けません', {
          confirmLabel: '閉じる'
        })
        return
      }

      openCollection(collectionPath, {
        view: 'simple',
        selectedDocumentPath: trimmed,
        projectId: targetProjectId
      })
    },
    [openCollection, projectId]
  )

  const handleRequestDuplicateDocument = useCallback(
    (documentPath: string, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      const collectionPath = parentCollectionPath(documentPath)
      if (!collectionPath) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: documentPath, projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setDuplicateDocumentPath(documentPath)
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleRequestRenameCollection = useCallback(
    (collectionPath: string, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null, projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setRenameCollectionPath(collectionPath)
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleRequestFieldBulk = useCallback(
    (collectionPath: string, mode: BulkFieldMode, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null, projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setFieldBulk({ path: collectionPath, mode })
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleRequestCreateDocument = useCallback(
    (collectionPath: string, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      openCollection(collectionPath, { projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setCreateDocumentCollectionPath(collectionPath)
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleRequestCreateCollection = useCallback((): void => {
    if (isReadOnlyProject(projectId)) {
      return
    }

    setDialogProjectId(projectId)
    setCreateCollectionOpen(true)
  }, [isReadOnlyProject, projectId])

  const handleRequestCreateSubcollection = useCallback(
    (documentPath: string, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      const collectionPath = parentCollectionPath(documentPath)
      if (!collectionPath) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: documentPath, projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setCreateSubcollectionDocumentPath(documentPath)
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleRequestDuplicateCollection = useCallback(
    async (collectionPath: string, targetProjectId = projectId): Promise<void> => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null, projectId: targetProjectId })

      const outcome = await runDuplicateCollection(targetProjectId, collectionPath)

      if (outcome.status === 'canceled') {
        return
      }

      if (outcome.status === 'error') {
        await confirmAction(outcome.error, { confirmLabel: '閉じる' })
        return
      }

      autocomplete.addCollectionPaths(targetProjectId, [outcome.targetCollectionPath])
      if (targetProjectId === projectId) {
        void loadRootCollections()
        setTreeContentReloadToken((token) => token + 1)
      }
      openCollection(outcome.targetCollectionPath, {
        selectedDocumentPath: null,
        projectId: targetProjectId
      })
    },
    [autocomplete, isReadOnlyProject, loadRootCollections, openCollection, projectId]
  )

  const handleRequestDeleteSubcollection = useCallback(
    (collectionPath: string, targetProjectId = projectId): void => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      openCollection(collectionPath, { selectedDocumentPath: null, projectId: targetProjectId })
      setDialogProjectId(targetProjectId)
      setDeleteSubcollectionPath(collectionPath)
    },
    [isReadOnlyProject, openCollection, projectId]
  )

  const handleSubcollectionCreated = useCallback(
    (subcollectionPath: string, documentId: string): void => {
      autocomplete.addCollectionPaths(dialogProjectId, [subcollectionPath])
      if (dialogProjectId === projectId) {
        setTreeReloadToken((token) => token + 1)
      }
      openCollection(subcollectionPath, {
        selectedDocumentPath: `${subcollectionPath}/${documentId}`,
        projectId: dialogProjectId
      })
    },
    [autocomplete, dialogProjectId, openCollection, projectId]
  )

  const handleSubcollectionDeleted = useCallback(
    (collectionPath: string, targetProjectId = dialogProjectId): void => {
      autocomplete.removeCollectionPaths(targetProjectId, [collectionPath])
      const prefix = `${collectionPath}/`

      setTabs((current) => {
        const filtered = current
          .filter(
            (tab) =>
              isWorkspaceToolTab(tab) ||
              tab.projectId !== targetProjectId ||
              (tab.collectionPath !== collectionPath && !tab.collectionPath.startsWith(prefix))
          )
          .map((tab) => {
            if (tab.projectId !== targetProjectId) {
              return tab
            }

            return {
              ...tab,
              selectedDocumentPath:
                tab.selectedDocumentPath?.startsWith(prefix) ||
                tab.selectedDocumentPath === collectionPath
                  ? null
                  : tab.selectedDocumentPath,
              queryResultSelectedPath: tab.queryResultSelectedPath?.startsWith(prefix)
                ? null
                : tab.queryResultSelectedPath
            }
          })

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

      if (targetProjectId === projectId) {
        setTreeReloadToken((token) => token + 1)
        void loadRootCollections()
      }

      const parentDocument = parentDocumentPathOfSubcollection(collectionPath)
      if (parentDocument) {
        openCollection(parentCollectionPath(parentDocument), {
          selectedDocumentPath: parentDocument,
          projectId: targetProjectId
        })
      }
    },
    [autocomplete, dialogProjectId, loadRootCollections, openCollection, projectId]
  )

  const handleCollectionBecameEmpty = useCallback(
    async (collectionPath: string, targetProjectId = dialogProjectId): Promise<void> => {
      const segments = collectionPath.split('/').filter(Boolean)
      const collectionName = segments[segments.length - 1] ?? collectionPath
      const kindLabel = collectionKindLabel(collectionPath)

      await confirmAction(
        `ドキュメントが無くなったため、${kindLabel}「${collectionName}」はツリーから外れました`,
        { confirmLabel: '閉じる' }
      )

      handleSubcollectionDeleted(collectionPath, targetProjectId)
    },
    [dialogProjectId, handleSubcollectionDeleted]
  )

  const handleRequestDeleteDocument = useCallback(
    async (documentPath: string, targetProjectId = projectId): Promise<void> => {
      if (isReadOnlyProject(targetProjectId)) {
        return
      }

      if (!(await confirmAction('このドキュメントを削除しますか？'))) {
        return
      }

      const collectionPath = parentCollectionPath(documentPath)
      if (!collectionPath) {
        return
      }

      const result = await window.api.explorer.deleteDocument(targetProjectId, documentPath)

      if (!result.ok) {
        await confirmAction(result.error, { confirmLabel: '閉じる' })
        return
      }

      const listed = await window.api.explorer.listDocuments(targetProjectId, collectionPath)
      if (listed.ok && listed.data.documents.length === 0) {
        await handleCollectionBecameEmpty(collectionPath, targetProjectId)
        return
      }

      if (targetProjectId === projectId) {
        setTreeContentReloadToken((token) => token + 1)
      }
      setCollectionDataReloadToken((token) => token + 1)
      openCollection(collectionPath, { selectedDocumentPath: null, projectId: targetProjectId })
    },
    [handleCollectionBecameEmpty, isReadOnlyProject, openCollection, projectId]
  )

  const handleCollectionCreated = useCallback(
    (collectionPath: string, documentId: string): void => {
      autocomplete.addCollectionPaths(dialogProjectId, [collectionPath])
      const reload =
        dialogProjectId === projectId
          ? loadRootCollections()
          : Promise.resolve()
      void reload.then(() => {
        openCollection(collectionPath, {
          selectedDocumentPath: `${collectionPath}/${documentId}`,
          projectId: dialogProjectId
        })
      })
    },
    [autocomplete, dialogProjectId, loadRootCollections, openCollection, projectId]
  )

  const handleDocumentCreated = useCallback(
    (collectionPath: string, documentId: string): void => {
      if (dialogProjectId === projectId) {
        setTreeContentReloadToken((token) => token + 1)
      }
      setCollectionDataReloadToken((token) => token + 1)
      openCollection(collectionPath, {
        selectedDocumentPath: `${collectionPath}/${documentId}`,
        projectId: dialogProjectId
      })
    },
    [dialogProjectId, openCollection, projectId]
  )

  const handleCollectionRenamed = useCallback(
    (sourceCollectionPath: string, targetCollectionPath: string): void => {
      autocomplete.removeCollectionPaths(dialogProjectId, [sourceCollectionPath])
      autocomplete.addCollectionPaths(dialogProjectId, [targetCollectionPath])

      if (dialogProjectId === projectId) {
        setImpExpDraft((current) => ({
          ...current,
          collectionPath:
            remapFirestorePath(current.collectionPath, sourceCollectionPath, targetCollectionPath) ??
            current.collectionPath
        }))
      }

      setTabs((current) => {
        const remapped = current.map((tab) => {
          if (isWorkspaceToolTab(tab) || tab.projectId !== dialogProjectId) {
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
          if (isWorkspaceToolTab(tab)) {
            if (deduped.some((existing) => existing.kind === tab.kind)) {
              continue
            }
            deduped.push(tab)
            continue
          }

          if (
            deduped.some(
              (existing) =>
                isCollectionTab(existing) &&
                existing.projectId === tab.projectId &&
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

      if (dialogProjectId === projectId) {
        setTreeReloadToken((token) => token + 1)
        void loadRootCollections()
      }

      openCollection(targetCollectionPath, {
        selectedDocumentPath: null,
        projectId: dialogProjectId
      })
    },
    [autocomplete, dialogProjectId, loadRootCollections, openCollection, projectId]
  )

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

  const handleFieldBulkCompleted = useCallback((): void => {
    setFieldBulk(null)
    setTreeReloadToken((token) => token + 1)
    setCollectionDataReloadToken((token) => token + 1)
  }, [])

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

      if (isWorkspaceToolTab(closing) && !(await confirmStopImpExpJob())) {
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

  const handleCloseEmulatorImpExp = useCallback((): void => {
    const tab = tabs.find(isEmulatorImpExpTab)
    if (tab) {
      void handleCloseTab(tab.id)
    }
  }, [handleCloseTab, tabs])

  const handleCloseOtherTabs = useCallback(async (): Promise<void> => {
    if (!focusedActiveId || !focusedTab) {
      return
    }

    const pane = focusedTab.pane
    const wouldCloseRunningImpExp = tabs.some(
      (tab) =>
        isWorkspaceToolTab(tab) &&
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
    if (!focusedActiveId || !focusedTab || isWorkspaceToolTab(focusedTab)) {
      return
    }

    if (focusedTab.view !== view) {
      updateTab(focusedActiveId, { view })
    }
  }, [view, focusedActiveId, focusedTab, updateTab])

  // フォーカス切替時に App 側 view を同期（Imp/Exp は Simple/Query ではない）
  useEffect(() => {
    if (!focusedTab || isWorkspaceToolTab(focusedTab)) {
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
      openEmulatorImpExp,
      openTransport,
      openDiff,
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
      impExpActive: Boolean(focusedTab && isImpExpTab(focusedTab)),
      toolTabActive: Boolean(focusedTab && isWorkspaceToolTab(focusedTab)),
      hasRootCollections: rootCollections.length > 0,
      hasCollectionPath: Boolean(lastCollectionPath),
      sourceIsEmulator: status.authType === 'emulator'
    }),
    [
      focusedActiveId,
      focusedTab,
      handleCloseTab,
      handleCloseOtherTabs,
      handleToggleSplit,
      lastCollectionPath,
      openImpExp,
      openEmulatorImpExp,
      openTransport,
      openDiff,
      rootCollections.length,
      splitEnabled,
      status.authType,
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
          tab.projectId === currentTab.projectId &&
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
        label: IMP_EXP_TAB_LABEL,
        detail: 'Import / Export',
        run: () => openImpExp()
      },
      {
        id: 'open-transport',
        group: 'タブ',
        label: TRANSPORT_TAB_LABEL,
        detail: 'プロジェクト間コピー',
        run: () => openTransport()
      },
      {
        id: 'open-diff',
        group: 'タブ',
        label: DIFF_TAB_LABEL,
        detail: 'コレクション ↔ JSON',
        run: () => openDiff()
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
      const label = workspaceTabLabel(
        tab,
        showProjectLabel && isCollectionTab(tab) ? projectLabelFor(tab.projectId) : undefined
      )
      items.push({
        id: `focus-tab-${tab.id}`,
        group: '開いているタブ',
        label,
        detail: isImpExpTab(tab)
          ? IMP_EXP_TAB_LABEL
          : isEmulatorImpExpTab(tab)
            ? EMULATOR_IMP_EXP_TAB_LABEL
            : isTransportTab(tab)
              ? TRANSPORT_TAB_LABEL
              : isDiffTab(tab)
                ? DIFF_TAB_LABEL
                : `${tab.collectionPath}（${tab.pane === 'primary' ? '左' : '右'}）`,
        run: () => activateInPane(tab.id, tab.pane)
      })

      if (splitEnabled && tab.pane === 'primary') {
        items.push({
          id: `move-right-${tab.id}`,
          group: 'Split',
          label: `右ペインへ移す: ${label}`,
          detail: isImpExpTab(tab)
            ? IMP_EXP_TAB_LABEL
            : isEmulatorImpExpTab(tab)
              ? EMULATOR_IMP_EXP_TAB_LABEL
              : isTransportTab(tab)
                ? TRANSPORT_TAB_LABEL
                : isDiffTab(tab)
                  ? DIFF_TAB_LABEL
                  : tab.collectionPath,
          run: () => moveTabToPane(tab.id, 'secondary')
        })
      }

      if (splitEnabled && tab.pane === 'secondary') {
        items.push({
          id: `move-left-${tab.id}`,
          group: 'Split',
          label: `左ペインへ移す: ${label}`,
          detail: isImpExpTab(tab)
            ? IMP_EXP_TAB_LABEL
            : isEmulatorImpExpTab(tab)
              ? EMULATOR_IMP_EXP_TAB_LABEL
              : isTransportTab(tab)
                ? TRANSPORT_TAB_LABEL
                : isDiffTab(tab)
                  ? DIFF_TAB_LABEL
                  : tab.collectionPath,
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
    openTransport,
    openDiff,
    projectLabelFor,
    rootCollections,
    showProjectLabel,
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
        projectLabelFor={projectLabelFor}
        showProjectLabel={showProjectLabel}
        onActivate={(tabId) => activateInPane(tabId, pane)}
        onClose={handleCloseTab}
      />

      {active ? (
        <WorkspacePane
          status={
            isWorkspaceToolTab(active)
              ? status
              : connectionStatusForTab(status, active, workspaceEntries)
          }
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
          transportDraft={transportDraft}
          onTransportDraftChange={handleTransportDraftChange}
          diffDraft={diffDraft}
          onDiffDraftChange={handleDiffDraftChange}
          sourceLabel={focusedEntry?.label ?? status.projectId}
          sourceCollectionPath={lastCollectionPath}
          emulatorPageMode={emulatorImpExpMode}
          onEmulatorModeChange={setEmulatorImpExpMode}
          emulatorHost={emulatorHost}
          emulatorDestinationPoolId={
            status.authType === 'emulator' ? status.projectId : null
          }
          emulatorDestinationLabel={
            status.authType === 'emulator'
              ? (focusedEntry?.label ?? focusedEntry?.emulatorProjectId ?? null)
              : null
          }
          onEmulatorWorkspaceChanged={onWorkspaceChanged}
          onCloseEmulatorImpExp={handleCloseEmulatorImpExp}
          onChangeView={(nextView) => handlePaneViewChange(active.id, nextView)}
          onSelectCollection={(path) => handlePaneCollectionChange(active.id, path)}
          onSelectDocument={(path) => handlePaneDocumentChange(active.id, path)}
          onRootCollectionsChanged={() => {
            if (active.projectId === projectId) {
              void loadRootCollections()
            }
          }}
          onRequestCreateCollection={handleRequestCreateCollection}
          onRequestCreateDocument={(path) => handleRequestCreateDocument(path, active.projectId)}
          onRequestDuplicateDocument={(path) =>
            handleRequestDuplicateDocument(path, active.projectId)
          }
          onRequestRenameCollection={(path) => handleRequestRenameCollection(path, active.projectId)}
          onRequestCreateSubcollection={(path) =>
            handleRequestCreateSubcollection(path, active.projectId)
          }
          onRequestDeleteSubcollection={(path) =>
            handleRequestDeleteSubcollection(path, active.projectId)
          }
          onRequestFieldBulk={(mode) => {
            if (isCollectionTab(active) && active.collectionPath) {
              handleRequestFieldBulk(active.collectionPath, mode, active.projectId)
            }
          }}
          collectionDataReloadToken={collectionDataReloadToken}
          onCollectionDocumentsChanged={() => {
            if (active.projectId === projectId) {
              setTreeContentReloadToken((token) => token + 1)
            }
          }}
          onCollectionBecameEmpty={(path) => void handleCollectionBecameEmpty(path, active.projectId)}
          onOpenDocumentPath={(path) => void handleOpenDocumentPath(path, active.projectId)}
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
            onDuplicateCollection={(path) => void handleRequestDuplicateCollection(path)}
            onDeleteCollection={handleRequestDeleteSubcollection}
            onCreateDocument={handleRequestCreateDocument}
            onFieldBulk={handleRequestFieldBulk}
            onDuplicateDocument={handleRequestDuplicateDocument}
            onDeleteDocument={(path) => void handleRequestDeleteDocument(path)}
            onCreateSubcollection={handleRequestCreateSubcollection}
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
          projectId={dialogProjectId}
          collectionPath={renameCollectionPath}
          open
          onClose={() => setRenameCollectionPath(null)}
          onRenamed={handleRenameDialogCompleted}
        />
      )}

      {fieldBulk && (
        <FieldBulkRenameDialog
          projectId={dialogProjectId}
          collectionPath={fieldBulk.path}
          initialMode={fieldBulk.mode}
          open
          onClose={() => setFieldBulk(null)}
          onCompleted={handleFieldBulkCompleted}
        />
      )}

      {createCollectionOpen && (
        <CollectionCreateDialog
          projectId={dialogProjectId}
          open
          onClose={() => setCreateCollectionOpen(false)}
          onCreated={handleCollectionCreated}
        />
      )}

      {createDocumentCollectionPath && (
        <DocumentCreateDialog
          projectId={dialogProjectId}
          collectionPath={createDocumentCollectionPath}
          open
          onClose={() => setCreateDocumentCollectionPath(null)}
          onCreated={handleDocumentCreated}
        />
      )}

      {duplicateDocumentPath && (
        <DocumentDuplicateDialog
          projectId={dialogProjectId}
          documentPath={duplicateDocumentPath}
          open
          onClose={() => setDuplicateDocumentPath(null)}
          onDuplicated={handleDocumentCreated}
        />
      )}

      {createSubcollectionDocumentPath && (
        <SubcollectionCreateDialog
          projectId={dialogProjectId}
          documentPath={createSubcollectionDocumentPath}
          open
          onClose={() => setCreateSubcollectionDocumentPath(null)}
          onCreated={handleSubcollectionCreated}
        />
      )}

      {deleteSubcollectionPath && (
        <SubcollectionDeleteDialog
          projectId={dialogProjectId}
          collectionPath={deleteSubcollectionPath}
          open
          onClose={() => setDeleteSubcollectionPath(null)}
          onDeleted={() => {
            handleSubcollectionDeleted(deleteSubcollectionPath, dialogProjectId)
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
