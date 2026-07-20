import { useEffect, useState } from 'react'
import type { DiffPreviewItem } from '@features/bulk_operations/shared/types'
import Button from '@shared/ui/Button'
import DiffPreviewPanel from '@shared/ui/DiffPreviewPanel'

type FieldBulkRenameDialogProps = {
  projectId: string
  collectionPath: string
  open: boolean
  onClose: () => void
  onCompleted: () => void
}

type Mode = 'rename' | 'delete'

function FieldBulkRenameDialog({
  projectId,
  collectionPath,
  open,
  onClose,
  onCompleted
}: FieldBulkRenameDialogProps): React.JSX.Element | null {
  const [mode, setMode] = useState<Mode>('rename')
  const [fromField, setFromField] = useState('')
  const [toField, setToField] = useState('')
  const [deleteFieldName, setDeleteFieldName] = useState('')
  const [previewItems, setPreviewItems] = useState<DiffPreviewItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setMode('rename')
    setFromField('')
    setToField('')
    setDeleteFieldName('')
    setPreviewItems(null)
    setBusy(false)
    setError(null)
  }, [open, collectionPath])

  const clearPreview = (): void => {
    setPreviewItems(null)
  }

  const handlePreview = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      if (mode === 'rename') {
        const result = await window.api.bulk.previewRenameField({
          projectId,
          collectionPath,
          fromField,
          toField
        })

        if (!result.ok) {
          setError(result.error)
          clearPreview()
          return
        }

        setPreviewItems(result.data)
        return
      }

      const result = await window.api.bulk.previewDeleteField({
        projectId,
        collectionPath,
        field: deleteFieldName
      })

      if (!result.ok) {
        setError(result.error)
        clearPreview()
        return
      }

      setPreviewItems(result.data)
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async (): Promise<void> => {
    if (!previewItems?.length) {
      setError('先にプレビューを実行してください')
      return
    }

    const confirmMessage =
      mode === 'rename'
        ? `コレクション「${collectionPath}」全体でフィールド「${fromField.trim()}」を「${toField.trim()}」にリネームします。よろしいですか？`
        : `コレクション「${collectionPath}」全体からフィールド「${deleteFieldName.trim()}」を削除します。よろしいですか？`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      if (mode === 'rename') {
        const result = await window.api.bulk.renameField({
          projectId,
          collectionPath,
          fromField,
          toField
        })

        if (!result.ok) {
          setError(result.error)
          return
        }
      } else {
        const result = await window.api.bulk.deleteField({
          projectId,
          collectionPath,
          field: deleteFieldName
        })

        if (!result.ok) {
          setError(result.error)
          return
        }
      }

      onCompleted()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  const canPreview =
    mode === 'rename'
      ? Boolean(fromField.trim() && toField.trim())
      : Boolean(deleteFieldName.trim())

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel project-export-dialog__panel--wide">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">フィールド一括</h2>
          <p className="project-export-dialog__lead">
            コレクション <code>{collectionPath}</code> 全体のフィールド名を変更／削除します。
          </p>
        </header>

        <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
          <Button
            variant={mode === 'rename' ? 'primary' : undefined}
            onClick={() => {
              setMode('rename')
              clearPreview()
              setError(null)
            }}
            disabled={busy}
          >
            リネーム
          </Button>
          <Button
            variant={mode === 'delete' ? 'danger' : undefined}
            onClick={() => {
              setMode('delete')
              clearPreview()
              setError(null)
            }}
            disabled={busy}
          >
            削除
          </Button>
        </div>

        {mode === 'rename' ? (
          <div className="bulk-actions__update-row">
            <input
              className="bulk-actions__input"
              value={fromField}
              disabled={busy}
              autoFocus
              placeholder="旧フィールド名"
              onChange={(event) => {
                setFromField(event.target.value)
                clearPreview()
                setError(null)
              }}
            />
            <input
              className="bulk-actions__input"
              value={toField}
              disabled={busy}
              placeholder="新フィールド名"
              onChange={(event) => {
                setToField(event.target.value)
                clearPreview()
                setError(null)
              }}
            />
          </div>
        ) : (
          <div className="bulk-actions__update-row">
            <input
              className="bulk-actions__input"
              value={deleteFieldName}
              disabled={busy}
              autoFocus
              placeholder="削除するフィールド名"
              onChange={(event) => {
                setDeleteFieldName(event.target.value)
                clearPreview()
                setError(null)
              }}
            />
          </div>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        {previewItems && previewItems.length > 0 && <DiffPreviewPanel items={previewItems} />}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button onClick={() => void handlePreview()} disabled={busy || !canPreview}>
            プレビュー
          </Button>
          <Button
            variant={mode === 'delete' ? 'danger' : 'primary'}
            onClick={() => void handleApply()}
            disabled={busy || !previewItems?.length}
          >
            {busy ? '実行中…' : mode === 'rename' ? 'リネーム' : '削除'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default FieldBulkRenameDialog
