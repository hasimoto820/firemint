import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
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
  const [view, setView] = useState<AppView>('simple')
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuContext, setMenuContext] = useState<AppMenuContextActions | null>(null)
  const [shellCommands, setShellCommands] = useState<ShellCommands | null>(null)
  const [projectExportOpen, setProjectExportOpen] = useState(false)
  const [projectImportOpen, setProjectImportOpen] = useState(false)
  const [rootsReloadToken, setRootsReloadToken] = useState(0)

  const refreshStatus = useCallback(async (): Promise<void> => {
    setConnectionStatus(await window.api.connection.getStatus())
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
  const platform = window.electron.process.platform
  const useWindowMenuActions = platform === 'linux'

  const handleExportProject = useCallback((): void => {
    setProjectExportOpen(true)
  }, [])

  const handleImportProject = useCallback((): void => {
    setProjectImportOpen(true)
  }, [])

  const handleProjectImported = useCallback((): void => {
    setRootsReloadToken((current) => current + 1)
  }, [])

  const menus = useMemo(
    () =>
      buildAppMenus({
        connected,
        activeView: view,
        onDisconnect: () => void handleDisconnect(),
        onNavigate: setView,
        onQuit: handleQuit,
        onAbout: () => void handleAbout(),
        onOpenDocs: handleOpenDocs,
        onExportProject: handleExportProject,
        onImportProject: handleImportProject,
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
      view,
      handleDisconnect,
      handleQuit,
      handleAbout,
      handleOpenDocs,
      handleExportProject,
      handleImportProject,
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
        <ConnectionPanel onConnected={handleWorkspaceChanged} />
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
        {connectionStatus && (
          <>
            <ProjectExportDialog
              projectId={connectionStatus.projectId}
              open={projectExportOpen}
              onClose={() => setProjectExportOpen(false)}
            />
            <ProjectImportDialog
              projectId={connectionStatus.projectId}
              readOnly={connectionStatus.readOnly}
              open={projectImportOpen}
              onClose={() => setProjectImportOpen(false)}
              onImported={handleProjectImported}
            />
          </>
        )}
      </AppChrome>
    </AppMenuRegistryProvider>
  )
}

export default App
