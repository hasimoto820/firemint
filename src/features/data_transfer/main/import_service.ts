import { readFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { ensureWritable } from '@features/workspace/main/guard'
import { getCollectionRef, getDocumentRef, joinDocumentPath } from '@shared/firestore/paths'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  ImportCollectionJsonInput,
  ImportCollectionProgress,
  ImportCollectionValidation,
  ImportCollectionValidationResult,
  ImportDocument,
  ImportResult
} from '@features/data_transfer/shared/types'

type ProgressReporter = (progress: ImportCollectionProgress) => void

type PlannedWrite =
  | {
      kind: 'existingId'
      documentPath: string
      data: Record<string, unknown>
    }
  | {
      kind: 'autoId'
      collectionPath: string
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
): ImportCollectionValidationResult {
  logError('data_transfer', 'validateCollectionImport failed', error)

  if (canceled) {
    return { ok: false, error: '検証をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Validate collection import failed'
  }
}

function toImportError(error: unknown, canceled = false): ImportResult {
  logError('data_transfer', 'importCollectionJson failed', error)

  if (canceled) {
    return { ok: false, error: 'インポートをキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Import failed'
  }
}

function isDocumentPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean)
  return segments.length > 0 && segments.length % 2 === 0
}

function isDirectDocumentPath(documentPath: string, collectionPath: string): boolean {
  const prefix = `${collectionPath}/`
  if (!documentPath.startsWith(prefix)) {
    return false
  }

  const rest = documentPath.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/')
}

function isUnderCollectionPath(documentPath: string, collectionPath: string): boolean {
  return documentPath.startsWith(`${collectionPath}/`)
}

