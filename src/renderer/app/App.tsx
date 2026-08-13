import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import GoogleConnectDialog from '@features/connection/renderer/ui/GoogleConnectDialog'
import ProjectExportDialog from '@features/data_transfer/renderer/ui/ProjectExportDialog'
import ProjectImportDialog from '@features/data_transfer/renderer/ui/ProjectImportDialog'
import WorkspacePanel from '@features/workspace/renderer/ui/WorkspacePanel'
import FirestorePage, { type ShellCommands } from './FirestorePage'
import type { AppView } from '@shared/shell/AppNav'
import AppChrome from '@shared/shell/AppChrome'
import { AppMenuRegistryProvider } from '@shared/shell/AppMenuContext'
import {
  buildAppMenus,
  FIREMINT_DOCS_URL,
  type AppMenuContextActions
} from '@shared/shell/build_app_menus'

function App(): React.JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null | undefined>(
    undefined
  )
  const [hasGoogleWorkspace, setHasGoogleWorkspace] = useState(false)
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([])
  const [view, setView] = useState<AppView>('simple')
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuContext, setMenuContext] = useState<AppMenuContextActions | null>(null)
  const [shellCommands, setShellCommands] = useState<ShellCommands | null>(null)
  const [projectExportOpen, setProjectExportOpen] = useState(false)
  const [projectImportOpen, setProjectImportOpen] = useState(false)
  const [googleConnectOpen, setGoogleConnectOpen] = useState(false)
  const [rootsReloadToken, setRootsReloadToken] = useState(0)

  const refreshStatus = useCallback(async (): Promise<void> => {
    const [status, workspace] = await Promise.all([
      window.api.connection.getStatus(),
      window.api.workspace.getState()
    ])
    setConnectionStatus(status)
    setHasGoogleWorkspace(workspace.entries.some((entry) => entry.authType === 'google'))
    setWorkspaceEntries(workspace.entries)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshKey, refreshStatus])

  const handleWorkspaceChanged = useCallback((): void => {
    setRefreshKey((current) => current + 1)
  }, [])

  const handleDisconnect = useCallback(async (): Promise<void> => {
    await window.api.connection.disconnect()
    handleWorkspaceChanged()
  }, [handleWorkspaceChanged])

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
  const canDisconnect = connected || hasGoogleWorkspace
  const canImportProject = workspaceEntries.length > 0
  const platform = window.electron.process.platform
  const useWindowMenuActions = platform === 'linux'

  const handleExportProject = useCallback((): void => {
    setProjectExportOpen(true)
  }, [])

  const handleImportProject = useCallback((): void => {
    setProjectImportOpen(true)
  }, [])

  const handleGoogleConnect = useCallback((): void => {
    setGoogleConnectOpen(true)
  }, [])

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
        onExportProject: handleExportProject,
        onImportProject: handleImportProject,
        canImportProject,
        onGoogleConnect: handleGoogleConnect,
        onJsonConnect: () => void handleJsonConnect(),
        context: menuContext,
        shell: shellCommands
          ? {
              openCommandPalette: shellCommands.openCommandPalette,
              toggleSplit: shellCommands.toggleSplit,
              closeActiveTab: shellCommands.closeActiveTab,
              closeOtherTabs: shellCommands.closeOtherTabs,
              canCloseTab: shellCommands.canCloseTab,
              canCloseOtherTabs: shellCommands.canCloseOtherTabs,
              splitEnabled: shellCommands.splitEnabled
            }
          : null,
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
      view,
      handleDisconnect,
      handleQuit,
      handleAbout,
      handleOpenDocs,
      handleExportProject,
      handleImportProject,
      handleGoogleConnect,
      handleJsonConnect,
      menuContext,
      shellCommands,
      useWindowMenuActions
    ]
  )

  const chromeTitle = connectionStatus?.projectId ?? 'FireMint'

  let content: React.JSX.Element

  if (connectionStatus === undefined) {
    content = <main className="app-shell app-shell--loading">読み込み中...</main>
  } else if (!connectionStatus) {
    content = (
      <main className="app-shell app-shell--landing">
        <WorkspacePanel onChanged={handleWorkspaceChanged} />
        <ConnectionPanel
          onConnected={handleWorkspaceChanged}
          onRequestGoogleConnect={handleGoogleConnect}
        />
      </main>
    )
  } else {
    content = (
      <FirestorePage
        key={connectionStatus.projectId}
        status={connectionStatus}
        view={view}
        onNavigate={setView}
        onDisconnected={handleWorkspaceChanged}
        onWorkspaceChanged={handleWorkspaceChanged}
        onShellCommandsChange={setShellCommands}
        rootsReloadToken={rootsReloadToken}
      />
    )
  }

  return (
    <AppMenuRegistryProvider value={registerMenu}>
      <AppChrome title={chromeTitle} menus={menus}>
        {content}
        <GoogleConnectDialog
          open={googleConnectOpen}
          onClose={() => setGoogleConnectOpen(false)}
          onConnected={handleWorkspaceChanged}
        />
        <ProjectImportDialog
          projectId={connectionStatus?.projectId ?? null}
          destinations={workspaceEntries}
          open={projectImportOpen}
          onClose={() => setProjectImportOpen(false)}
          onImported={handleProjectImported}
        />
        {connectionStatus && (
          <ProjectExportDialog
            projectId={connectionStatus.projectId}
            open={projectExportOpen}
            onClose={() => setProjectExportOpen(false)}
          />
        )}
      </AppChrome>
    </AppMenuRegistryProvider>
  )
}

export default App
