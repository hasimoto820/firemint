import { useState } from 'react'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import type { EmulatorWizardStep } from '@features/emulator/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type EmulatorPageProps = {
  onClose: () => void
  onWorkspaceChanged: () => void | Promise<void>
}

function EmulatorPage({ onClose, onWorkspaceChanged }: EmulatorPageProps): React.JSX.Element {
  const t = useT()
  const [step, setStep] = useState<EmulatorWizardStep>('connect')
  const [host, setHost] = useState(DEFAULT_EMULATOR_HOST)
  const [projectId, setProjectId] = useState('')
  const [poolId, setPoolId] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finish = async (): Promise<void> => {
    await onWorkspaceChanged()
    onClose()
  }

  const handleConnect = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const result = await window.api.connection.connectEmulator({
        host,
        projectId
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await onWorkspaceChanged()

      if (result.rootCollections.length > 0) {
        onClose()
        return
      }

      setPoolId(result.projectId)
      setStep('import')
    } finally {
      setBusy(false)
    }
  }

  const handleSelectJson = async (): Promise<void> => {
    setError(null)
    const selected = await window.api.dataTransfer.selectCollectionImportJson()

    if (selected.canceled || !selected.filePath) {
      return
    }

    const peek = await window.api.dataTransfer.peekCollectionImportJson(selected.filePath)

    if (!peek.ok) {
      setFilePath(null)
      setError(peek.error)
      return
    }

    setFilePath(selected.filePath)
  }

  const handleImport = async (): Promise<void> => {
    if (!poolId) {
      setError('接続情報がありません')
      return
    }

    if (!filePath) {
      setError(t('emulator.select_json'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.dataTransfer.importDocumentsJson({
        projectId: poolId,
        filePath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      finish()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="connection-panel emulator-page">
      <h1 className="connection-panel__brand">{t('emulator.title')}</h1>
      <p className="connection-panel__lead">
        {step === 'connect' ? t('emulator.lead') : t('emulator.import_lead')}
      </p>

      {step === 'connect' && (
        <>
          <p className="connection-panel__hint">{t('emulator.process_hint')}</p>
          <label className="emulator-page__field">
            <span>{t('emulator.host')}</span>
            <input
              className="workspace-panel__input"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              disabled={busy}
              spellCheck={false}
            />
          </label>
          <label className="emulator-page__field">
            <span>{t('emulator.project_id')}</span>
            <input
              className="workspace-panel__input"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={busy}
              spellCheck={false}
            />
          </label>
          <div className="connection-panel__actions">
            <Button onClick={() => void handleConnect()} disabled={busy} variant="primary">
              {t('common.next')}
            </Button>
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}

      {step === 'import' && (
        <>
          <div className="connection-panel__actions">
            <Button onClick={() => void handleSelectJson()} disabled={busy}>
              {t('emulator.select_json')}
            </Button>
          </div>
          {filePath && <p className="connection-panel__file">{filePath}</p>}
          <div className="connection-panel__actions">
            <Button
              onClick={() => void handleImport()}
              disabled={busy || !filePath}
              variant="primary"
            >
              {t('emulator.import')}
            </Button>
            <Button onClick={finish} disabled={busy}>
              {t('emulator.skip')}
            </Button>
          </div>
        </>
      )}

      {busy && <p className="connection-panel__loading">{t('common.busy')}</p>}
      {error && <p className="connection-panel__error">{error}</p>}
    </section>
  )
}

export default EmulatorPage
