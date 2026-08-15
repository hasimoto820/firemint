import { useEffect, useMemo, useState } from 'react'
import { collectionKindLabel } from '@features/explorer/shared/tree'
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
  const collectionName = useMemo(() => {
    const segments = collectionPath.split('/').filter(Boolean)
    return segments[segments.length - 1] ?? collectionPath
  }, [collectionPath])

  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setConfirmName('')
    setBusy(false)
    setError(null)
  }, [open, collectionPath])

  const kindLabel = collectionKindLabel(collectionPath)
  const canSubmit = !busy && confirmName.trim() === collectionName

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }

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
    } catch (error) {
      setError(error instanceof Error ? error.message : `${kindLabel}の削除に失敗しました`)
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
          <h2 className="project-export-dialog__title">{kindLabel}を削除</h2>
          <p className="project-export-dialog__lead">
            {kindLabel} <code>{collectionPath}</code> と、配下のドキュメント・サブコレクションをすべて削除します。
          </p>
        </header>

        <p className="project-export-dialog__hint">この操作は取り消せません。</p>

        <label className="project-export-dialog__option">
          確認のため、{kindLabel}名 <code>{collectionName}</code> を入力してください
          <input
            className="bulk-actions__input"
            value={confirmName}
            disabled={busy}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={collectionName}
            onChange={(event) => {
              setConfirmName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                void handleSubmit()
              }
            }}
          />
        </label>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? '削除中…' : '削除'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SubcollectionDeleteDialog
