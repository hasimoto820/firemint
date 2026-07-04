import type { WriteBatch } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { getDocumentRef } from '@shared/firestore/paths'
import { deserializeFirestoreValue } from '@shared/firestore/serialize'
import { parseQueryLiteral } from '@shared/firestore/value_parse'
import { calculateBatchCount, FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import { ensureWritable } from '@features/workspace/main/guard'
import type {
  BulkDeleteInput,
  BulkOperationSummary,
  BulkResult,
  BulkUpdateFieldInput,
  DiffPreviewItem
} from '@features/bulk_operations/shared/types'

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toBulkError<T>(error: unknown): BulkResult<T> {
  logError('bulk_operations', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Bulk operation failed'
  }
}

function validateDocumentPaths(documentPaths: string[]): string[] {
  const uniquePaths = Array.from(new Set(documentPaths.map((path) => path.trim()).filter(Boolean)))

  if (uniquePaths.length === 0) {
    throw new Error('対象ドキュメントを選択してください')
  }

  return uniquePaths
}

function validateField(field: string): string {
  const trimmed = field.trim()

  if (!trimmed) {
    throw new Error('更新フィールド名を入力してください')
  }

  return trimmed
}

function parseFieldValue(rawValue: string): unknown {
  return deserializeFirestoreValue(parseQueryLiteral(rawValue))
}

function formatPreviewValue(value: unknown): unknown {
  if (value === undefined) {
    return null
  }

  return value
}

async function commitInBatches(
  projectId: string,
  documentPaths: string[],
  applyToBatch: (batch: WriteBatch, documentPath: string) => void
): Promise<BulkOperationSummary> {
  const batches: string[][] = []

  for (let index = 0; index < documentPaths.length; index += FIRESTORE_BATCH_LIMIT) {
    batches.push(documentPaths.slice(index, index + FIRESTORE_BATCH_LIMIT))
  }

  for (const chunk of batches) {
    const batch = getFirestore(projectId).batch()

    for (const documentPath of chunk) {
      applyToBatch(batch, documentPath)
    }

    await batch.commit()
  }

  return {
    affectedCount: documentPaths.length,
    batchCount: batches.length
  }
}

export async function previewBulkUpdateField(
  input: BulkUpdateFieldInput
): Promise<BulkResult<DiffPreviewItem[]>> {
  try {
    ensureConnected(input.projectId)

    const documentPaths = validateDocumentPaths(input.documentPaths)
    const field = validateField(input.field)
    const parsedValue = parseQueryLiteral(input.value)
    const previewItems: DiffPreviewItem[] = []

    logInfo(
      'bulk_operations',
      `previewBulkUpdateField projectId=${input.projectId} count=${documentPaths.length} field=${field}`
    )

    for (const documentPath of documentPaths) {
      const snapshot = await getDocumentRef(documentPath, input.projectId).get()

      if (!snapshot.exists) {
        continue
      }

      const data = snapshot.data() as Record<string, unknown>

      previewItems.push({
        documentPath,
        field,
        before: formatPreviewValue(data[field]),
        after: formatPreviewValue(parsedValue)
      })
    }

    if (previewItems.length === 0) {
      throw new Error('プレビュー対象のドキュメントが見つかりません')
    }

    return { ok: true, data: previewItems }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkUpdateField(
  input: BulkUpdateFieldInput
): Promise<BulkResult<BulkOperationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const documentPaths = validateDocumentPaths(input.documentPaths)
    const field = validateField(input.field)
    const parsedValue = parseFieldValue(input.value)

    logInfo(
      'bulk_operations',
      `bulkUpdateField projectId=${input.projectId} count=${documentPaths.length} field=${field}`
    )

    const summary = await commitInBatches(input.projectId, documentPaths, (batch, documentPath) => {
      batch.set(
        getDocumentRef(documentPath, input.projectId),
        { [field]: parsedValue },
        { merge: true }
      )
    })

    return { ok: true, data: summary }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkDelete(
  input: BulkDeleteInput
): Promise<BulkResult<BulkOperationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const documentPaths = validateDocumentPaths(input.documentPaths)

    logInfo('bulk_operations', `bulkDelete projectId=${input.projectId} count=${documentPaths.length}`)

    const summary = await commitInBatches(input.projectId, documentPaths, (batch, documentPath) => {
      batch.delete(getDocumentRef(documentPath, input.projectId))
    })

    logInfo(
      'bulk_operations',
      `bulkDelete done affected=${summary.affectedCount} batches=${summary.batchCount}`
    )

    return { ok: true, data: summary }
  } catch (error) {
    return toBulkError(error)
  }
}

export function getBatchInfo(itemCount: number): { batchCount: number; batchLimit: number } {
  return {
    batchCount: calculateBatchCount(itemCount),
    batchLimit: FIRESTORE_BATCH_LIMIT
  }
}
