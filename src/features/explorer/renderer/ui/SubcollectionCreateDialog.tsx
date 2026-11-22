import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useEffect, useMemo, useState } from 'react'
import { buildSubcollectionPath } from '@features/explorer/shared/tree'
import Button from '@shared/ui/Button'

type SubcollectionCreateDialogProps = {
  projectId: string
  documentPath: string
  open: boolean
  onClose: () => void
  onCreated: (subcollectionPath: string, documentId: string) => void
}

function SubcollectionCreateDialog({
  projectId,
  documentPath,
  open,
  onClose,
  onCreated
}: SubcollectionCreateDialogProps): React.JSX.Element | null {
  const { t } = useI18n()
  const [subcollectionId, setSubcollectionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setSubcollectionId('')
    setBusy(false)
    setError(null)
  }, [open, documentPath])

  const subcollectionPath = useMemo(() => {
    const trimmed = subcollectionId.trim()

    if (!trimmed) {
      return ''
    }

    return buildSubcollectionPath(documentPath, trimmed)
  }, [documentPath, subcollectionId])

  const canSubmit = !busy && Boolean(subcollectionId.trim())

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.explorer.createSubcollection({
        projectId,
        documentPath,
        subcollectionId: subcollectionId.trim()
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onCreated(result.data.subcollectionPath, result.data.documentId)
      onClose()
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
          <h2 className="project-export-dialog__title">
            {t('explorer.create_subcollection_title')}
          </h2>
          <p className="project-export-dialog__lead">{t('explorer.create_subcollection_lead')}</p>
        </header>

        <p className="project-export-dialog__hint">
          {t('explorer.parent_document')} <code>{documentPath}</code>
        </p>

        <label className="project-export-dialog__option">
          {t('explorer.subcollection_name')}
          <input
            className="bulk-actions__input"
            value={subcollectionId}
            disabled={busy}
            autoFocus
            placeholder={t('explorer.example_orders')}
            onChange={(event) => {
              setSubcollectionId(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                void handleSubmit()
              }
            }}
          />
        </label>

        {subcollectionPath && (
          <p className="project-export-dialog__hint">
            {t('explorer.after_create')} <code>{subcollectionPath}</code>
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

export default SubcollectionCreateDialog
