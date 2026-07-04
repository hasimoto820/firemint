import { useState } from 'react'
import type { EnvironmentKind } from '@shared/safety/environment'
import type { DiffPreviewItem } from '@features/bulk_operations/shared/types'
import {
  buildDestructiveConfirmMessage,
  estimateBulkDeleteCost,
  estimateBulkPreviewCost,
  estimateBulkUpdateCost,
  formatBatchMessage,
  formatCostUsd
} from '@shared/safety/operations'
import Button from '@shared/ui/Button'
import DiffPreviewPanel from '@shared/ui/DiffPreviewPanel'

type BulkActionsPanelProps = {
  environment: EnvironmentKind
  selectedPaths: string[]
  loading: boolean
  onLoadingChange: (loading: boolean) => void
  onClearSelection: () => void
  onOperationComplete: () => void
  onError: (message: string | null) => void
}

function BulkActionsPanel({
  environment,
  selectedPaths,
  loading,
  onLoadingChange,
  onClearSelection,
  onOperationComplete,
  onError
}: BulkActionsPanelProps): React.JSX.Element | null {
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [previewItems, setPreviewItems] = useState<DiffPreviewItem[] | null>(null)

  if (selectedPaths.length === 0) {
    return null
  }

  const deleteEstimate = estimateBulkDeleteCost(selectedPaths.length)
  const updateEstimate = estimateBulkUpdateCost(selectedPaths.length)
  const previewEstimate = estimateBulkPreviewCost(selectedPaths.length)

  const handlePreview = async (): Promise<void> => {
    onError(null)
    onLoadingChange(true)

    try {
      const result = await window.api.bulk.previewUpdate({
        documentPaths: selectedPaths,
        field,
        value
      })

      if (!result.ok) {
        onError(result.error)
        setPreviewItems(null)
        return
      }

      setPreviewItems(result.data)
    } finally {
      onLoadingChange(false)
    }
  }

  const handleApplyUpdate = async (): Promise<void> => {
    if (!previewItems || previewItems.length === 0) {
      onError('先にプレビューを実行してください')
      return
    }

    const message = buildDestructiveConfirmMessage('update', selectedPaths.length, environment)
    if (!window.confirm(message)) {
      return
    }

    onError(null)
    onLoadingChange(true)

    try {
      const result = await window.api.bulk.updateField({
        documentPaths: selectedPaths,
        field,
        value
      })

      if (!result.ok) {
        onError(result.error)
        return
      }

      setPreviewItems(null)
      setField('')
      setValue('')
      onClearSelection()
      onOperationComplete()
    } finally {
      onLoadingChange(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    const message = buildDestructiveConfirmMessage('delete', selectedPaths.length, environment)
    if (!window.confirm(message)) {
      return
    }

    onError(null)
    onLoadingChange(true)

    try {
      const result = await window.api.bulk.delete({
        documentPaths: selectedPaths
      })

      if (!result.ok) {
        onError(result.error)
        return
      }

      setPreviewItems(null)
      onClearSelection()
      onOperationComplete()
    } finally {
      onLoadingChange(false)
    }
  }

  return (
    <section className="bulk-actions">
      <div className="bulk-actions__header">
        <h3 className="bulk-actions__title">{selectedPaths.length} 件選択中</h3>
        <Button onClick={onClearSelection} disabled={loading}>
          選択解除
        </Button>
      </div>

      <p className="bulk-actions__batch">
        バッチ: {formatBatchMessage(selectedPaths.length)}
      </p>

      <div className="bulk-actions__delete">
        <Button variant="danger" onClick={() => void handleDelete()} disabled={loading}>
          一括削除
        </Button>
        <span className="bulk-actions__cost">
          書込 {deleteEstimate.writeCount} 件 / {deleteEstimate.batchCount} バッチ / 概算{' '}
          {formatCostUsd(deleteEstimate.estimatedCostUsd)}
        </span>
      </div>

      <div className="bulk-actions__update">
        <h4 className="bulk-actions__subtitle">フィールド一括更新</h4>
        <div className="bulk-actions__update-row">
          <input
            className="bulk-actions__input"
            value={field}
            onChange={(event) => {
              setField(event.target.value)
              setPreviewItems(null)
            }}
            placeholder="field"
            disabled={loading}
          />
          <input
            className="bulk-actions__input bulk-actions__input--value"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setPreviewItems(null)
            }}
            placeholder='value（例: "new", 123, true, null）'
            disabled={loading}
          />
          <Button onClick={() => void handlePreview()} disabled={loading || !field.trim()}>
            プレビュー
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApplyUpdate()}
            disabled={loading || !previewItems?.length}
          >
            一括更新
          </Button>
        </div>
        <p className="bulk-actions__cost">
          プレビュー: 読取 {previewEstimate.readCount} 件 / 概算{' '}
          {formatCostUsd(previewEstimate.estimatedCostUsd)} — 更新: 書込 {updateEstimate.writeCount}{' '}
          件 / {updateEstimate.batchCount} バッチ / 概算 {formatCostUsd(updateEstimate.estimatedCostUsd)}
        </p>
      </div>

      {previewItems && previewItems.length > 0 && <DiffPreviewPanel items={previewItems} />}
    </section>
  )
}

export default BulkActionsPanel