function parseImportDocuments(raw: string): ImportDocument[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('JSON は ExportDocument の配列である必要があります')
  }

  if (parsed.length === 0) {
    throw new Error('インポート対象のドキュメントがありません')
  }

  return parsed.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${index + 1} 件目の形式が不正です（オブジェクトではありません）`)
    }

    const record = item as Record<string, unknown>
    if (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data)) {
      throw new Error(`${index + 1} 件目に data オブジェクトがありません`)
    }

    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined
    const path = typeof record.path === 'string' && record.path.trim() ? record.path.trim() : undefined

    return {
      id,
      path,
      data: record.data as Record<string, unknown>
    }
  })
}

/**
 * 書込先 path を決める。
 * 仕様: path はヒント。id があるときは「親 + id」を正とする（001_008）。
 */
function resolveDocumentPath(
  document: ImportDocument,
  collectionPath: string,
  includeSubcollections: boolean
): string | 'auto' | 'skip' {
  if (document.id) {
    if (document.path && isDocumentPath(document.path) && isUnderCollectionPath(document.path, collectionPath)) {
      if (!includeSubcollections && !isDirectDocumentPath(document.path, collectionPath)) {
        return 'skip'
      }

      const segments = document.path.split('/').filter(Boolean)
      segments[segments.length - 1] = document.id
      return segments.join('/')
    }

    return joinDocumentPath(collectionPath, document.id)
  }

  if (document.path) {
    if (!isDocumentPath(document.path)) {
      throw new Error(`不正なドキュメント path です: ${document.path}`)
    }

    if (!isUnderCollectionPath(document.path, collectionPath)) {
      return 'skip'
    }

    if (!includeSubcollections && !isDirectDocumentPath(document.path, collectionPath)) {
      return 'skip'
    }

    return document.path
  }

  return 'auto'
}

function planWrites(
  documents: ImportDocument[],
  collectionPath: string,
  includeSubcollections: boolean
): { planned: PlannedWrite[]; skippedOutsideCount: number } {
  const planned: PlannedWrite[] = []
  let skippedOutsideCount = 0

  for (const document of documents) {
    const resolved = resolveDocumentPath(document, collectionPath, includeSubcollections)

    if (resolved === 'skip') {
      skippedOutsideCount += 1
      continue
    }

    if (resolved === 'auto') {
      planned.push({
        kind: 'autoId',
        collectionPath,
        data: document.data
      })
      continue
    }

    planned.push({
      kind: 'existingId',
      documentPath: resolved,
      data: document.data
    })
  }

  return { planned, skippedOutsideCount }
}

async function findCollisions(
  projectId: string,
  planned: PlannedWrite[],
  onProgress?: ProgressReporter
): Promise<{ hasCollisions: boolean; collisionSamples: string[]; checkedCount: number }> {
  const existingIdWrites = planned.filter(
    (write): write is Extract<PlannedWrite, { kind: 'existingId' }> => write.kind === 'existingId'
  )
  const collisionSamples: string[] = []
  let checkedCount = 0
  const totalCount = existingIdWrites.length

  for (const write of existingIdWrites) {
    checkedCount += 1

    if (checkedCount === 1 || checkedCount % 50 === 0 || checkedCount === totalCount) {
      onProgress?.({
        phase: 'validating',
        processedCount: checkedCount,
        totalCount,
        percent: totalCount === 0 ? 90 : Math.min(90, Math.round((checkedCount / totalCount) * 90)),
        detail: write.documentPath
      })
    }

    const snapshot = await getDocumentRef(write.documentPath, projectId).get()
    if (snapshot.exists) {
      if (collisionSamples.length < 5) {
        collisionSamples.push(write.documentPath)
      }

      if (collisionSamples.length >= 5) {
        return {
          hasCollisions: true,
          collisionSamples,
          checkedCount
        }
      }
    }
  }

  return {
    hasCollisions: collisionSamples.length > 0,
    collisionSamples,
    checkedCount
  }
}

async function writePlannedDocuments(
  projectId: string,
  planned: PlannedWrite[],
  onProgress?: ProgressReporter
): Promise<number> {
  const db = getFirestore(projectId)
  let writtenCount = 0
  const totalCount = planned.length

  for (let offset = 0; offset < planned.length; offset += FIRESTORE_BATCH_LIMIT) {
    const chunk = planned.slice(offset, offset + FIRESTORE_BATCH_LIMIT)
    const batch = db.batch()

    for (const write of chunk) {
      const data = deserializeDocumentData(write.data)

      if (write.kind === 'existingId') {
        batch.create(getDocumentRef(write.documentPath, projectId), data)
      } else {
        batch.create(getCollectionRef(write.collectionPath, projectId).doc(), data)
      }

      writtenCount += 1
    }

    await batch.commit()

    const last = chunk[chunk.length - 1]
    onProgress?.({
      phase: 'writing',
      processedCount: writtenCount,
      totalCount,
      percent: totalCount === 0 ? 100 : Math.min(99, Math.round((writtenCount / totalCount) * 100)),
      detail: last.kind === 'existingId' ? last.documentPath : last.collectionPath
    })
  }

  return writtenCount
}

async function loadAndPlan(
  input: ImportCollectionJsonInput,
  onProgress?: ProgressReporter
): Promise<{
  filePath: string
  collectionPath: string
  planned: PlannedWrite[]
  skippedOutsideCount: number
  includeSubcollections: boolean
}> {
  const collectionPath = input.collectionPath.trim()
  if (!collectionPath) {
    throw new Error('コレクション path を指定してください')
  }

  const filePath = input.filePath.trim()
  if (!filePath) {
    throw new Error('JSON ファイルを指定してください')
  }

  onProgress?.({
    phase: 'loading',
    processedCount: 0,
    totalCount: 0,
    percent: 5,
    detail: 'JSON を読み込み中…'
  })

  const raw = await readFile(filePath, 'utf8')
  const documents = parseImportDocuments(raw)
  const { planned, skippedOutsideCount } = planWrites(
    documents,
    collectionPath,
    input.includeSubcollections
  )

  if (planned.length === 0) {
    throw new Error('宛先コレクションに書き込むドキュメントがありません')
  }

  return {
    filePath,
    collectionPath,
    planned,
    skippedOutsideCount,
    includeSubcollections: input.includeSubcollections
  }
}

function buildValidation(
  loaded: Awaited<ReturnType<typeof loadAndPlan>>,
  collisions: { hasCollisions: boolean; collisionSamples: string[]; checkedCount: number }
): ImportCollectionValidation {
  const existingIdCount = loaded.planned.filter((write) => write.kind === 'existingId').length
  const autoIdCount = loaded.planned.length - existingIdCount

  return {
    filePath: loaded.filePath,
    writeCount: loaded.planned.length,
    skippedOutsideCount: loaded.skippedOutsideCount,
    includeSubcollections: loaded.includeSubcollections,
    existingIdCount,
    autoIdCount,
    hasCollisions: collisions.hasCollisions,
    collisionSamples: collisions.collisionSamples,
    checkedCount: collisions.checkedCount
  }
}

export async function selectCollectionImportJson(
  window: BrowserWindow | null
): Promise<{ canceled: boolean; filePath: string | null }> {
  const options = {
    title: 'インポートする JSON を選択',
    properties: ['openFile' as const],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }

  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null }
  }

  return { canceled: false, filePath: result.filePaths[0] }
}

export async function validateCollectionImport(
  input: ImportCollectionJsonInput,
  onProgress?: ProgressReporter
): Promise<ImportCollectionValidationResult> {
  try {
    ensureConnected(input.projectId)

    logInfo(
      'data_transfer',
      `validateCollectionImport projectId=${input.projectId} path=${input.collectionPath} file=${input.filePath}`
    )

    const loaded = await loadAndPlan(input, onProgress)
    const collisions = await findCollisions(input.projectId, loaded.planned, onProgress)

    onProgress?.({
      phase: 'done',
      processedCount: collisions.checkedCount,
      totalCount: loaded.planned.filter((write) => write.kind === 'existingId').length,
      percent: 100,
      detail: collisions.hasCollisions ? '衝突あり' : '検証 OK'
    })

    return {
      ok: true,
      data: buildValidation(loaded, collisions)
    }
  } catch (error) {
    return toValidationError(error)
  }
}

export async function importCollectionJson(
  input: ImportCollectionJsonInput,
  onProgress?: ProgressReporter
): Promise<ImportResult> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    logInfo(
      'data_transfer',
      `importCollectionJson projectId=${input.projectId} path=${input.collectionPath} file=${input.filePath}`
    )

    const loaded = await loadAndPlan(input, onProgress)
    const collisions = await findCollisions(input.projectId, loaded.planned, onProgress)

    if (collisions.hasCollisions) {
      throw new Error(
        `既存ドキュメントと衝突したため中止しました: ${collisions.collisionSamples.join(', ')}`
      )
    }

    const writtenCount = await writePlannedDocuments(input.projectId, loaded.planned, onProgress)

    onProgress?.({
      phase: 'done',
      processedCount: writtenCount,
      totalCount: loaded.planned.length,
      percent: 100,
      detail: '完了'
    })

    return {
      ok: true,
      data: {
        writtenCount,
        skippedOutsideCount: loaded.skippedOutsideCount,
        includeSubcollections: loaded.includeSubcollections,
        filePath: loaded.filePath
      }
    }
  } catch (error) {
    return toImportError(error)
  }
}
