import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useEffect, useMemo, useState } from 'react'
import { invalidDocumentIdReason } from '@features/explorer/shared/document_id'
import { parentCollectionPath } from '@shared/shell/workspace_tab'
import Button from '@shared/ui/Button'

type DocumentDuplicateDialogProps = {
  projectId: string
  documentPath: string
  open: boolean
  onClose: () => void
  onDuplicated: (collectionPath: string, documentId: string) => void
}

function DocumentDuplicateDialog({
  projectId,
  documentPath,
  open,
  onClose,
  onDuplicated
}: DocumentDuplicateDialogProps): React.JSX.Element | null {
  const { t } = useI18n()
  const [documentId, setDocumentId] = useState('')
  const [includeSubcollections, setIncludeSubcollections] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const collectionPath = parentCollectionPath(documentPath)
  const sourceId = documentPath.split('/').filter(Boolean).pop() ?? documentPath

  useEffect(() => {
    if (!open) {
      return
    }

    setDocumentId('')
    setIncludeSubcollections(false)
    setBusy(false)
    setError(null)
  }, [open, documentPath])

  const trimmedId = documentId.trim()
  const previewPath = useMemo(() => {
    if (!collectionPath) {
      return ''
    }

    if (!trimmedId) {
      return `${collectionPath}/${t('explorer.auto_id')}`
    }

    return `${collectionPath}/${trimmedId}`
  }, [collectionPath, trimmedId, t])

  const canSubmit = !busy && Boolean(collectionPath)

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit || !collectionPath) {
      return
    }

    if (trimmedId) {
      const invalid = invalidDocumentIdReason(trimmedId)
      if (invalid) {
        setError(invalid)
        return
      }
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.explorer.duplicateDocument({
        projectId,
        documentPath,
        targetDocumentId: trimmedId || undefined,
        includeSubcollections
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onDuplicated(collectionPath, result.data)
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t('explorer.err_duplicate_document_failed')
      )
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
          <h2 className="project-export-dialog__title">{t('explorer.duplicate_document_title')}</h2>
          <p className="project-export-dialog__lead">{t('explorer.duplicate_document_lead')}</p>
        </header>

        <p className="project-export-dialog__hint">
          {t('explorer.source')} <code>{documentPath}</code>
        </p>

        <label className="project-export-dialog__option">
          {t('explorer.document_id_optional')}
          <input
            className="bulk-actions__input"
            value={documentId}
            disabled={busy}
            autoFocus
            placeholder={t('explorer.duplicate_id_placeholder', { id: sourceId })}
            onChange={(event) => {
              setDocumentId(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                void handleSubmit()
              }
            }}
          />
        </label>

        <p className="project-export-dialog__hint">
          {t('explorer.after_duplicate')} <code>{previewPath}</code>
        </p>

        <label className="project-export-dialog__option">
          <input
            type="checkbox"
            checked={includeSubcollections}
            disabled={busy}
            onChange={(event) => setIncludeSubcollections(event.target.checked)}
          />
          {t('explorer.include_subcollections')}
        </label>
        <p className="project-export-dialog__hint">{t('explorer.include_subcollections_detail')}</p>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? t('explorer.duplicating') : t('explorer.duplicate')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DocumentDuplicateDialog
