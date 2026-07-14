import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import WorkspacePanel from '@features/workspace/renderer/ui/WorkspacePanel'
import FirestorePage from './FirestorePage'
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
  const [view, setView] = useState<AppView>('explorer')
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuContext, setMenuContext] = useState<AppMenuContextActions | null>(null)

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
        context: menuContext,
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
      menuContext,
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
      />
    )
  }

  return (
    <AppMenuRegistryProvider value={registerMenu}>
      <AppChrome title={chromeTitle} menus={menus}>
        {content}
      </AppChrome>
    </AppMenuRegistryProvider>
  )
}

export default App
