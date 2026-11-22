import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useState } from 'react'
import { useFieldAutocompleteItems } from '@features/autocomplete/renderer/hooks'
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
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import { confirmAction } from '@shared/ui/confirmAction'
import DiffPreviewPanel from '@shared/ui/DiffPreviewPanel'

type BulkActionsPanelProps = {
  projectId: string
  selectedPaths: string[]
  loading: boolean
  onLoadingChange: (loading: boolean) => void
  onClearSelection: () => void
  onOperationComplete: () => void
  onError: (message: string | null) => void
}

function BulkActionsPanel({
  projectId,
  selectedPaths,
  loading,
  onLoadingChange,
  onClearSelection,
  onOperationComplete,
  onError
}: BulkActionsPanelProps): React.JSX.Element | null {
  const { t } = useI18n()
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [previewItems, setPreviewItems] = useState<DiffPreviewItem[] | null>(null)

  const fieldItems = useFieldAutocompleteItems(projectId)

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
        projectId,
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
      onError(t('explorer.preview_first'))
      return
    }

    const message = buildDestructiveConfirmMessage('update', selectedPaths.length)
    if (!(await confirmAction(message))) {
      return
    }

    onError(null)
    onLoadingChange(true)

    try {
      const result = await window.api.bulk.updateField({
        projectId,
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
    const message = buildDestructiveConfirmMessage('delete', selectedPaths.length)
    if (!(await confirmAction(message))) {
      return
    }

    onError(null)
    onLoadingChange(true)

    try {
      const result = await window.api.bulk.delete({
        projectId,
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
        <h3 className="bulk-actions__title">
          {t('ui.selected_count', { count: selectedPaths.length })}
        </h3>
        <Button onClick={onClearSelection} disabled={loading}>
          {t('ui.clear_selection')}
        </Button>
      </div>

      <p className="bulk-actions__batch">
        {t('ui.batch_label', { info: formatBatchMessage(selectedPaths.length) })}
      </p>

      <div className="bulk-actions__delete">
        <Button variant="danger" onClick={() => void handleDelete()} disabled={loading}>
          {t('common.delete')}
        </Button>
        <span className="bulk-actions__cost">
          {t('ui.delete_cost', {
            writes: deleteEstimate.writeCount,
            batches: deleteEstimate.batchCount,
            cost: formatCostUsd(deleteEstimate.estimatedCostUsd)
          })}
        </span>
      </div>

      <div className="bulk-actions__update">
        <h4 className="bulk-actions__subtitle">{t('ui.bulk_update_title')}</h4>
        <div className="bulk-actions__update-row">
          <AutocompleteInput
            className="bulk-actions__field-wrap"
            fieldClassName="bulk-actions__input"
            value={field}
            items={fieldItems}
            disabled={loading}
            placeholder="field"
            aria-label={t('ui.bulk_update_field_aria')}
            onChange={(next) => {
              setField(next)
              setPreviewItems(null)
            }}
          />
          <input
            className="bulk-actions__input bulk-actions__input--value"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setPreviewItems(null)
            }}
            placeholder={t('ui.bulk_value_placeholder')}
            disabled={loading}
          />
          <Button onClick={() => void handlePreview()} disabled={loading || !field.trim()}>
            {t('ui.preview')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApplyUpdate()}
            disabled={loading || !previewItems?.length}
          >
            {t('ui.bulk_update')}
          </Button>
        </div>
        <p className="bulk-actions__cost">
          {t('ui.update_cost', {
            reads: previewEstimate.readCount,
            previewCost: formatCostUsd(previewEstimate.estimatedCostUsd),
            writes: updateEstimate.writeCount,
            batches: updateEstimate.batchCount,
            cost: formatCostUsd(updateEstimate.estimatedCostUsd)
          })}
        </p>
      </div>

      {previewItems && previewItems.length > 0 && <DiffPreviewPanel items={previewItems} />}
    </section>
  )
}

export default BulkActionsPanel
