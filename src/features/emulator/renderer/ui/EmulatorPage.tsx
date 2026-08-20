import { useEffect, useState } from 'react'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import {
  emulatorPageIntent,
  emulatorPageModeFromIntent,
  type EmulatorPageDirection,
  type EmulatorPageMode,
  type EmulatorPageTarget
} from '@features/emulator/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type EmulatorPageProps = {
  mode: EmulatorPageMode
  onModeChange?: (mode: EmulatorPageMode) => void
  onClose: () => void
  onWorkspaceChanged: () => void | Promise<void>
  defaultHost?: string
  destinationPoolId?: string | null
  destinationLabel?: string | null
}

function ToggleBar<T extends string>({
  value,
  options,
  disabled,
  ariaLabel,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  disabled: boolean
  ariaLabel: string
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <nav className="app-nav" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
          disabled={disabled}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </nav>
  )
}

function EmulatorPage({
  mode,
  onModeChange,
  onClose,
  onWorkspaceChanged,
  defaultHost = DEFAULT_EMULATOR_HOST,
  destinationPoolId = null,
  destinationLabel = null
}: EmulatorPageProps): React.JSX.Element {
  const t = useT()
  const host = defaultHost
  const poolId = destinationPoolId
  const { direction, target } = emulatorPageIntent(mode)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFilePath(null)
    setError(null)
  }, [mode])

  const setDirection = (next: EmulatorPageDirection): void => {
    onModeChange?.(emulatorPageModeFromIntent(next, target))
  }

  const setTarget = (next: EmulatorPageTarget): void => {
    onModeChange?.(emulatorPageModeFromIntent(direction, next))
  }

  const finish = async (): Promise<void> => {
    await onWorkspaceChanged()
    onClose()
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

  const handleSelectZip = async (): Promise<void> => {
    setError(null)
    const selected = await window.api.dataTransfer.selectProjectImportZip()

    if (selected.canceled || !selected.filePath) {
      return
    }

    setFilePath(selected.filePath)
  }

  const handleImportJson = async (): Promise<void> => {
    if (!poolId) {
      setError(t('emulator.no_destination'))
      return
    }

    if (!filePath) {
      setError(t('emulator.select_json'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.emulator.importCollectionJson({
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

  const handleImportZip = async (): Promise<void> => {
    if (!filePath) {
      setError(t('emulator.select_zip'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.emulator.importProjectZip({
        host,
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

  const lead =
    mode === 'import-project'
      ? t('emulator.import_project_lead')
      : mode === 'import-collection'
        ? t('emulator.import_collection_lead')
        : mode === 'export-project'
          ? t('emulator.export_project_lead')
          : t('emulator.export_collection_lead')

  return (
    <section className="connection-panel emulator-page">
      <h1 className="imp-exp-form__title">{t('menu.emulator')}</h1>
      <div className="imp-exp-form__toggles">
        <ToggleBar
          ariaLabel="向き"
          value={direction}
          disabled={busy}
          options={[
            { id: 'import', label: 'Import' },
            { id: 'export', label: 'Export' }
          ]}
          onChange={setDirection}
        />
        <ToggleBar
          ariaLabel="対象"
          value={target}
          disabled={busy}
          options={[
            { id: 'collection', label: 'Collection' },
            { id: 'project', label: 'Project' }
          ]}
          onChange={setTarget}
        />
      </div>
      <p className="connection-panel__lead">{lead}</p>

      {mode === 'import-project' && (
        <>
          <div className="connection-panel__actions">
            <Button onClick={() => void handleSelectZip()} disabled={busy}>
              {t('emulator.select_zip')}
            </Button>
          </div>
          {filePath && <p className="connection-panel__file">{filePath}</p>}
          <div className="connection-panel__actions">
            <Button
              onClick={() => void handleImportZip()}
              disabled={busy || !filePath}
              variant="primary"
            >
              {t('emulator.import')}
            </Button>
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}

      {mode === 'import-collection' && (
        <>
          <p className="emulator-page__destination">
            {t('emulator.destination')}: {destinationLabel ?? destinationPoolId ?? t('emulator.no_destination')}
          </p>
          <div className="connection-panel__actions">
            <Button onClick={() => void handleSelectJson()} disabled={busy || !poolId}>
              {t('emulator.select_json')}
            </Button>
          </div>
          {filePath && <p className="connection-panel__file">{filePath}</p>}
          <div className="connection-panel__actions">
            <Button
              onClick={() => void handleImportJson()}
              disabled={busy || !filePath || !poolId}
              variant="primary"
            >
              {t('emulator.import')}
            </Button>
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}

      {(mode === 'export-project' || mode === 'export-collection') && (
        <>
          <p className="emulator-page__destination">
            {t('emulator.destination')}: {destinationLabel ?? destinationPoolId ?? t('emulator.no_destination')}
          </p>
          <div className="connection-panel__actions">
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
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
