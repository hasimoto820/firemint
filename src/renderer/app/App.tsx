import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import ExplorerPage from '@features/explorer/renderer/ui/ExplorerPage'
import QueryPage from '@features/query/renderer/ui/QueryPage'
import WorkspacePanel from '@features/workspace/renderer/ui/WorkspacePanel'
import type { AppView } from '@shared/shell/AppNav'
import AppChrome from '@shared/shell/AppChrome'
import { buildAppMenus, FIREMINT_DOCS_URL } from '@shared/shell/build_app_menus'

function App(): React.JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null | undefined>(
    undefined
  )
  const [view, setView] = useState<AppView>('explorer')
  const [refreshKey, setRefreshKey] = useState(0)

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

  const connected = Boolean(connectionStatus)
  const platform = window.electron.process.platform
  const useWindowMenuActions = platform === 'linux'

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
      useWindowMenuActions
    ]
  )

  const chromeTitle = connectionStatus?.projectId ?? 'FireMint'

  let content: React.JSX.Element

  if (connectionStatus === undefined) {
    content = <main className="app-shell">読み込み中...</main>
  } else if (!connectionStatus) {
    content = (
      <main className="app-shell app-shell--landing">
        <WorkspacePanel onChanged={handleWorkspaceChanged} />
        <ConnectionPanel onConnected={handleWorkspaceChanged} />
      </main>
    )
  } else if (view === 'query') {
    content = (
      <QueryPage
        key={connectionStatus.projectId}
        initialStatus={connectionStatus}
        onDisconnected={handleWorkspaceChanged}
        onWorkspaceChanged={handleWorkspaceChanged}
        onNavigate={setView}
      />
    )
  } else {
    content = (
      <ExplorerPage
        key={connectionStatus.projectId}
        initialStatus={connectionStatus}
        onDisconnected={handleWorkspaceChanged}
        onWorkspaceChanged={handleWorkspaceChanged}
        onNavigate={setView}
      />
    )
  }

  return (
    <AppChrome title={chromeTitle} menus={menus}>
      {content}
    </AppChrome>
  )
}

export default App
