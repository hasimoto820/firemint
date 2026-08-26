import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import type { EmulatorWizardStep } from '@features/emulator/shared/types'
import { workspaceAuthLabel, type WorkspaceEntry } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type EmulatorConnectDialogProps = {
  open: boolean
  onClose: () => void
  onConnected: () => void | Promise<void>
  defaultHost?: string
}

function EmulatorConnectDialog({
  open,
  onClose,
  onConnected,
  defaultHost = DEFAULT_EMULATOR_HOST
}: EmulatorConnectDialogProps): React.JSX.Element | null {
  const t = useT()
  const [step, setStep] = useState<EmulatorWizardStep>('connect')
  const [host, setHost] = useState(defaultHost)
  const [knownEntries, setKnownEntries] = useState<WorkspaceEntry[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshKnown = useCallback(async (): Promise<void> => {
    const state = await window.api.workspace.getState()
    const known = state.entries.filter((entry) => entry.authType === 'emulator')
    setKnownEntries(known)

    const first = known[0]
    if (!first) {
      setSelectedEntryId(null)
      return
    }

    setSelectedEntryId(first.id)
    if (first.emulatorHost) {
      setHost(first.emulatorHost)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    setStep('connect')
    setHost(defaultHost)
    setFilePath(null)
    setProjectId('')
    setBusy(false)
    setError(null)
    void refreshKnown()
  }, [open, defaultHost, refreshKnown])

  const handleSelectKnown = (entry: WorkspaceEntry): void => {
    setSelectedEntryId(entry.id)
    if (entry.emulatorHost) {
      setHost(entry.emulatorHost)
    }
  }

  const handleConnect = async (): Promise<void> => {
    const selected = knownEntries.find((entry) => entry.id === selectedEntryId)

    if (knownEntries.length === 0) {
      setError(null)
      setStep('import')
      return
    }

    if (!selected?.emulatorProjectId) {
      setError(t('emulator.select_known'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.connection.connectEmulator({
        host,
        projectId: selected.emulatorProjectId
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await onConnected()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleSelectZip = async (): Promise<void> => {
    setError(null)
    const selected = await window.api.dataTransfer.selectOfficialDump()

    if (selected.canceled || !selected.filePath) {
      return
    }

    setFilePath(selected.filePath)
  }

  const handleFinish = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      if (filePath) {
        const result = await window.api.emulator.importProjectZip({
          host,
          filePath
        })

        if (!result.ok) {
          setError(result.error)
          return
        }
      } else {
        const result = await window.api.connection.connectEmulator({
          host,
          projectId: projectId.trim()
        })

        if (!result.ok) {
          setError(result.error)
          return
        }
      }

      await onConnected()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  const title = t('emulator.title')
  const lead =
    step === 'import'
      ? t('emulator.connect_import_lead')
      : knownEntries.length > 0
        ? t('emulator.lead_known')
        : t('emulator.lead')

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">{title}</h2>
          <p className="project-export-dialog__lead">{lead}</p>
        </header>

        {step === 'connect' && (
          <>
            <p className="project-export-dialog__hint">{t('emulator.process_hint')}</p>
            <label className="project-export-dialog__option">
              <span>{t('emulator.host')}</span>
              <input
                className="bulk-actions__input"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                disabled={busy}
                spellCheck={false}
              />
            </label>
            {knownEntries.length > 0 ? (
              <ul className="workspace-panel__list">
                {knownEntries.map((entry) => {
                  const selected = entry.id === selectedEntryId

                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={
                          selected
                            ? 'workspace-panel__item workspace-panel__item--focused'
                            : 'workspace-panel__item'
                        }
                        onClick={() => handleSelectKnown(entry)}
                        disabled={busy}
                      >
                        <span
                          className="workspace-panel__dot"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden
                        />
                        <span className="workspace-panel__item-body">
                          <span className="workspace-panel__label">
                            {entry.emulatorProjectId ?? entry.id}
                          </span>
                          <span className="workspace-panel__meta">
                            {workspaceAuthLabel(entry.authType)}
                            {entry.readOnly ? ' · read-only' : ''}
                            {entry.label ? ` · ${entry.label}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </>
        )}

        {step === 'import' && (
          <>
            <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
              <Button onClick={() => void handleSelectZip()} disabled={busy}>
                {t('emulator.select_zip')}
              </Button>
            </div>
            {filePath ? (
              <p className="project-export-dialog__hint">{filePath}</p>
            ) : (
              <label className="project-export-dialog__option">
                <span>{t('emulator.project_id')}</span>
                <input
                  className="bulk-actions__input"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
            )}
          </>
        )}

        {busy && <p className="project-export-dialog__hint">{t('common.busy')}</p>}
        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {step === 'connect' ? (
            <Button
              variant="primary"
              onClick={() => void handleConnect()}
              disabled={busy || (knownEntries.length > 0 && !selectedEntryId)}
            >
              {knownEntries.length > 0 ? t('emulator.import') : t('common.next')}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void handleFinish()}
              disabled={busy}
            >
              {t('emulator.import')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmulatorConnectDialog
