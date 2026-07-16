import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import extractZip from 'extract-zip'
import { ensureWritable } from '@features/workspace/main/guard'
import { getDocumentRef } from '@shared/firestore/paths'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  ExportDocument,
  ExportProjectManifest,
  ImportProjectInput,
  ImportProjectProgress,
  ImportProjectResult,
  ImportProjectValidation,
  ImportProjectValidationResult
} from '@features/data_transfer/shared/types'

type ProgressReporter = (progress: ImportProjectProgress) => void

type LoadedProjectArchive = {
  manifest: ExportProjectManifest
  documents: ExportDocument[]
}

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toValidationError(error: unknown, canceled = false): ImportProjectValidationResult {
  logError('data_transfer', 'validateProjectImport failed', error)

  if (canceled) {
    return { ok: false, error: '検証をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Validate project import failed'
  }
}

function toImportError(error: unknown, canceled = false): ImportProjectResult {
  logError('data_transfer', 'importProject failed', error)

  if (canceled) {
    return { ok: false, error: 'インポートをキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Import project failed'
  }
}

function isDocumentPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean)
  return segments.length > 0 && segments.length % 2 === 0
}

function parseManifest(raw: string): ExportProjectManifest {
  const parsed: unknown = JSON.parse(raw)

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('manifest.json の形式が不正です')
  }

  const record = parsed as Record<string, unknown>

  if (record.version !== 1 || record.kind !== 'firemint-project-export') {
    throw new Error('FireMint のプロジェクトエクスポート zip ではありません')
  }

  if (typeof record.projectId !== 'string' || !record.projectId.trim()) {
    throw new Error('manifest.json に projectId がありません')
  }

  if (!Array.isArray(record.rootCollectionIds)) {
    throw new Error('manifest.json に rootCollectionIds がありません')
  }

  const rootCollectionIds = record.rootCollectionIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  )

  return {
    version: 1,
    kind: 'firemint-project-export',
    projectId: record.projectId.trim(),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    includeSubcollections: Boolean(record.includeSubcollections),
    rootCollectionIds,
    documentCount: typeof record.documentCount === 'number' ? record.documentCount : 0
  }
}

function parseDocuments(raw: string): ExportDocument[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('documents.json は配列である必要があります')
  }

  return parsed.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`documents.json の ${index + 1} 件目の形式が不正です`)
    }

    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const path = typeof record.path === 'string' ? record.path.trim() : ''

    if (!id) {
      throw new Error(`documents.json の ${index + 1} 件目に id がありません`)
    }

    if (!path || !isDocumentPath(path)) {
      throw new Error(`documents.json の ${index + 1} 件目の path が不正です`)
    }

    if (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data)) {
      throw new Error(`documents.json の ${index + 1} 件目に data がありません`)
    }

    return {
      id,
      path,
      data: record.data as Record<string, unknown>
    }
  })
}

