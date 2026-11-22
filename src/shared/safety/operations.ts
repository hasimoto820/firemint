import { tr } from '@shared/i18n/shared/current'
export const FIRESTORE_BATCH_LIMIT = 500

export type OperationEstimate = {
  readCount: number
  writeCount: number
  batchCount: number
  estimatedCostUsd: number
}

export function calculateBatchCount(itemCount: number, batchSize = FIRESTORE_BATCH_LIMIT): number {
  if (itemCount <= 0) {
    return 0
  }

  return Math.ceil(itemCount / batchSize)
}

export function estimateBulkDeleteCost(deleteCount: number): OperationEstimate {
  const batchCount = calculateBatchCount(deleteCount)

  return {
    readCount: 0,
    writeCount: deleteCount,
    batchCount,
    estimatedCostUsd: deleteCount * 0.0000018
  }
}

export function estimateBulkUpdateCost(updateCount: number): OperationEstimate {
  const batchCount = calculateBatchCount(updateCount)

  return {
    readCount: 0,
    writeCount: updateCount,
    batchCount,
    estimatedCostUsd: updateCount * 0.0000018
  }
}

export function estimateBulkPreviewCost(documentCount: number): OperationEstimate {
  return {
    readCount: documentCount,
    writeCount: 0,
    batchCount: 0,
    estimatedCostUsd: documentCount * 0.0000006
  }
}

export function formatCostUsd(usd: number): string {
  if (usd <= 0) {
    return '$0'
  }

  if (usd < 0.0001) {
    return '< $0.0001'
  }

  return `$${usd.toFixed(4)}`
}

export function formatBatchMessage(itemCount: number, batchSize = FIRESTORE_BATCH_LIMIT): string {
  const batchCount = calculateBatchCount(itemCount, batchSize)

  if (itemCount <= batchSize) {
    return tr('ui.batch_one', { count: itemCount })
  }

  return tr('ui.batch_many', { count: itemCount, batches: batchCount, size: batchSize })
}

export function buildDestructiveConfirmMessage(action: 'delete' | 'update', count: number): string {
  const actionLabel = action === 'delete' ? tr('ui.action_delete') : tr('ui.action_update')
  const batchInfo = formatBatchMessage(count)

  return `${tr('ui.destructive_confirm', { count, action: actionLabel })}\n${batchInfo}`
}
