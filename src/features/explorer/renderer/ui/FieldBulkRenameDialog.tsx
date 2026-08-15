import { useEffect, useState } from 'react'
import { useFieldAutocompleteItems, useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import type {
  BulkFieldMode,
  BulkFieldPreview,
  BulkFieldValueType,
  BulkFieldWriteResult
} from '@features/bulk_operations/shared/types'
import { collectionKindLabel } from '@features/explorer/shared/tree'
import Button from '@shared/ui/Button'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import { confirmAction } from '@shared/ui/confirmAction'
import DiffPreviewPanel from '@shared/ui/DiffPreviewPanel'
import { collectDataColumns } from '@shared/ui/document_table_utils'

type FieldBulkRenameDialogProps = {
  projectId: string
  collectionPath: string
  open: boolean
  initialMode?: BulkFieldMode
  onClose: () => void
  onCompleted: () => void
}

const VALUE_TYPES: BulkFieldValueType[] = ['string', 'number', 'boolean', 'null', 'timestamp']

function formatCollisionMessage(result: BulkFieldWriteResult): string {
  const listed = result.collisionPaths.join('\n')
  const rest =
    result.skippedCount > result.collisionPaths.length
      ? `\n…他 ${result.skippedCount - result.collisionPaths.length} 件`
      : ''

  if (result.affectedCount === 0) {
    return `衝突のため ${result.skippedCount} 件は更新していません。\n${listed}${rest}`
  }

  return `${result.affectedCount} 件を更新しました。衝突のため ${result.skippedCount} 件は更新していません。\n${listed}${rest}`
}

function FieldBulkRenameDialog({
  projectId,
  collectionPath,
  open,
  initialMode = 'rename',
  onClose,
  onCompleted
}: FieldBulkRenameDialogProps): React.JSX.Element | null {
  const autocomplete = useOptionalAutocompleteApi()
  const kindLabel = collectionKindLabel(collectionPath)
  const [mode, setMode] = useState<BulkFieldMode>(initialMode)
  const [fromField, setFromField] = useState('')
  const [toField, setToField] = useState('')
  const [createField, setCreateField] = useState('')
  const [valueType, setValueType] = useState<BulkFieldValueType>('string')
  const [createValue, setCreateValue] = useState('')
  const [deleteFieldName, setDeleteFieldName] = useState('')
  const [includeSubcollections, setIncludeSubcollections] = useState(false)
  const [preview, setPreview] = useState<BulkFieldPreview | null>(null)
  const [fieldCandidates, setFieldCandidates] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldItems = useFieldAutocompleteItems(projectId, fieldCandidates)

  useEffect(() => {
    if (!open) {
      return
    }

    setMode(initialMode)
    setFromField('')
    setToField('')
    setCreateField('')
    setValueType('string')
    setCreateValue('')
    setDeleteFieldName('')
    setIncludeSubcollections(false)
    setPreview(null)
    setFieldCandidates([])
    setBusy(false)
    setError(null)
  }, [open, collectionPath, initialMode])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    void (async () => {
      const result = await window.api.explorer.listDocuments(projectId, collectionPath)

      if (cancelled) {
        return
      }

      if (result.ok) {
        const columns = collectDataColumns(result.data)
        setFieldCandidates(columns)
        autocomplete.addFieldNames(projectId, columns)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, projectId, collectionPath, autocomplete.addFieldNames])

  const clearPreview = (): void => {
    setPreview(null)
  }

  const handlePreview = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      if (mode === 'create') {
        const result = await window.api.bulk.previewCreateField({
          projectId,
          collectionPath,
          field: createField,
          valueType,
          value: valueType === 'boolean' ? createValue || 'true' : createValue,
          includeSubcollections
        })

        if (!result.ok) {
          setError(result.error)
          clearPreview()
          return
        }

        setPreview(result.data)
        return
      }

      if (mode === 'rename') {
        const result = await window.api.bulk.previewRenameField({
          projectId,
          collectionPath,
          fromField,
          toField,
          includeSubcollections
        })

        if (!result.ok) {
          setError(result.error)
          clearPreview()
          return
        }

        setPreview(result.data)
        return
      }

      const result = await window.api.bulk.previewDeleteField({
        projectId,
        collectionPath,
        field: deleteFieldName,
        includeSubcollections
      })

      if (!result.ok) {
        setError(result.error)
        clearPreview()
        return
      }

      setPreview(result.data)
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async (): Promise<void> => {
    if (!preview || (preview.items.length === 0 && preview.skippedCount === 0)) {
      setError('先にプレビューを実行してください')
      return
    }

    const scope = includeSubcollections ? '（サブコレクションを含む）' : ''
    const confirmMessage =
      mode === 'create'
        ? `${kindLabel}「${collectionPath}」全体にフィールド「${createField.trim()}」を追加します${scope}。よろしいですか？`
        : mode === 'rename'
          ? `${kindLabel}「${collectionPath}」全体でフィールド「${fromField.trim()}」を「${toField.trim()}」にリネームします${scope}。よろしいですか？`
          : `${kindLabel}「${collectionPath}」全体からフィールド「${deleteFieldName.trim()}」を削除します${scope}。よろしいですか？`

    if (!(await confirmAction(confirmMessage))) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      let result:
        | Awaited<ReturnType<typeof window.api.bulk.createField>>
        | Awaited<ReturnType<typeof window.api.bulk.renameField>>
        | Awaited<ReturnType<typeof window.api.bulk.deleteField>>

      if (mode === 'create') {
        result = await window.api.bulk.createField({
          projectId,
          collectionPath,
          field: createField,
          valueType,
          value: valueType === 'boolean' ? createValue || 'true' : createValue,
          includeSubcollections
        })
      } else if (mode === 'rename') {
        result = await window.api.bulk.renameField({
          projectId,
          collectionPath,
          fromField,
          toField,
          includeSubcollections
        })
      } else {
        result = await window.api.bulk.deleteField({
          projectId,
          collectionPath,
          field: deleteFieldName,
          includeSubcollections
        })
      }

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (result.data.skippedCount > 0) {
        await confirmAction(formatCollisionMessage(result.data), { confirmLabel: '閉じる' })
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
    mode === 'create'
      ? Boolean(createField.trim()) && (valueType === 'null' || Boolean(createValue.trim()) || valueType === 'boolean')
      : mode === 'rename'
        ? Boolean(fromField.trim() && toField.trim())
        : Boolean(deleteFieldName.trim())

  const canApply = Boolean(preview && (preview.items.length > 0 || preview.skippedCount > 0))

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel project-export-dialog__panel--wide">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">フィールド一括</h2>
          <p className="project-export-dialog__lead">
            {kindLabel} <code>{collectionPath}</code> 全体のフィールドを新規／リネーム／削除します。
          </p>
        </header>

        <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
          <Button
            variant={mode === 'create' ? 'primary' : undefined}
            onClick={() => {
              setMode('create')
              clearPreview()
              setError(null)
            }}
            disabled={busy}
          >
            新規
          </Button>
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

        <label className="project-export-dialog__option">
          <input
            type="checkbox"
            checked={includeSubcollections}
            disabled={busy}
            onChange={(event) => {
              setIncludeSubcollections(event.target.checked)
              clearPreview()
              setError(null)
            }}
          />
          サブコレクションを含む
        </label>

        {mode === 'create' ? (
          <div className="bulk-actions__update-row">
            <input
              className="bulk-actions__input"
              value={createField}
              disabled={busy}
              autoFocus
              placeholder="フィールド名"
              onChange={(event) => {
                setCreateField(event.target.value)
                clearPreview()
                setError(null)
              }}
            />
            <select
              className="bulk-actions__input"
              value={valueType}
              disabled={busy}
              aria-label="型"
              onChange={(event) => {
                const nextType = event.target.value as BulkFieldValueType
                setValueType(nextType)
                if (nextType === 'boolean') {
                  setCreateValue('true')
                } else if (nextType === 'null') {
                  setCreateValue('')
                }
                clearPreview()
                setError(null)
              }}
            >
              {VALUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {valueType === 'boolean' ? (
              <select
                className="bulk-actions__input"
                value={createValue || 'true'}
                disabled={busy}
                aria-label="値"
                onChange={(event) => {
                  setCreateValue(event.target.value)
                  clearPreview()
                  setError(null)
                }}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : valueType === 'null' ? null : (
              <input
                className="bulk-actions__input"
                type={valueType === 'number' ? 'number' : valueType === 'timestamp' ? 'datetime-local' : 'text'}
                value={createValue}
                disabled={busy}
                placeholder="値"
                onChange={(event) => {
                  setCreateValue(event.target.value)
                  clearPreview()
                  setError(null)
                }}
              />
            )}
          </div>
        ) : mode === 'rename' ? (
          <div className="bulk-actions__update-row">
            <AutocompleteInput
              className="bulk-actions__field-wrap"
              fieldClassName="bulk-actions__input"
              value={fromField}
              items={fieldItems}
              disabled={busy}
              autoFocus
              placeholder="旧フィールド名"
              aria-label="旧フィールド名"
              onChange={(nextValue) => {
                setFromField(nextValue)
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
            <AutocompleteInput
              className="bulk-actions__field-wrap"
              fieldClassName="bulk-actions__input"
              value={deleteFieldName}
              items={fieldItems}
              disabled={busy}
              autoFocus
              placeholder="削除するフィールド名"
              aria-label="削除するフィールド名"
              onChange={(nextValue) => {
                setDeleteFieldName(nextValue)
                clearPreview()
                setError(null)
              }}
            />
          </div>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        {preview && preview.skippedCount > 0 && (
          <p className="project-export-dialog__hint">
            衝突のためスキップ予定: {preview.skippedCount} 件
          </p>
        )}

        {preview && preview.items.length > 0 && <DiffPreviewPanel items={preview.items} />}

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
            disabled={busy || !canApply}
          >
            {busy ? '実行中…' : mode === 'create' ? '追加' : mode === 'rename' ? 'リネーム' : '削除'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default FieldBulkRenameDialog