async function loadProjectArchive(
  zipPath: string,
  onProgress?: ProgressReporter
): Promise<{ archive: LoadedProjectArchive; tempDir: string }> {
  onProgress?.({
    phase: 'extracting',
    processedCount: 0,
    totalCount: 0,
    percent: 5,
    detail: 'ZIP を展開中…'
  })

  const tempDir = await mkdtemp(join(tmpdir(), 'firemint-import-'))

  try {
    await extractZip(zipPath, { dir: tempDir })

    const manifestRaw = await readFile(join(tempDir, 'manifest.json'), 'utf8')
    const documentsRaw = await readFile(join(tempDir, 'documents.json'), 'utf8')
    const manifest = parseManifest(manifestRaw)
    const documents = parseDocuments(documentsRaw)

    return {
      archive: { manifest, documents },
      tempDir
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function findCollisions(
  projectId: string,
  documents: ExportDocument[],
  onProgress?: ProgressReporter
): Promise<{ hasCollisions: boolean; collisionSamples: string[]; checkedCount: number }> {
  const collisionSamples: string[] = []
  let checkedCount = 0
  const totalCount = documents.length

  for (const document of documents) {
    checkedCount += 1

    if (checkedCount === 1 || checkedCount % 50 === 0 || checkedCount === totalCount) {
      onProgress?.({
        phase: 'validating',
        processedCount: checkedCount,
        totalCount,
        percent: totalCount === 0 ? 90 : Math.min(90, Math.round((checkedCount / totalCount) * 90)),
        detail: document.path
      })
    }

    const snapshot = await getDocumentRef(document.path, projectId).get()
    if (snapshot.exists) {
      if (collisionSamples.length < 5) {
        collisionSamples.push(document.path)
      }

      // 検証はサンプルが揃ったら早期終了（件数全走査は巨大時に重い）
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

async function writeDocuments(
  projectId: string,
  documents: ExportDocument[],
  onProgress?: ProgressReporter
): Promise<number> {
  const db = getFirestore(projectId)
  let writtenCount = 0
  const totalCount = documents.length

  for (let offset = 0; offset < documents.length; offset += FIRESTORE_BATCH_LIMIT) {
    const chunk = documents.slice(offset, offset + FIRESTORE_BATCH_LIMIT)
    const batch = db.batch()

    for (const document of chunk) {
      batch.create(
        getDocumentRef(document.path, projectId),
        deserializeDocumentData(document.data)
      )
      writtenCount += 1
    }

    await batch.commit()

    onProgress?.({
      phase: 'writing',
      processedCount: writtenCount,
      totalCount,
      percent:
        totalCount === 0 ? 100 : Math.min(99, Math.round((writtenCount / totalCount) * 100)),
      detail: chunk[chunk.length - 1]?.path ?? null
    })
  }

  return writtenCount
}

function buildValidation(
  filePath: string,
  projectId: string,
  archive: LoadedProjectArchive,
  collisions: { hasCollisions: boolean; collisionSamples: string[]; checkedCount: number }
): ImportProjectValidation {
  return {
    filePath,
    documentCount: archive.documents.length,
    rootCollectionIds: archive.manifest.rootCollectionIds,
    includeSubcollections: archive.manifest.includeSubcollections,
    sourceProjectId: archive.manifest.projectId,
    projectIdMismatch: archive.manifest.projectId !== projectId,
    hasCollisions: collisions.hasCollisions,
    collisionSamples: collisions.collisionSamples,
    checkedCount: collisions.checkedCount
  }
}

export async function selectProjectImportZip(
  window: BrowserWindow | null
): Promise<{ canceled: boolean; filePath: string | null }> {
  const options = {
    title: 'インポートするプロジェクト ZIP を選択',
    properties: ['openFile' as const],
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  }

  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null }
  }

  return { canceled: false, filePath: result.filePaths[0] }
}

export async function validateProjectImport(
  input: ImportProjectInput,
  onProgress?: ProgressReporter
): Promise<ImportProjectValidationResult> {
  let tempDir: string | null = null

  try {
    ensureConnected(input.projectId)

    const filePath = input.filePath.trim()
    if (!filePath) {
      throw new Error('ZIP ファイルを指定してください')
    }

    logInfo(
      'data_transfer',
      `validateProjectImport projectId=${input.projectId} file=${filePath}`
    )

    const loaded = await loadProjectArchive(filePath, onProgress)
    tempDir = loaded.tempDir

    if (loaded.archive.documents.length === 0) {
      throw new Error('documents.json にドキュメントがありません')
    }

    const collisions = await findCollisions(
      input.projectId,
      loaded.archive.documents,
      onProgress
    )

    onProgress?.({
      phase: 'done',
      processedCount: collisions.checkedCount,
      totalCount: loaded.archive.documents.length,
      percent: 100,
      detail: collisions.hasCollisions ? '衝突あり' : '検証 OK'
    })

    return {
      ok: true,
      data: buildValidation(filePath, input.projectId, loaded.archive, collisions)
    }
  } catch (error) {
    return toValidationError(error)
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

export async function importProject(
  input: ImportProjectInput,
  onProgress?: ProgressReporter
): Promise<ImportProjectResult> {
  let tempDir: string | null = null

  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const filePath = input.filePath.trim()
    if (!filePath) {
      throw new Error('ZIP ファイルを指定してください')
    }

    logInfo('data_transfer', `importProject projectId=${input.projectId} file=${filePath}`)

    const loaded = await loadProjectArchive(filePath, onProgress)
    tempDir = loaded.tempDir
    const { manifest, documents } = loaded.archive

    if (documents.length === 0) {
      throw new Error('documents.json にドキュメントがありません')
    }

    if (manifest.projectId !== input.projectId && !input.acceptProjectIdMismatch) {
      throw new Error(
        `ZIP の projectId（${manifest.projectId}）と宛先（${input.projectId}）が一致しません。確認のうえ再実行してください`
      )
    }

    const collisions = await findCollisions(input.projectId, documents, onProgress)
    if (collisions.hasCollisions) {
      throw new Error(
        `既存ドキュメントと衝突したため中止しました: ${collisions.collisionSamples.join(', ')}`
      )
    }

    const writtenCount = await writeDocuments(input.projectId, documents, onProgress)

    onProgress?.({
      phase: 'done',
      processedCount: writtenCount,
      totalCount: documents.length,
      percent: 100,
      detail: '完了'
    })

    return {
      ok: true,
      data: {
        filePath,
        writtenCount,
        rootCollectionIds: manifest.rootCollectionIds,
        includeSubcollections: manifest.includeSubcollections,
        sourceProjectId: manifest.projectId
      }
    }
  } catch (error) {
    return toImportError(error)
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
