import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceEntry, WorkspaceState } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type ListConnectDialogProps = {
  open: boolean
  onClose: () => void
  onConnected: () => void
}

function ListConnectDialog({
  open,
  onClose,
  onConnected
}: ListConnectDialogProps): React.JSX.Element | null {
  const t = useT()
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setState(await window.api.workspace.getState())
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    setBusy(false)
    setError(null)
    void refresh()
  }, [open, refresh])

  const handleConnect = async (entry: WorkspaceEntry): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const result = await window.api.workspace.setFocused(entry.id)

      if (!result.ok) {
        setError(result.error)
        return
      }

      onConnected()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  const entries = state?.entries ?? []
  const loadedIds = new Set(state?.loadedProjectIds ?? [])

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">{t('list_connect.title')}</h2>
          <p className="project-export-dialog__lead">{t('list_connect.lead')}</p>
        </header>

        {entries.length === 0 ? (
          <p className="project-export-dialog__error">{t('list_connect.empty')}</p>
        ) : (
          <ul className="workspace-panel__list">
            {entries.map((entry) => {
              const isLoaded = loadedIds.has(entry.id)

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="workspace-panel__item"
                    onClick={() => void handleConnect(entry)}
                    disabled={busy}
                  >
                    <span
                      className="workspace-panel__dot"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden
                    />
                    <span className="workspace-panel__item-body">
                      <span className="workspace-panel__label">{entry.label}</span>
                      <span className="workspace-panel__meta">
                        {entry.authType === 'google' ? 'google' : 'json'}
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

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ListConnectDialog
