import { useEffect, useMemo, useState } from 'react'
import { collectionKindLabel } from '@features/explorer/shared/tree'
import { invalidDocumentIdReason } from '@features/explorer/shared/document_id'
import Button from '@shared/ui/Button'

type DocumentCreateDialogProps = {
  projectId: string
  collectionPath: string
  open: boolean
  onClose: () => void
  onCreated: (collectionPath: string, documentId: string) => void
}

function DocumentCreateDialog({
  projectId,
  collectionPath,
  open,
  onClose,
  onCreated
}: DocumentCreateDialogProps): React.JSX.Element | null {
  const [documentId, setDocumentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setDocumentId('')
    setBusy(false)
    setError(null)
  }, [open, collectionPath])

  const trimmedId = documentId.trim()
  const previewPath = useMemo(() => {
    if (!trimmedId) {
      return `${collectionPath}/（自動 ID）`
    }

    return `${collectionPath}/${trimmedId}`
  }, [collectionPath, trimmedId])

  const canSubmit = !busy

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
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
      if (trimmedId) {
        const existing = await window.api.explorer.getDocument(
          projectId,
          `${collectionPath}/${trimmedId}`
        )

        if (existing.ok) {
          setError('同じ ID のドキュメントが既に存在します')
          return
        }
      }

      const result = await window.api.explorer.createDocument({
        projectId,
        collectionPath,
        data: {},
        documentId: trimmedId || undefined
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onCreated(collectionPath, result.data)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'ドキュメントの作成に失敗しました')
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
          <h2 className="project-export-dialog__title">ドキュメントを作成</h2>
          <p className="project-export-dialog__lead">
            {collectionKindLabel(collectionPath)}に空のドキュメントを追加します。ID を空欄にすると自動で付きます。
          </p>
        </header>

        <p className="project-export-dialog__hint">
          {collectionKindLabel(collectionPath)}: <code>{collectionPath}</code>
        </p>

        <label className="project-export-dialog__option">
          ドキュメント ID（任意）
          <input
            className="bulk-actions__input"
            value={documentId}
            disabled={busy}
            autoFocus
            placeholder="空欄なら自動 ID（例: Auth の uid）"
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
          作成後: <code>{previewPath}</code>
        </p>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? '作成中…' : '作成'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DocumentCreateDialog
