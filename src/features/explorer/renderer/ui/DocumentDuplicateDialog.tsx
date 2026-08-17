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
      return `${collectionPath}/（自動 ID）`
    }

    return `${collectionPath}/${trimmedId}`
  }, [collectionPath, trimmedId])

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
      setError(submitError instanceof Error ? submitError.message : 'ドキュメントの複製に失敗しました')
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
          <h2 className="project-export-dialog__title">ドキュメントを複製</h2>
          <p className="project-export-dialog__lead">
            同じコレクションにコピーします。ID を空欄にすると自動で付きます。
          </p>
        </header>

        <p className="project-export-dialog__hint">
          複製元: <code>{documentPath}</code>
        </p>

        <label className="project-export-dialog__option">
          ドキュメント ID（任意）
          <input
            className="bulk-actions__input"
            value={documentId}
            disabled={busy}
            autoFocus
            placeholder={`空欄なら自動 ID（元: ${sourceId}）`}
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
          複製後: <code>{previewPath}</code>
        </p>

        <label className="project-export-dialog__option">
          <input
            type="checkbox"
            checked={includeSubcollections}
            disabled={busy}
            onChange={(event) => setIncludeSubcollections(event.target.checked)}
          />
          サブコレクションを含む
        </label>
        <p className="project-export-dialog__hint">
          サブコレクションを含めると、配下のドキュメントもすべてコピーします（件数・時間が増えます）。
        </p>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? '複製中…' : '複製'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DocumentDuplicateDialog
