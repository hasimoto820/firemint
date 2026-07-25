import { useEffect, useState } from 'react'
import Button from '@shared/ui/Button'

type SubcollectionDeleteDialogProps = {
  projectId: string
  collectionPath: string
  open: boolean
  onClose: () => void
  onDeleted: (deletedDocumentCount: number) => void
}

function SubcollectionDeleteDialog({
  projectId,
  collectionPath,
  open,
  onClose,
  onDeleted
}: SubcollectionDeleteDialogProps): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setBusy(false)
    setError(null)
  }, [open, collectionPath])

  const handleSubmit = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const result = await window.api.explorer.deleteCollection({
        projectId,
        collectionPath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onDeleted(result.data.deletedDocumentCount)
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
          <h2 className="project-export-dialog__title">サブコレクションを削除</h2>
          <p className="project-export-dialog__lead">
            サブコレクション <code>{collectionPath}</code> と、配下のドキュメント・サブコレクションをすべて削除します。
          </p>
        </header>

        <p className="project-export-dialog__hint">この操作は取り消せません。</p>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? '削除中…' : '削除'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SubcollectionDeleteDialog
