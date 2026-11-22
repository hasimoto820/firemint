import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useEffect, useState } from 'react'
import Button from '@shared/ui/Button'

type CollectionCreateDialogProps = {
  projectId: string
  open: boolean
  onClose: () => void
  onCreated: (collectionPath: string, documentId: string) => void
}

function CollectionCreateDialog({
  projectId,
  open,
  onClose,
  onCreated
}: CollectionCreateDialogProps): React.JSX.Element | null {
  const { t } = useI18n()
  const [collectionId, setCollectionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setCollectionId('')
    setBusy(false)
    setError(null)
  }, [open])

  const canSubmit = !busy && Boolean(collectionId.trim())

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const name = collectionId.trim()

      if (name.includes('/')) {
        setError(t('explorer.err_no_slash', { label: t('explorer.label_collection_name') }))
        return
      }

      const existing = await window.api.explorer.listRootCollections(projectId)

      if (!existing.ok) {
        setError(existing.error)
        return
      }

      if (existing.data.includes(name)) {
        setError(t('explorer.err_collection_exists'))
        return
      }

      const result = await window.api.explorer.createDocument({
        projectId,
        collectionPath: name,
        data: {}
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onCreated(name, result.data)
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('explorer.err_create_collection_failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">{t('explorer.create_collection_title')}</h2>
          <p className="project-export-dialog__lead">{t('explorer.create_collection_lead')}</p>
        </header>

        <label className="project-export-dialog__option">
          {t('explorer.collection_name')}
          <input
            className="bulk-actions__input"
            value={collectionId}
            disabled={busy}
            autoFocus
            placeholder={t('explorer.example_users')}
            onChange={(event) => {
              setCollectionId(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                void handleSubmit()
              }
            }}
          />
        </label>

        {collectionId.trim() && (
          <p className="project-export-dialog__hint">
            {t('explorer.after_create')} <code>{collectionId.trim()}</code>
          </p>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? t('explorer.creating') : t('explorer.create')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CollectionCreateDialog
