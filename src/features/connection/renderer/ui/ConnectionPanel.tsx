import { useEffect, useState } from 'react'
import type { ConnectResult, ConnectionStatus } from '@features/connection/shared/types'
import EnvironmentBadge from '@shared/ui/EnvironmentBadge'

type ConnectionPanelProps = {
  onConnected?: () => void
}

function ConnectionPanel({ onConnected }: ConnectionPanelProps): React.JSX.Element {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void window.api.connection.getStatus().then(setStatus)
  }, [])

  const handleSelectFile = async (): Promise<void> => {
    setError(null)
    const filePath = await window.api.connection.selectServiceAccountFile()
    setSelectedFile(filePath)
  }

  const applyConnectResult = async (result: ConnectResult): Promise<void> => {
    if (!result.ok) {
      setError(result.error)
      setStatus(null)
      setRootCollections([])
      return
    }

    setError(null)
    setRootCollections(result.rootCollections)
    setStatus(await window.api.connection.getStatus())
    onConnected?.()
  }

  const handleConnect = async (): Promise<void> => {
    if (!selectedFile) {
      setError('サービスアカウント JSON を選択してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.connection.connect(selectedFile)
      await applyConnectResult(result)
    } catch (error) {
      setError(error instanceof Error ? error.message : '接続に失敗しました')
      setStatus(null)
      setRootCollections([])
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      await window.api.connection.disconnect()
      setStatus(null)
      setRootCollections([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="connection-panel">
      <h1 className="connection-panel__brand">FireMint</h1>
      <p className="connection-panel__lead">サービスアカウント JSON で Firestore に接続</p>

      <div className="connection-panel__actions">
        <button type="button" onClick={() => void handleSelectFile()} disabled={loading}>
          JSON を選択
        </button>
        <button type="button" onClick={() => void handleConnect()} disabled={loading || !selectedFile}>
          接続
        </button>
        {status && (
          <button type="button" onClick={() => void handleDisconnect()} disabled={loading}>
            切断
          </button>
        )}
      </div>

      {selectedFile && <p className="connection-panel__file">選択: {selectedFile}</p>}
      {loading && <p className="connection-panel__loading">接続中...</p>}
      {error && <p className="connection-panel__error">{error}</p>}

      {status && (
        <div className="connection-panel__status">
          <p>
            プロジェクト: <strong>{status.projectId}</strong>{' '}
            <EnvironmentBadge environment={status.environment} />
          </p>
          <p>サービスアカウント: {status.clientEmail}</p>
          {status.environment === 'production' && (
            <p className="connection-panel__warning">本番プロジェクトに接続しています。操作に注意してください。</p>
          )}
          <div>
            <p>ルートコレクション ({rootCollections.length})</p>
            {rootCollections.length > 0 ? (
              <ul>
                {rootCollections.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p>（コレクションなし、または権限不足）</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default ConnectionPanel
