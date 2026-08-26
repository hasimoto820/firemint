import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import GoogleConnectDialog from '@features/connection/renderer/ui/GoogleConnectDialog'
import ListConnectDialog from '@features/connection/renderer/ui/ListConnectDialog'
import EmulatorConnectDialog from '@features/emulator/renderer/ui/EmulatorConnectDialog'
import ProjectImportDialog from '@features/data_transfer/renderer/ui/ProjectImportDialog'
import FirestorePage, { type ShellCommands } from './FirestorePage'
import type { AppView } from '@shared/shell/AppNav'
import AppChrome from '@shared/shell/AppChrome'
import { AppMenuRegistryProvider } from '@shared/shell/AppMenuContext'
import {
  buildAppMenus,
  FIREMINT_DOCS_URL,
  type AppMenuContextActions
} from '@shared/shell/build_app_menus'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { confirmAction } from '@shared/ui/confirmAction'

function App(): React.JSX.Element {
  const { t, ready } = useI18n()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null | undefined>(
    undefined
  )
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([])
  const [loadedProjectIds, setLoadedProjectIds] = useState<string[]>([])
  const [writeBlockedReasons, setWriteBlockedReasons] = useState<Record<string, string>>({})
  const [view, setView] = useState<AppView>('simple')
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuContext, setMenuContext] = useState<AppMenuContextActions | null>(null)
  const [shellCommands, setShellCommands] = useState<ShellCommands | null>(null)
  const [projectImportOpen, setProjectImportOpen] = useState(false)
  const [googleConnectOpen, setGoogleConnectOpen] = useState(false)
  const [listConnectOpen, setListConnectOpen] = useState(false)
  const [emulatorConnectOpen, setEmulatorConnectOpen] = useState(false)
  const [rootsReloadToken, setRootsReloadToken] = useState(0)

  const refreshStatus = useCallback(async (): Promise<void> => {
    const [status, workspace] = await Promise.all([
      window.api.connection.getStatus(),
      window.api.workspace.getState()
    ])
    setConnectionStatus(status)
    setWorkspaceEntries(workspace.entries)
    setLoadedProjectIds(workspace.loadedProjectIds)
    setWriteBlockedReasons(workspace.writeBlockedReasons)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshKey, refreshStatus])

  const handleWorkspaceChanged = useCallback(async (): Promise<void> => {
    await refreshStatus()
    setRefreshKey((current) => current + 1)
  }, [refreshStatus])

  const startupDiscoverDone = useRef(false)

  useEffect(() => {
    if (!ready || connectionStatus === undefined || startupDiscoverDone.current) {
      return
    }

    startupDiscoverDone.current = true
    let cancelled = false

    void (async () => {
      const settings = await window.api.settings.get()
      if (!settings.autoDiscoverEmulator || cancelled) {
        return
      }

      const result = await window.api.emulator.discover()
      if (!result.ok || cancelled || result.data.length === 0) {
        return
      }

      if (result.data.length === 1) {
        const connected = await window.api.connection.connectEmulator({
          host: result.data[0].firestoreHost,
          projectId: result.data[0].projectId
        })
        if (!connected.ok || cancelled) {
          return
        }

        await handleWorkspaceChanged()
        return
      }

      setEmulatorConnectOpen(true)
    })()

    return () => {
      cancelled = true
    }
  }, [connectionStatus, handleWorkspaceChanged, ready])

  const handleDisconnect = useCallback(async (): Promise<void> => {
    if (!(await confirmAction(t('workspace.disconnect_confirm')))) {
      return
    }

    await window.api.connection.disconnect()
    handleWorkspaceChanged()
  }, [handleWorkspaceChanged, t])

  const handleAbout = useCallback(async (): Promise<void> => {
    const about = await window.api.app.getAbout()
    window.alert(`${about.name} ${about.version}\n\n${about.description}`)
  }, [])

  const handleOpenDocs = useCallback((): void => {
    void window.api.app.openExternal(FIREMINT_DOCS_URL)
  }, [])

  const handleQuit = useCallback((): void => {
    void window.api.app.quit()
  }, [])

  const registerMenu = useCallback((actions: AppMenuContextActions | null): void => {
    setMenuContext(actions)
  }, [])

  const connected = Boolean(connectionStatus)
  const canDisconnect = connected
  const canImportProject = workspaceEntries.length > 0
  const canListConnect = workspaceEntries.length > 0
  const focusedIsEmulator = connectionStatus?.authType === 'emulator'
  const loadedEmulator = workspaceEntries.find(
    (entry) => entry.authType === 'emulator' && loadedProjectIds.includes(entry.id)
  )
  const canEmulatorImportProject = Boolean(loadedEmulator)
  const emulatorHasCollections = focusedIsEmulator && shellCommands?.hasRootCollections === true
  const canEmulatorImportCollection = emulatorHasCollections
  const canEmulatorExport =
    emulatorHasCollections && Boolean(shellCommands?.openEmulatorImpExp)
  const platform = window.electron.process.platform
  const useWindowMenuActions = platform === 'linux'

  const handleImportProject = useCallback((): void => {
    if (shellCommands) {
      shellCommands.openImpExp({ direction: 'import', target: 'project' })
      return
    }

    setProjectImportOpen(true)
  }, [shellCommands])

  const handleListConnect = useCallback((): void => {
    setListConnectOpen(true)
  }, [])

  const handleGoogleConnect = useCallback((): void => {
    setGoogleConnectOpen(true)
  }, [])

  const handleEmulatorConnect = useCallback((): void => {
    setEmulatorConnectOpen(true)
  }, [])

  const handleEmulatorImportProject = useCallback((): void => {
    shellCommands?.openEmulatorImpExp('import-project')
  }, [shellCommands])

  const handleEmulatorImportCollection = useCallback((): void => {
    shellCommands?.openEmulatorImpExp('import-collection')
  }, [shellCommands])

  const handleEmulatorExportProject = useCallback((): void => {
    shellCommands?.openEmulatorImpExp('export-project')
  }, [shellCommands])

  const handleEmulatorExportGroup = useCallback((): void => {
    shellCommands?.openEmulatorImpExp('export-group')
  }, [shellCommands])

  const handleEmulatorExportCollection = useCallback((): void => {
    shellCommands?.openEmulatorImpExp('export-collection')
  }, [shellCommands])

  const handleJsonConnect = useCallback(async (): Promise<void> => {
    const filePath = await window.api.connection.selectServiceAccountFile()

    if (!filePath) {
      return
    }

    const result = await window.api.connection.connect(filePath)

    if (!result.ok) {
      window.alert(result.error)
      return
    }

    handleWorkspaceChanged()
  }, [handleWorkspaceChanged])

  const handleProjectImported = useCallback((): void => {
    setRootsReloadToken((current) => current + 1)
  }, [])

  const menus = useMemo(
    () =>
      buildAppMenus({
        connected,
        canDisconnect,
        activeView: view,
        onDisconnect: () => void handleDisconnect(),
        onNavigate: setView,
        onQuit: handleQuit,
        onAbout: () => void handleAbout(),
        onOpenDocs: handleOpenDocs,
        onImportProject: handleImportProject,
        canImportProject,
        onListConnect: handleListConnect,
        canListConnect,
        onGoogleConnect: handleGoogleConnect,
        onJsonConnect: () => void handleJsonConnect(),
        onEmulatorConnect: handleEmulatorConnect,
        onEmulatorImportProject: handleEmulatorImportProject,
        onEmulatorImportCollection: handleEmulatorImportCollection,
        onEmulatorExportProject: handleEmulatorExportProject,
        onEmulatorExportGroup: handleEmulatorExportGroup,
        onEmulatorExportCollection: handleEmulatorExportCollection,
        canEmulatorImportProject,
        canEmulatorImportCollection,
        canEmulatorExport,
        context: menuContext,
        shell: shellCommands
          ? {
              openCommandPalette: shellCommands.openCommandPalette,
              openImpExp: shellCommands.openImpExp,
              openEmulatorImpExp: shellCommands.openEmulatorImpExp,
              openTransport: shellCommands.openTransport,
              openDiff: shellCommands.openDiff,
              toggleSplit: shellCommands.toggleSplit,
              closeActiveTab: shellCommands.closeActiveTab,
              closeOtherTabs: shellCommands.closeOtherTabs,
              canCloseTab: shellCommands.canCloseTab,
              canCloseOtherTabs: shellCommands.canCloseOtherTabs,
              splitEnabled: shellCommands.splitEnabled,
              impExpActive: shellCommands.impExpActive,
              toolTabActive: shellCommands.toolTabActive,
              hasCollectionPath: shellCommands.hasCollectionPath,
              sourceIsEmulator: shellCommands.sourceIsEmulator
            }
          : null,
        t,
        onOpenSettings: () => {
          void window.api.settings.openWindow()
        },
        ...(useWindowMenuActions
          ? {
              onMinimize: () => void window.api.window.minimize(),
              onMaximizeToggle: () => void window.api.window.maximizeToggle()
            }
          : {})
      }),
    [
      connected,
      canDisconnect,
      canImportProject,
      canListConnect,
      view,
      handleDisconnect,
      handleQuit,
      handleAbout,
      handleOpenDocs,
      handleImportProject,
      handleListConnect,
      handleGoogleConnect,
      handleJsonConnect,
      handleEmulatorConnect,
      handleEmulatorImportProject,
      handleEmulatorImportCollection,
      handleEmulatorExportProject,
      handleEmulatorExportGroup,
      handleEmulatorExportCollection,
      canEmulatorImportProject,
      canEmulatorImportCollection,
      canEmulatorExport,
      menuContext,
      shellCommands,
      useWindowMenuActions,
      t
    ]
  )

  const chromeTitle = connectionStatus?.projectId ?? 'FireMint'

  let content: React.JSX.Element

  if (!ready || connectionStatus === undefined) {
    content = <main className="app-shell app-shell--loading">{t('common.busy')}</main>
  } else if (!connectionStatus) {
    content = (
      <main className="app-shell app-shell--landing">
        <ConnectionPanel
          onConnected={handleWorkspaceChanged}
          onRequestGoogleConnect={handleGoogleConnect}
          refreshToken={refreshKey}
        />
      </main>
    )
  } else {
    content = (
      <FirestorePage
        status={connectionStatus}
        view={view}
        onNavigate={setView}
        onWorkspaceChanged={handleWorkspaceChanged}
        onShellCommandsChange={setShellCommands}
        rootsReloadToken={rootsReloadToken}
        workspaceRefreshToken={refreshKey}
        workspaceEntries={workspaceEntries}
        loadedProjectIds={loadedProjectIds}
        writeBlockedReasons={writeBlockedReasons}
      />
    )
  }

  return (
    <AppMenuRegistryProvider value={registerMenu}>
      <AppChrome title={chromeTitle} menus={menus}>
        {content}
        <ListConnectDialog
          open={listConnectOpen}
          onClose={() => setListConnectOpen(false)}
          onConnected={handleWorkspaceChanged}
        />
        <GoogleConnectDialog
          open={googleConnectOpen}
          onClose={() => setGoogleConnectOpen(false)}
          onConnected={handleWorkspaceChanged}
        />
        <EmulatorConnectDialog
          open={emulatorConnectOpen}
          onClose={() => setEmulatorConnectOpen(false)}
          onConnected={handleWorkspaceChanged}
        />
        <ProjectImportDialog
          projectId={connectionStatus?.projectId ?? null}
          destinations={workspaceEntries}
          open={projectImportOpen}
          onClose={() => setProjectImportOpen(false)}
          onImported={handleProjectImported}
        />
      </AppChrome>
    </AppMenuRegistryProvider>
  )
}

export default App
