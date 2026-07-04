import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ConnectionPanel from '@features/connection/renderer/ui/ConnectionPanel'
import ExplorerPage from '@features/explorer/renderer/ui/ExplorerPage'

function App(): React.JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null | undefined>(
    undefined
  )

  useEffect(() => {
    void window.api.connection.getStatus().then(setConnectionStatus)
  }, [])

  if (connectionStatus === undefined) {
    return <main className="app-shell">読み込み中...</main>
  }

  if (!connectionStatus) {
    return (
      <main className="app-shell">
        <ConnectionPanel onConnected={() => void window.api.connection.getStatus().then(setConnectionStatus)} />
      </main>
    )
  }

  return (
    <ExplorerPage
      initialStatus={connectionStatus}
      onDisconnected={() => setConnectionStatus(null)}
    />
  )
}

export default App
