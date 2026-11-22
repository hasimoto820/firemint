import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useEffect, useMemo, useState } from 'react'
import { collectionKindLabel } from '@features/explorer/shared/tree'
import Button from '@shared/ui/Button'

type CollectionRenameDialogProps = {
  projectId: string
  collectionPath: string
  open: boolean
  onClose: () => void
  onRenamed: (targetCollectionPath: string, movedCount: number) => void
}

function CollectionRenameDialog({
  projectId,
  collectionPath,
  open,
  onClose,
  onRenamed
}: CollectionRenameDialogProps): React.JSX.Element | null {
  const { t } = useI18n()
  const segments = useMemo(() => collectionPath.split('/').filter(Boolean), [collectionPath])
  const currentName = segments[segments.length - 1] ?? ''

  const [newName, setNewName] = useState(currentName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setNewName(currentName)
    setBusy(false)
    setError(null)
  }, [open, currentName])

  const targetCollectionPath = useMemo(() => {
    const trimmed = newName.trim()
    if (!trimmed) {
      return ''
    }

    return [...segments.slice(0, -1), trimmed].join('/')
  }, [newName, segments])

  const canSubmit =
    !busy &&
    Boolean(newName.trim()) &&
    newName.trim() !== currentName &&
    Boolean(targetCollectionPath)

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.explorer.renameCollection({
        projectId,
        sourceCollectionPath: collectionPath,
        targetCollectionPath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onRenamed(result.data.targetCollectionPath, result.data.movedCount)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const kindLabel = collectionKindLabel(collectionPath)

  if (!open) {
    return null
  }

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">
            {t('explorer.rename_title', { kind: kindLabel })}
          </h2>
          <p className="project-export-dialog__lead">
            {t('explorer.rename_lead', { kind: kindLabel })}
          </p>
        </header>

        <p className="project-export-dialog__hint">
          {t('explorer.current')} <code>{collectionPath}</code>
        </p>

        <label className="project-export-dialog__option">
          {t('explorer.new_name')}
          <input
            className="bulk-actions__input"
            value={newName}
            disabled={busy}
            autoFocus
            onChange={(event) => {
              setNewName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                void handleSubmit()
              }
            }}
          />
        </label>

        {targetCollectionPath && targetCollectionPath !== collectionPath && (
          <p className="project-export-dialog__hint">
            {t('explorer.after_change')} <code>{targetCollectionPath}</code>
          </p>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? t('explorer.running') : t('explorer.rename')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CollectionRenameDialog
