import { readFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { ensureWritable } from '@features/workspace/main/guard'
import { getCollectionRef, getDocumentRef, joinDocumentPath } from '@shared/firestore/paths'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  ImportCollectionJsonInput,
  ImportDocumentsJsonInput,
  ImportCollectionProgress,
  ImportCollectionValidation,
  ImportCollectionValidationResult,
  ImportDocument,
  ImportResult,
  PeekCollectionImportResult
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
  const wasCanceled = canceled || isCanceledError(error)
  logError('data_transfer', 'importCollectionJson failed', error)

  if (wasCanceled) {
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

function collectionParentOfDocument(documentPath: string): string | null {
  const segments = documentPath.split('/').filter(Boolean)
  if (segments.length < 2 || segments.length % 2 !== 0) {
    return null
  }

  return segments.slice(0, -1).join('/')
}

function commonCollectionPrefix(collectionPaths: string[]): string | null {
  if (collectionPaths.length === 0) {
    return null
  }

  const split = collectionPaths.map((path) => path.split('/').filter(Boolean))
  const minLen = Math.min(...split.map((segments) => segments.length))
  let count = 0

  while (count < minLen && split.every((segments) => segments[count] === split[0][count])) {
    count += 1
  }

  const collectionCount = count % 2 === 1 ? count : count - 1
  if (collectionCount <= 0) {
    return null
  }

  return split[0].slice(0, collectionCount).join('/')
}

function inferCollectionPath(documents: ImportDocument[]): string | null {
  const parents: string[] = []

  for (const document of documents) {
    if (!document.path) {
      continue
    }

    const parent = collectionParentOfDocument(document.path)
    if (parent) {
      parents.push(parent)
    }
  }

  return commonCollectionPrefix(parents)
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
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<{ hasCollisions: boolean; collisionSamples: string[]; checkedCount: number }> {
  const existingIdWrites = planned.filter(
    (write): write is Extract<PlannedWrite, { kind: 'existingId' }> => write.kind === 'existingId'
  )
  const collisionSamples: string[] = []
  let checkedCount = 0
  const totalCount = existingIdWrites.length

  for (const write of existingIdWrites) {
    throwIfCanceled(signal)
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

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function documentPathDepth(documentPath: string): number {
  return pathSegments(documentPath).length
}

function ancestorDocumentPaths(documentPath: string): string[] {
  const segments = pathSegments(documentPath)
  const ancestors: string[] = []

  for (let length = 2; length <= segments.length - 2; length += 2) {
    ancestors.push(segments.slice(0, length).join('/'))
  }

  return ancestors
}

function parentDocumentOfCollection(collectionPath: string): string | null {
  const segments = pathSegments(collectionPath)

  if (segments.length < 3) {
    return null
  }

  return segments.slice(0, -1).join('/')
}

function writeDepth(write: PlannedWrite): number {
  if (write.kind === 'existingId') {
    return documentPathDepth(write.documentPath)
  }

  return documentPathDepth(write.collectionPath) + 1
}

function writeKey(write: PlannedWrite): string {
  return write.kind === 'existingId' ? write.documentPath : write.collectionPath
}

async function expandWritesWithMissingAncestors(
  projectId: string,
  planned: PlannedWrite[]
): Promise<PlannedWrite[]> {
  const existingPaths = new Set(
    planned
      .filter(
        (write): write is Extract<PlannedWrite, { kind: 'existingId' }> =>
          write.kind === 'existingId'
      )
      .map((write) => write.documentPath)
  )
  const needed = new Set<string>()

  const addAncestors = (documentPath: string): void => {
    for (const ancestor of ancestorDocumentPaths(documentPath)) {
      if (!existingPaths.has(ancestor)) {
        needed.add(ancestor)
      }
    }

    if (!existingPaths.has(documentPath)) {
      needed.add(documentPath)
    }
  }

  for (const write of planned) {
    if (write.kind === 'existingId') {
      for (const ancestor of ancestorDocumentPaths(write.documentPath)) {
        if (!existingPaths.has(ancestor)) {
          needed.add(ancestor)
        }
      }
    } else {
      const parent = parentDocumentOfCollection(write.collectionPath)
      if (parent) {
        addAncestors(parent)
      }
    }
  }

  const extra: PlannedWrite[] = []

  for (const documentPath of needed) {
    const snapshot = await getDocumentRef(documentPath, projectId).get()
    if (!snapshot.exists) {
      extra.push({ kind: 'existingId', documentPath, data: {} })
    }
  }

  return [...extra, ...planned]
}

function sortWritesByDepth(planned: PlannedWrite[]): PlannedWrite[] {
  return [...planned].sort((left, right) => {
    const depthDiff = writeDepth(left) - writeDepth(right)
    if (depthDiff !== 0) {
      return depthDiff
    }

    return writeKey(left).localeCompare(writeKey(right))
  })
}

async function writePlannedDocuments(
  projectId: string,
  planned: PlannedWrite[],
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<number> {
  const expanded = sortWritesByDepth(await expandWritesWithMissingAncestors(projectId, planned))
  const db = getFirestore(projectId)
  let writtenCount = 0
  const totalCount = expanded.length
  let offset = 0

  while (offset < expanded.length) {
    throwIfCanceled(signal)
    const depth = writeDepth(expanded[offset])
    const chunk: PlannedWrite[] = []

    while (
      offset < expanded.length &&
      writeDepth(expanded[offset]) === depth &&
      chunk.length < FIRESTORE_BATCH_LIMIT
    ) {
      chunk.push(expanded[offset])
      offset += 1
    }

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

function planWritesFromPaths(documents: ImportDocument[]): PlannedWrite[] {
  return documents.map((document, index) => {
    const path = document.path?.trim() ?? ''

    if (!path) {
      throw new Error(`${index + 1} 件目に path がありません`)
    }

    if (!isDocumentPath(path)) {
      throw new Error(`${index + 1} 件目の path が不正です: ${path}`)
    }

    return {
      kind: 'existingId' as const,
      documentPath: path,
      data: document.data
    }
  })
}

async function loadAndPlanFromPaths(
  filePath: string,
  onProgress?: ProgressReporter
): Promise<PlannedWrite[]> {
  if (!filePath.trim()) {
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
  const planned = planWritesFromPaths(parseImportDocuments(raw))

  if (planned.length === 0) {
    throw new Error('インポート対象のドキュメントがありません')
  }

  return planned
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

export async function peekCollectionImportJson(
  filePath: string
): Promise<PeekCollectionImportResult> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const documents = parseImportDocuments(raw)
    return {
      ok: true,
      collectionPath: inferCollectionPath(documents)
    }
  } catch (error) {
    logError('data_transfer', 'peekCollectionImportJson failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'JSON を読み取れませんでした'
    }
  }
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
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<ImportResult> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)
    throwIfCanceled(signal)

    logInfo(
      'data_transfer',
      `importCollectionJson projectId=${input.projectId} path=${input.collectionPath} file=${input.filePath}`
    )

    const loaded = await loadAndPlan(input, onProgress)
    throwIfCanceled(signal)
    const collisions = await findCollisions(input.projectId, loaded.planned, onProgress, signal)

    if (collisions.hasCollisions) {
      throw new Error(
        `既存ドキュメントと衝突したため中止しました: ${collisions.collisionSamples.join(', ')}`
      )
    }

    const writtenCount = await writePlannedDocuments(
      input.projectId,
      loaded.planned,
      onProgress,
      signal
    )

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

export async function importDocumentsJson(
  input: ImportDocumentsJsonInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<ImportResult> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)
    throwIfCanceled(signal)

    logInfo(
      'data_transfer',
      `importDocumentsJson projectId=${input.projectId} file=${input.filePath}`
    )

    const planned = await loadAndPlanFromPaths(input.filePath, onProgress)
    throwIfCanceled(signal)
    const collisions = await findCollisions(input.projectId, planned, onProgress, signal)

    if (collisions.hasCollisions) {
      throw new Error(
        `既存ドキュメントと衝突したため中止しました: ${collisions.collisionSamples.join(', ')}`
      )
    }

    const writtenCount = await writePlannedDocuments(
      input.projectId,
      planned,
      onProgress,
      signal
    )

    onProgress?.({
      phase: 'done',
      processedCount: writtenCount,
      totalCount: planned.length,
      percent: 100,
      detail: '完了'
    })

    return {
      ok: true,
      data: {
        writtenCount,
        skippedOutsideCount: 0,
        includeSubcollections: true,
        filePath: input.filePath
      }
    }
  } catch (error) {
    return toImportError(error)
  }
}
