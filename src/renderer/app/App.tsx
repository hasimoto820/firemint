import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import ExplorerPage from '@features/explorer/renderer/ui/ExplorerPage'
import QueryPage from '@features/query/renderer/ui/QueryPage'
import WorkspacePanel from '@features/workspace/renderer/ui/WorkspacePanel'
import type { AppView } from '@shared/shell/AppNav'

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

  const handleWorkspaceChanged = (): void => {
    setRefreshKey((current) => current + 1)
  }

  if (connectionStatus === undefined) {
    return <main className="app-shell">読み込み中...</main>
  }

  if (!connectionStatus) {
    return (
      <main className="app-shell app-shell--landing">
        <WorkspacePanel onChanged={handleWorkspaceChanged} />
        <ConnectionPanel onConnected={handleWorkspaceChanged} />
      </main>
    )
  }

  if (view === 'query') {
    return (
      <QueryPage
        key={connectionStatus.projectId}
        initialStatus={connectionStatus}
        onDisconnected={handleWorkspaceChanged}
        onWorkspaceChanged={handleWorkspaceChanged}
        onNavigate={setView}
      />
    )
  }

  return (
    <ExplorerPage
      key={connectionStatus.projectId}
      initialStatus={connectionStatus}
      onDisconnected={handleWorkspaceChanged}
      onWorkspaceChanged={handleWorkspaceChanged}
      onNavigate={setView}
    />
  )
}

export default App
