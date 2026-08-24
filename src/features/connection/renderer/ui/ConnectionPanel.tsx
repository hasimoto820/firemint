import { useCallback, useEffect, useState } from 'react'
import type { ConnectResult, ConnectionStatus } from '@features/connection/shared/types'
import { workspaceAuthLabel, type WorkspaceState } from '@features/workspace/shared/types'
import EnvironmentBadge from '@shared/ui/EnvironmentBadge'

type ConnectionPanelProps = {
  onConnected?: () => void
  onRequestGoogleConnect?: () => void
  /** 親が名簿を更新したときに再取得する */
  refreshToken?: number
}

type ConnectMode = 'list' | 'json' | 'google'

function ConnectionPanel({
  onConnected,
  onRequestGoogleConnect,
  refreshToken = 0
}: ConnectionPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<ConnectMode>('list')
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    setWorkspace(await window.api.workspace.getState())
  }, [])

  useEffect(() => {
    void window.api.connection.getStatus().then(setStatus)
    void refreshWorkspace()
  }, [refreshToken, refreshWorkspace])

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
    await refreshWorkspace()
    onConnected?.()
  }

  const handleListConnect = async (projectId: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.setFocused(projectId)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setStatus(await window.api.connection.getStatus())
      await refreshWorkspace()
      onConnected?.()
    } catch (error) {
      setError(error instanceof Error ? error.message : '接続に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleJsonConnect = async (): Promise<void> => {
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
      await refreshWorkspace()
      onConnected?.()
    } finally {
      setLoading(false)
    }
  }

  const entries = workspace?.entries ?? []
  const loadedIds = new Set(workspace?.loadedProjectIds ?? [])
  const focusedId = workspace?.focusedProjectId ?? null

  return (
    <section className="connection-panel">
      <h1 className="connection-panel__brand">FireMint</h1>
      <p className="connection-panel__lead">Firestore に接続</p>

      <div className="connection-panel__mode">
        <button
          type="button"
          className={
            mode === 'list'
              ? 'connection-panel__mode-btn connection-panel__mode-btn--active'
              : 'connection-panel__mode-btn'
          }
          onClick={() => setMode('list')}
          disabled={loading}
        >
          リスト
        </button>
        <button
          type="button"
          className={
            mode === 'json'
              ? 'connection-panel__mode-btn connection-panel__mode-btn--active'
              : 'connection-panel__mode-btn'
          }
          onClick={() => setMode('json')}
          disabled={loading}
        >
          JSON
        </button>
        <button
          type="button"
          className={
            mode === 'google'
              ? 'connection-panel__mode-btn connection-panel__mode-btn--active'
              : 'connection-panel__mode-btn'
          }
          onClick={() => setMode('google')}
          disabled={loading}
        >
          Google
        </button>
      </div>

      {mode === 'list' && (
        <div className="connection-panel__list">
          <p className="connection-panel__hint">登録済みをクリックして接続します。</p>
          {entries.length === 0 ? (
            <p className="connection-panel__empty">
              登録済みがありません。JSON または Google で接続してください。
            </p>
          ) : (
            <ul className="workspace-panel__list">
              {entries.map((entry) => {
                const isFocused = entry.id === focusedId
                const isLoaded = loadedIds.has(entry.id)

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={
                        isFocused
                          ? 'workspace-panel__item workspace-panel__item--focused'
                          : 'workspace-panel__item'
                      }
                      onClick={() => void handleListConnect(entry.id)}
                      disabled={loading}
                    >
                      <span
                        className="workspace-panel__dot"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden
                      />
                      <span className="workspace-panel__item-body">
                        <span className="workspace-panel__label">{entry.label}</span>
                        <span className="workspace-panel__meta">
                          {workspaceAuthLabel(entry.authType)}
                          {entry.readOnly ? ' · read-only' : ''}
                          {isLoaded ? ' · loaded' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {mode === 'json' && (
        <div className="connection-panel__actions">
          <button type="button" onClick={() => void handleSelectFile()} disabled={loading}>
            JSON を選択
          </button>
          <button
            type="button"
            onClick={() => void handleJsonConnect()}
            disabled={loading || !selectedFile}
          >
            接続
          </button>
        </div>
      )}

      {mode === 'google' && (
        <div className="connection-panel__actions">
          <button
            type="button"
            onClick={() => onRequestGoogleConnect?.()}
            disabled={loading || !onRequestGoogleConnect}
          >
            Google でサインイン…
          </button>
        </div>
      )}

      {status && (
        <div className="connection-panel__actions">
          <button type="button" onClick={() => void handleDisconnect()} disabled={loading}>
            切断
          </button>
        </div>
      )}

      {mode === 'json' && selectedFile && (
        <p className="connection-panel__file">選択: {selectedFile}</p>
      )}
      {loading && <p className="connection-panel__loading">接続中...</p>}
      {error && <p className="connection-panel__error">{error}</p>}

      {status && (
        <div className="connection-panel__status">
          <p>
            プロジェクト: <strong>{status.projectId}</strong>{' '}
            <EnvironmentBadge environment={status.environment} />
          </p>
          <p>
            {status.authType === 'emulator'
              ? 'Emulator'
              : status.authType === 'google'
                ? 'Google アカウント'
                : 'サービスアカウント'}
            : {status.clientEmail}
          </p>
          {status.environment === 'production' && (
            <p className="connection-panel__warning">
              本番プロジェクトに接続しています。操作に注意してください。
            </p>
          )}
          {status.writeBlockedReason && (
            <p className="connection-panel__warning">{status.writeBlockedReason}</p>
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
