import type { QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { getCollectionRef, getDocumentRef, joinCollectionPath, joinDocumentPath } from '@shared/firestore/paths'
import { deserializeFirestoreValue } from '@shared/firestore/serialize'
import { parseQueryLiteral } from '@shared/firestore/value_parse'
import { calculateBatchCount, FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import { ensureWritable } from '@features/workspace/main/guard'
import type {
  BulkCreateFieldInput,
  BulkDeleteFieldInput,
  BulkDeleteInput,
  BulkFieldPreview,
  BulkFieldValueType,
  BulkFieldWriteResult,
  BulkOperationSummary,
  BulkRenameFieldInput,
  BulkResult,
  BulkUpdateFieldInput,
  BulkUpdateFieldValueInput,
  DiffPreviewItem
} from '@features/bulk_operations/shared/types'

const PAGE_SIZE = 500
const PREVIEW_LIMIT = 50
const COLLISION_PATH_LIMIT = 80

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

async function walkScopedDocuments(
  projectId: string,
  collectionPath: string,
  includeSubcollections: boolean,
  visit: (documentPath: string, data: Record<string, unknown>) => Promise<void> | void
): Promise<void> {
  for await (const doc of iterateCollectionDocs(projectId, collectionPath)) {
    const documentPath = joinDocumentPath(collectionPath, doc.id)
    await visit(documentPath, doc.data() as Record<string, unknown>)

    if (!includeSubcollections) {
      continue
    }

    const subcollections = await getDocumentRef(documentPath, projectId).listCollections()

    for (const subcollection of subcollections) {
      await walkScopedDocuments(
        projectId,
        joinCollectionPath(documentPath, subcollection.id),
        true,
        visit
      )
    }
  }
}

function rememberCollision(paths: string[], documentPath: string): void {
  if (paths.length < COLLISION_PATH_LIMIT) {
    paths.push(documentPath)
  }
}

function parseTypedFieldValue(valueType: BulkFieldValueType, rawValue: string): unknown {
  if (valueType === 'null') {
    return null
  }

  const trimmed = rawValue.trim()

  if (valueType === 'string') {
    return rawValue
  }

  if (valueType === 'boolean') {
    if (trimmed === 'true') {
      return true
    }

    if (trimmed === 'false') {
      return false
    }

    throw new Error('boolean は true または false を指定してください')
  }

  if (valueType === 'number') {
    if (trimmed === '' || Number.isNaN(Number(trimmed))) {
      throw new Error('number の値が不正です')
    }

    return Number(trimmed)
  }

  const timestamp = new Date(trimmed)

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('timestamp の値が不正です')
  }

  return timestamp
}

function toWriteResult(affectedCount: number, collisionPaths: string[], skippedCount: number): BulkFieldWriteResult {
  if (affectedCount === 0 && skippedCount === 0) {
    throw new Error('対象ドキュメントがありません')
  }

  return {
    affectedCount,
    batchCount: calculateBatchCount(affectedCount),
    skippedCount,
    collisionPaths
  }
}

export async function previewBulkUpdateFieldValue(
  input: BulkUpdateFieldValueInput
): Promise<BulkResult<BulkFieldPreview>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const parsedValue = parseTypedFieldValue(input.valueType, input.value)
    const includeSubcollections = input.includeSubcollections === true
    const previewItems: DiffPreviewItem[] = []
    let matchedCount = 0

    logInfo(
      'bulk_operations',
      `previewBulkUpdateFieldValue projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
    )

    await walkScopedDocuments(
      input.projectId,
      collectionPath,
      includeSubcollections,
      (documentPath, data) => {
        matchedCount += 1
        if (previewItems.length < PREVIEW_LIMIT) {
          previewItems.push({
            documentPath,
            field,
            before: formatPreviewValue(data[field]),
            after: formatPreviewValue(parsedValue)
          })
        }
      }
    )

    if (matchedCount === 0) {
      throw new Error('対象ドキュメントがありません')
    }

    return {
      ok: true,
      data: { items: previewItems, matchedCount, skippedCount: 0, collisionPaths: [] }
    }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkUpdateFieldValue(
  input: BulkUpdateFieldValueInput
): Promise<BulkResult<BulkFieldWriteResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const parsedValue = parseTypedFieldValue(input.valueType, input.value)
    const includeSubcollections = input.includeSubcollections === true
    let pendingPaths: string[] = []
    let affectedCount = 0

    logInfo(
      'bulk_operations',
      `bulkUpdateFieldValue projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
    )

    const flush = async (): Promise<void> => {
      if (pendingPaths.length === 0) {
        return
      }

      const batch = getFirestore(input.projectId).batch()

      for (const documentPath of pendingPaths) {
        batch.set(
          getDocumentRef(documentPath, input.projectId),
          { [field]: parsedValue },
          { merge: true }
        )
      }

      await batch.commit()
      affectedCount += pendingPaths.length
      pendingPaths = []
    }

    await walkScopedDocuments(
      input.projectId,
      collectionPath,
      includeSubcollections,
      async (documentPath) => {
        pendingPaths.push(documentPath)

        if (pendingPaths.length >= FIRESTORE_BATCH_LIMIT) {
          await flush()
        }
      }
    )

    await flush()

    return { ok: true, data: toWriteResult(affectedCount, [], 0) }
  } catch (error) {
    return toBulkError(error)
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

export async function previewBulkCreateField(
  input: BulkCreateFieldInput
): Promise<BulkResult<BulkFieldPreview>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const parsedValue = parseTypedFieldValue(input.valueType, input.value)
    const includeSubcollections = input.includeSubcollections === true
    const previewItems: DiffPreviewItem[] = []
    const collisionPaths: string[] = []
    let skippedCount = 0
    let matchedCount = 0

    logInfo(
      'bulk_operations',
      `previewBulkCreateField projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
    )

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, (documentPath, data) => {
      if (field in data) {
        skippedCount += 1
        rememberCollision(collisionPaths, documentPath)
        return
      }

      matchedCount += 1
      if (previewItems.length < PREVIEW_LIMIT) {
        previewItems.push({
          documentPath,
          field,
          before: null,
          after: formatPreviewValue(parsedValue)
        })
      }
    })

    if (matchedCount === 0 && skippedCount === 0) {
      throw new Error('対象ドキュメントがありません')
    }

    return { ok: true, data: { items: previewItems, matchedCount, skippedCount, collisionPaths } }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkCreateField(
  input: BulkCreateFieldInput
): Promise<BulkResult<BulkFieldWriteResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const parsedValue = parseTypedFieldValue(input.valueType, input.value)
    const includeSubcollections = input.includeSubcollections === true
    const collisionPaths: string[] = []
    let skippedCount = 0
    let pendingPaths: string[] = []
    let affectedCount = 0

    logInfo(
      'bulk_operations',
      `bulkCreateField projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
    )

    const flush = async (): Promise<void> => {
      if (pendingPaths.length === 0) {
        return
      }

      const batch = getFirestore(input.projectId).batch()

      for (const documentPath of pendingPaths) {
        batch.set(
          getDocumentRef(documentPath, input.projectId),
          { [field]: parsedValue },
          { merge: true }
        )
      }

      await batch.commit()
      affectedCount += pendingPaths.length
      pendingPaths = []
    }

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, async (documentPath, data) => {
      if (field in data) {
        skippedCount += 1
        rememberCollision(collisionPaths, documentPath)
        return
      }

      pendingPaths.push(documentPath)

      if (pendingPaths.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    })

    await flush()

    return { ok: true, data: toWriteResult(affectedCount, collisionPaths, skippedCount) }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function previewBulkRenameField(
  input: BulkRenameFieldInput
): Promise<BulkResult<BulkFieldPreview>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const fromField = validateField(input.fromField)
    const toField = validateField(input.toField)
    const includeSubcollections = input.includeSubcollections === true

    if (fromField === toField) {
      throw new Error('変更先フィールド名は別の名前を指定してください')
    }

    const previewItems: DiffPreviewItem[] = []
    const collisionPaths: string[] = []
    let skippedCount = 0
    let matchedCount = 0

    logInfo(
      'bulk_operations',
      `previewBulkRenameField projectId=${input.projectId} path=${collectionPath} from=${fromField} to=${toField} includeSubcollections=${includeSubcollections}`
    )

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, (documentPath, data) => {
      if (!(fromField in data)) {
        return
      }

      if (toField in data) {
        skippedCount += 1
        rememberCollision(collisionPaths, documentPath)
        return
      }

      matchedCount += 1
      if (previewItems.length < PREVIEW_LIMIT) {
        previewItems.push({
          documentPath,
          field: `${fromField} → ${toField}`,
          before: formatPreviewValue(data[fromField]),
          after: formatPreviewValue(data[fromField])
        })
      }
    })

    if (matchedCount === 0 && skippedCount === 0) {
      throw new Error('リネーム対象のフィールドを持つドキュメントがありません')
    }

    return { ok: true, data: { items: previewItems, matchedCount, skippedCount, collisionPaths } }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkRenameField(
  input: BulkRenameFieldInput
): Promise<BulkResult<BulkFieldWriteResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const fromField = validateField(input.fromField)
    const toField = validateField(input.toField)
    const includeSubcollections = input.includeSubcollections === true

    if (fromField === toField) {
      throw new Error('変更先フィールド名は別の名前を指定してください')
    }

    logInfo(
      'bulk_operations',
      `bulkRenameField projectId=${input.projectId} path=${collectionPath} from=${fromField} to=${toField} includeSubcollections=${includeSubcollections}`
    )

    const collisionPaths: string[] = []
    let skippedCount = 0
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

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, async (documentPath, data) => {
      if (!(fromField in data)) {
        return
      }

      if (toField in data) {
        skippedCount += 1
        rememberCollision(collisionPaths, documentPath)
        return
      }

      pending.push({
        path: documentPath,
        value: data[fromField]
      })

      if (pending.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    })

    await flush()

    return { ok: true, data: toWriteResult(affectedCount, collisionPaths, skippedCount) }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function previewBulkDeleteField(
  input: BulkDeleteFieldInput
): Promise<BulkResult<BulkFieldPreview>> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const includeSubcollections = input.includeSubcollections === true
    const previewItems: DiffPreviewItem[] = []
    let matchedCount = 0

    logInfo(
      'bulk_operations',
      `previewBulkDeleteField projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
    )

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, (documentPath, data) => {
      if (!(field in data)) {
        return
      }

      matchedCount += 1
      if (previewItems.length < PREVIEW_LIMIT) {
        previewItems.push({
          documentPath,
          field,
          before: formatPreviewValue(data[field]),
          after: null
        })
      }
    })

    if (matchedCount === 0) {
      throw new Error('削除対象のフィールドを持つドキュメントがありません')
    }

    return {
      ok: true,
      data: { items: previewItems, matchedCount, skippedCount: 0, collisionPaths: [] }
    }
  } catch (error) {
    return toBulkError(error)
  }
}

export async function bulkDeleteField(
  input: BulkDeleteFieldInput
): Promise<BulkResult<BulkFieldWriteResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = validateCollectionPath(input.collectionPath)
    const field = validateField(input.field)
    const includeSubcollections = input.includeSubcollections === true

    logInfo(
      'bulk_operations',
      `bulkDeleteField projectId=${input.projectId} path=${collectionPath} field=${field} includeSubcollections=${includeSubcollections}`
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

    await walkScopedDocuments(input.projectId, collectionPath, includeSubcollections, async (documentPath, data) => {
      if (!(field in data)) {
        return
      }

      pendingPaths.push(documentPath)

      if (pendingPaths.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    })

    await flush()

    if (affectedCount === 0) {
      throw new Error('削除対象のフィールドを持つドキュメントがありません')
    }

    return {
      ok: true,
      data: {
        affectedCount,
        batchCount: calculateBatchCount(affectedCount),
        skippedCount: 0,
        collisionPaths: []
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
