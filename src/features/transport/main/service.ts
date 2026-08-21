import { iterateExportDocuments } from '@features/data_transfer/main/project_export_service'
import type { ExportDocument } from '@features/data_transfer/shared/types'
import type {
  TransportInput,
  TransportProgress,
  TransportResult,
  TransportValidationResult
} from '@features/transport/shared/types'
import { ensureWritable } from '@features/workspace/main/guard'
import { assertCollectionPath, getDocumentRef } from '@shared/firestore/paths'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { logError, logInfo } from '@shared/logging/logger'

const COLLISION_SAMPLE_LIMIT = 20

type ProgressReporter = (progress: TransportProgress) => void

type PendingWrite = {
  documentPath: string
  data: Record<string, unknown>
}

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toValidationError(
  error: unknown,
  canceled = false
): TransportValidationResult {
  logError('transport', 'validateTransport failed', error)

  if (canceled || isCanceledError(error)) {
    return { ok: false, error: '検証をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Validate transport failed'
  }
}

function toTransportError(error: unknown, canceled = false): TransportResult {
  const wasCanceled = canceled || isCanceledError(error)
  logError('transport', 'transport failed', error)

  if (wasCanceled) {
    return { ok: false, error: 'トランスポートをキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Transport failed'
  }
}

function progressPercent(processedCount: number): number {
  return Math.min(90, 5 + Math.floor(processedCount / 50))
}

function remapDocumentPath(
  documentPath: string,
  sourceCollectionPath: string,
  destinationCollectionPath: string
): string {
  if (sourceCollectionPath === destinationCollectionPath) {
    return documentPath
  }

  const prefix = `${sourceCollectionPath}/`
  if (!documentPath.startsWith(prefix)) {
    throw new Error(`ソース外のドキュメントです: ${documentPath}`)
  }

  return `${destinationCollectionPath}/${documentPath.slice(prefix.length)}`
}

function resolveCollectionPaths(input: TransportInput): {
  sourceCollectionPath: string
  destinationCollectionPath: string
} {
  const sourceCollectionPath = input.sourceCollectionPath?.trim() ?? ''
  if (!sourceCollectionPath) {
    throw new Error('コピー元のコレクションを指定してください')
  }

  const destinationCollectionPath =
    input.destinationCollectionPath?.trim() || sourceCollectionPath
  if (!destinationCollectionPath) {
    throw new Error('コピー先のコレクションを指定してください')
  }

  assertCollectionPath(sourceCollectionPath)
  assertCollectionPath(destinationCollectionPath)

  return { sourceCollectionPath, destinationCollectionPath }
}

function resolveRootIds(input: TransportInput): string[] {
  const rootCollectionIds = (input.rootCollectionIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)

  if (rootCollectionIds.length === 0) {
    throw new Error('コピーするルートコレクションを選んでください')
  }

  for (const rootId of rootCollectionIds) {
    assertCollectionPath(rootId)
  }

  return rootCollectionIds
}

function assertProjects(input: TransportInput, requireWritable: boolean): void {
  const sourceProjectId = input.sourceProjectId.trim()
  const destinationProjectId = input.destinationProjectId.trim()

  if (!sourceProjectId || !destinationProjectId) {
    throw new Error('コピー元とコピー先のプロジェクトを指定してください')
  }

  if (sourceProjectId === destinationProjectId) {
    throw new Error('コピー先は別のプロジェクトを指定してください')
  }

  ensureConnected(sourceProjectId)
  ensureConnected(destinationProjectId)

  if (requireWritable) {
    ensureWritable(destinationProjectId)
  }
}

async function* iterateTransportDocuments(
  input: TransportInput,
  signal?: AbortSignal
): AsyncGenerator<{ destPath: string; document: ExportDocument }> {
  if (input.target === 'collection') {
    const { sourceCollectionPath, destinationCollectionPath } = resolveCollectionPaths(input)
    for await (const document of iterateExportDocuments(
      input.sourceProjectId,
      sourceCollectionPath,
      input.includeSubcollections,
      signal
    )) {
      yield {
        destPath: remapDocumentPath(
          document.path,
          sourceCollectionPath,
          destinationCollectionPath
        ),
        document
      }
    }
    return
  }

  for (const rootId of resolveRootIds(input)) {
    throwIfCanceled(signal)
    for await (const document of iterateExportDocuments(
      input.sourceProjectId,
      rootId,
      input.includeSubcollections,
      signal
    )) {
      yield { destPath: document.path, document }
    }
  }
}

async function flushWrites(
  destinationProjectId: string,
  pending: PendingWrite[],
  signal?: AbortSignal
): Promise<void> {
  if (pending.length === 0) {
    return
  }

  throwIfCanceled(signal)
  const db = getFirestore(destinationProjectId)
  const batch = db.batch()

  for (const write of pending) {
    batch.create(
      getDocumentRef(write.documentPath, destinationProjectId),
      deserializeDocumentData(write.data, destinationProjectId)
    )
  }

  await batch.commit()
  pending.length = 0
}

export async function validateTransport(
  input: TransportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<TransportValidationResult> {
  try {
    assertProjects(input, false)

    logInfo(
      'transport',
      `validateTransport ${input.sourceProjectId} → ${input.destinationProjectId} target=${input.target}`
    )

    const collisionSamples: string[] = []
    let documentCount = 0
    let collisionCount = 0

    for await (const item of iterateTransportDocuments(input, signal)) {
      throwIfCanceled(signal)
      documentCount += 1

      const snapshot = await getDocumentRef(item.destPath, input.destinationProjectId).get()
      if (snapshot.exists) {
        collisionCount += 1
        if (collisionSamples.length < COLLISION_SAMPLE_LIMIT) {
          collisionSamples.push(item.destPath)
        }
      }

      if (documentCount === 1 || documentCount % 50 === 0) {
        onProgress?.({
          phase: 'validating',
          processedCount: documentCount,
          writtenCount: 0,
          skippedCount: collisionCount,
          percent: progressPercent(documentCount),
          detail: item.destPath
        })
      }
    }

    onProgress?.({
      phase: 'done',
      processedCount: documentCount,
      writtenCount: 0,
      skippedCount: collisionCount,
      percent: 100,
      detail: null
    })

    return {
      ok: true,
      data: {
        documentCount,
        collisionCount,
        writeCount: documentCount - collisionCount,
        collisionSamples,
        includeSubcollections: input.includeSubcollections
      }
    }
  } catch (error) {
    return toValidationError(error)
  }
}

export async function transportDocuments(
  input: TransportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<TransportResult> {
  try {
    assertProjects(input, true)

    logInfo(
      'transport',
      `transport ${input.sourceProjectId} → ${input.destinationProjectId} target=${input.target}`
    )

    const collisionSamples: string[] = []
    const pending: PendingWrite[] = []
    let documentCount = 0
    let writtenCount = 0
    let skippedCount = 0

    for await (const item of iterateTransportDocuments(input, signal)) {
      throwIfCanceled(signal)
      documentCount += 1

      const snapshot = await getDocumentRef(item.destPath, input.destinationProjectId).get()
      if (snapshot.exists) {
        skippedCount += 1
        if (collisionSamples.length < COLLISION_SAMPLE_LIMIT) {
          collisionSamples.push(item.destPath)
        }
      } else {
        pending.push({ documentPath: item.destPath, data: item.document.data })
        if (pending.length >= FIRESTORE_BATCH_LIMIT) {
          await flushWrites(input.destinationProjectId, pending, signal)
          writtenCount += FIRESTORE_BATCH_LIMIT
        }
      }

      if (documentCount === 1 || documentCount % 50 === 0) {
        onProgress?.({
          phase: 'writing',
          processedCount: documentCount,
          writtenCount,
          skippedCount,
          percent: progressPercent(documentCount),
          detail: item.destPath
        })
      }
    }

    const leftover = pending.length
    await flushWrites(input.destinationProjectId, pending, signal)
    writtenCount += leftover

    onProgress?.({
      phase: 'done',
      processedCount: documentCount,
      writtenCount,
      skippedCount,
      percent: 100,
      detail: null
    })

    return {
      ok: true,
      data: {
        documentCount,
        writtenCount,
        skippedCount,
        collisionSamples,
        includeSubcollections: input.includeSubcollections
      }
    }
  } catch (error) {
    return toTransportError(error)
  }
}
