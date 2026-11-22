import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectResult, ConnectionStatus } from '@features/connection/shared/types'
import { workspaceAuthLabel, type WorkspaceState } from '@features/workspace/shared/types'

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
  const { t } = useI18n()
  const [mode, setMode] = useState<ConnectMode>('list')
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const initialModeChosenRef = useRef(false)

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const next = await window.api.workspace.getState()
    setWorkspace(next)

    // 最初の 1 回だけ。登録済みが無ければ（初めて使う人）、リストではなく Google を開く
    if (!initialModeChosenRef.current) {
      initialModeChosenRef.current = true
      if (next.entries.length === 0) {
        setMode('google')
      }
    }
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
      setError(error instanceof Error ? error.message : t('conn.err_connect'))
    } finally {
      setLoading(false)
    }
  }

  const handleJsonConnect = async (): Promise<void> => {
    if (!selectedFile) {
      setError(t('conn.err_select_sa'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.connection.connect(selectedFile)
      await applyConnectResult(result)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('conn.err_connect'))
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
      <p className="connection-panel__lead">{t('conn.connect_lead')}</p>

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
          {t('conn.list')}
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
          {t('conn.sa_json')}
        </button>
      </div>

      {mode === 'list' && (
        <div className="connection-panel__list">
          <p className="connection-panel__hint">{t('conn.click_to_connect')}</p>
          {entries.length === 0 ? (
            <p className="connection-panel__empty">{t('conn.no_saved')}</p>
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
            {t('conn.select_json')}
          </button>
          <button
            type="button"
            onClick={() => void handleJsonConnect()}
            disabled={loading || !selectedFile}
          >
            {t('conn.connect')}
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
            {t('conn.connect')}
          </button>
        </div>
      )}

      {status && (
        <div className="connection-panel__actions">
          <button type="button" onClick={() => void handleDisconnect()} disabled={loading}>
            {t('common.disconnect')}
          </button>
        </div>
      )}

      {mode === 'json' && selectedFile && (
        <p className="connection-panel__file">{t('conn.selected', { file: selectedFile })}</p>
      )}
      {loading && <p className="connection-panel__loading">{t('conn.connecting')}</p>}
      {error && <p className="connection-panel__error">{error}</p>}

      {status && (
        <div className="connection-panel__status">
          <p>
            {t('conn.project_label')} <strong>{status.projectId}</strong>
          </p>
          <p>
            {status.authType === 'emulator'
              ? 'Emulator'
              : status.authType === 'google'
                ? t('conn.google_account')
                : t('conn.service_account')}
            : {status.clientEmail}
          </p>
          {status.writeBlockedReason && (
            <p className="connection-panel__warning">{status.writeBlockedReason}</p>
          )}
          <div>
            <p>{t('conn.root_collections', { count: rootCollections.length })}</p>
            {rootCollections.length > 0 ? (
              <ul>
                {rootCollections.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p>{t('conn.no_collections_or_permission')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default ConnectionPanel
