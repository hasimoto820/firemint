import type { QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { getCollectionRef, getDocumentRef, joinDocumentPath } from '@shared/firestore/paths'
import { deserializeFirestoreValue } from '@shared/firestore/serialize'
import { parseQueryLiteral } from '@shared/firestore/value_parse'
import { calculateBatchCount, FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import { ensureWritable } from '@features/workspace/main/guard'
import type {
  BulkDeleteFieldInput,
  BulkDeleteInput,
  BulkOperationSummary,
  BulkRenameFieldInput,
  BulkResult,
  BulkUpdateFieldInput,
  DiffPreviewItem
} from '@features/bulk_operations/shared/types'

const PAGE_SIZE = 500
const PREVIEW_LIMIT = 50

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

function validateCollectionPath(collectionPath: string): string {
  const trimmed = collectionPath.trim()

  if (!trimmed) {
    throw new Error('コレクション path を指定してください')
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

async function* iterateCollectionDocs(
  projectId: string,
  collectionPath: string
): AsyncGenerator<QueryDocumentSnapshot> {
  const collectionRef = getCollectionRef(collectionPath, projectId)
  let lastDocument: QueryDocumentSnapshot | undefined

  while (true) {
    let query = collectionRef.orderBy('__name__').limit(PAGE_SIZE)

    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()

    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      yield doc
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < PAGE_SIZE) {
      break
    }
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

export async function previewBulkRenameField(
  input: BulkRenameFieldInput
): Promise<BulkResult<DiffPreviewItem[]>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const fromField = validateField(input.fromField)
    const toField = validateField(input.toField)

    if (fromField === toField) {
      throw new Error('変更先フィールド名は別の名前を指定してください')
    }

    const previewItems: DiffPreviewItem[] = []

    logInfo(
      'bulk_operations',
      `previewBulkRenameField projectId=${input.projectId} path=${collectionPath} from=${fromField} to=${toField}`
    )

    for await (const doc of iterateCollectionDocs(input.projectId, collectionPath)) {
      const data = doc.data() as Record<string, unknown>

      if (!(fromField in data)) {
        continue
      }

      previewItems.push({
        documentPath: joinDocumentPath(collectionPath, doc.id),
        field: `${fromField} → ${toField}`,
        before: formatPreviewValue(data[fromField]),
        after: formatPreviewValue(data[fromField])
      })

      if (previewItems.length >= PREVIEW_LIMIT) {
        break
      }
    }

    if (previewItems.length === 0) {
      throw new Error('リネーム対象のフィールドを持つドキュメントがありません')
    }

    return { ok: true, data: previewItems }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkRenameField(
  input: BulkRenameFieldInput
): Promise<BulkResult<BulkOperationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const fromField = validateField(input.fromField)
    const toField = validateField(input.toField)

    if (fromField === toField) {
      throw new Error('変更先フィールド名は別の名前を指定してください')
    }

    logInfo(
      'bulk_operations',
      `bulkRenameField projectId=${input.projectId} path=${collectionPath} from=${fromField} to=${toField}`
    )

    let affectedCount = 0
    let pending: Array<{ path: string; value: unknown }> = []

    const flush = async (): Promise<void> => {
      if (pending.length === 0) {
        return
      }

      const batch = getFirestore(input.projectId).batch()

      for (const item of pending) {
        batch.update(getDocumentRef(item.path, input.projectId), {
          [toField]: item.value,
          [fromField]: FieldValue.delete()
        })
      }

      await batch.commit()
      affectedCount += pending.length
      pending = []
    }

    for await (const doc of iterateCollectionDocs(input.projectId, collectionPath)) {
      const data = doc.data() as Record<string, unknown>

      if (!(fromField in data)) {
        continue
      }

      pending.push({
        path: joinDocumentPath(collectionPath, doc.id),
        value: data[fromField]
      })

      if (pending.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    }

    await flush()

    if (affectedCount === 0) {
      throw new Error('リネーム対象のフィールドを持つドキュメントがありません')
    }

    return {
      ok: true,
      data: {
        affectedCount,
        batchCount: calculateBatchCount(affectedCount)
      }
    }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function previewBulkDeleteField(
  input: BulkDeleteFieldInput
): Promise<BulkResult<DiffPreviewItem[]>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const previewItems: DiffPreviewItem[] = []

    logInfo(
      'bulk_operations',
      `previewBulkDeleteField projectId=${input.projectId} path=${collectionPath} field=${field}`
    )

    for await (const doc of iterateCollectionDocs(input.projectId, collectionPath)) {
      const data = doc.data() as Record<string, unknown>

      if (!(field in data)) {
        continue
      }

      previewItems.push({
        documentPath: joinDocumentPath(collectionPath, doc.id),
        field,
        before: formatPreviewValue(data[field]),
        after: null
      })

      if (previewItems.length >= PREVIEW_LIMIT) {
        break
      }
    }

    if (previewItems.length === 0) {
      throw new Error('削除対象のフィールドを持つドキュメントがありません')
    }

    return { ok: true, data: previewItems }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkDeleteField(
  input: BulkDeleteFieldInput
): Promise<BulkResult<BulkOperationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)

    logInfo(
      'bulk_operations',
      `bulkDeleteField projectId=${input.projectId} path=${collectionPath} field=${field}`
    )

    let affectedCount = 0
    let pendingPaths: string[] = []

    const flush = async (): Promise<void> => {
      if (pendingPaths.length === 0) {
        return
      }

      const batch = getFirestore(input.projectId).batch()

      for (const documentPath of pendingPaths) {
        batch.update(getDocumentRef(documentPath, input.projectId), {
          [field]: FieldValue.delete()
        })
      }

      await batch.commit()
      affectedCount += pendingPaths.length
      pendingPaths = []
    }

    for await (const doc of iterateCollectionDocs(input.projectId, collectionPath)) {
      const data = doc.data() as Record<string, unknown>

      if (!(field in data)) {
        continue
      }

      pendingPaths.push(joinDocumentPath(collectionPath, doc.id))

      if (pendingPaths.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    }

    await flush()

    if (affectedCount === 0) {
      throw new Error('削除対象のフィールドを持つドキュメントがありません')
    }

    return {
      ok: true,
      data: {
        affectedCount,
        batchCount: calculateBatchCount(affectedCount)
      }
    }
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
