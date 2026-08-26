import { createWriteStream } from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { finished } from 'stream/promises'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { ZipArchive } from 'archiver'
import { getWorkspaceEntry } from '@features/workspace/main/service'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { iterateExportDocuments } from '../project_export_service'
import { sanitizeFileName } from '../format'
import type { ExportDocument } from '../../shared/types'
import type {
  OfficialExportInput,
  OfficialExportProgress,
  OfficialExportResult
} from '../../shared/official'
import { documentToEntity } from './document_to_entity'
import { writeLeveldbRecords } from './leveldb_log'

const PAGE_SIZE = 500

type ProgressReporter = (progress: OfficialExportProgress) => void

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '公式ダンプのエクスポートに失敗しました'
}

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function dumpAppId(projectId: string): string {
  const entry = getWorkspaceEntry(projectId)
  if (entry?.authType === 'emulator' && entry.emulatorProjectId) {
    return `s~${entry.emulatorProjectId}`
  }

  return `s~${projectId.replace(/_emulator$/, '')}`
}

function exportStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '_').replace('Z', '')
}

function kindFolderName(input: OfficialExportInput): string {
  if (input.kind === 'project') {
    return 'all_kinds'
  }

  const parts = (input.collectionPath ?? '').split('/').filter(Boolean)
  const raw =
    input.kind === 'group' ? input.collectionId?.trim() ?? '' : parts[parts.length - 1] ?? ''
  const safe = sanitizeFileName(raw) || 'kind'
  return `kind_${safe}`
}

function defaultZipName(input: OfficialExportInput): string {
  const stamp = exportStamp()
  if (input.kind === 'group') {
    return `export-group-${sanitizeFileName(input.collectionId ?? 'kind')}-${stamp}.zip`
  }
  if (input.kind === 'collection') {
    return `export-collection-${sanitizeFileName(input.collectionPath ?? 'collection')}-${stamp}.zip`
  }
  return `export-project-${sanitizeFileName(input.projectId)}-${stamp}.zip`
}

export async function chooseOfficialExportZipPath(
  window: BrowserWindow | null,
  input: OfficialExportInput
): Promise<string | null> {
  const options = {
    title: '公式ダンプ ZIP を保存',
    defaultPath: defaultZipName(input),
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  }

  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath.toLowerCase().endsWith('.zip')
    ? result.filePath
    : `${result.filePath}.zip`
}

async function* iterateGroupDocuments(
  projectId: string,
  collectionId: string,
  signal?: AbortSignal
): AsyncGenerator<ExportDocument> {
  const db = getFirestore(projectId)
  let lastDocument: QueryDocumentSnapshot | undefined

  while (true) {
    throwIfCanceled(signal)
    let query = db.collectionGroup(collectionId).orderBy('__name__').limit(PAGE_SIZE)
    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      yield {
        id: doc.id,
        path: doc.ref.path,
        data: serializeFirestoreValue(doc.data() as Record<string, unknown>) as Record<
          string,
          unknown
        >
      }
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }
}

async function collectDocuments(
  input: OfficialExportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<ExportDocument[]> {
  const documents: ExportDocument[] = []

  const report = (detail: string): void => {
    onProgress?.({
      phase: 'reading',
      processedCount: documents.length,
      totalCount: 0,
      percent: Math.min(80, 5 + documents.length),
      detail
    })
  }

  if (input.kind === 'group') {
    const collectionId = input.collectionId?.trim()
    if (!collectionId) {
      throw new Error('グループ名（コレクション ID）を指定してください')
    }
    for await (const document of iterateGroupDocuments(input.projectId, collectionId, signal)) {
      documents.push(document)
      if (documents.length === 1 || documents.length % 50 === 0) {
        report(document.path)
      }
    }
    return documents
  }

  if (input.kind === 'collection') {
    const collectionPath = input.collectionPath?.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }
    for await (const document of iterateExportDocuments(
      input.projectId,
      collectionPath,
      input.includeSubcollections ?? false,
      signal
    )) {
      documents.push(document)
      if (documents.length === 1 || documents.length % 50 === 0) {
        report(document.path)
      }
    }
    return documents
  }

  const roots = input.rootCollectionIds ?? []
  if (roots.length === 0) {
    throw new Error('エクスポートするルートコレクションを選んでください')
  }

  for (const rootId of roots) {
    throwIfCanceled(signal)
    for await (const document of iterateExportDocuments(
      input.projectId,
      rootId,
      input.includeSubcollections ?? true,
      signal
    )) {
      documents.push(document)
      if (documents.length === 1 || documents.length % 50 === 0) {
        report(document.path)
      }
    }
  }

  return documents
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  const output = createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 6 } })
  archive.on('error', (error) => {
    throw error
  })
  archive.pipe(output)
  archive.directory(sourceDir, false)
  await archive.finalize()
  await finished(output)
}

export async function exportOfficialDump(
  input: OfficialExportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialExportResult> {
  let tempDir: string | null = null

  try {
    ensureConnected(input.projectId)
    throwIfCanceled(signal)

    if (!input.filePath) {
      return { ok: false, error: '保存先がありません', canceled: true }
    }

    onProgress?.({
      phase: 'reading',
      processedCount: 0,
      totalCount: 0,
      percent: 5,
      detail: 'ドキュメントを読み込み中…'
    })

    const documents = await collectDocuments(input, onProgress, signal)
    if (documents.length === 0) {
      return { ok: false, error: 'エクスポートするドキュメントがありません' }
    }

    const app = dumpAppId(input.projectId)
    const records = documents.map((document) => documentToEntity(document, app))
    const output = writeLeveldbRecords(records)
    const stamp = exportStamp()
    const kindFolder = kindFolderName(input)

    tempDir = await mkdtemp(join(tmpdir(), 'firemint-official-export-'))
    const dumpRoot = join(tempDir, stamp)
    const kindDir = join(dumpRoot, 'all_namespaces', kindFolder)
    await mkdir(kindDir, { recursive: true })
    await writeFile(join(dumpRoot, `${stamp}.overall_export_metadata`), Buffer.alloc(0))
    await writeFile(
      join(kindDir, `all_namespaces_${kindFolder}.export_metadata`),
      Buffer.alloc(0)
    )
    await writeFile(join(kindDir, 'output-0'), output)

    onProgress?.({
      phase: 'writing',
      processedCount: documents.length,
      totalCount: documents.length,
      percent: 90,
      detail: basename(input.filePath)
    })

    await zipDirectory(dumpRoot, input.filePath)

    logInfo(
      'data_transfer:official',
      `exportOfficialDump kind=${input.kind} projectId=${input.projectId} documents=${documents.length} file=${input.filePath}`
    )

    onProgress?.({
      phase: 'done',
      processedCount: documents.length,
      totalCount: documents.length,
      percent: 100,
      detail: basename(input.filePath)
    })

    return {
      ok: true,
      data: {
        filePath: input.filePath,
        documentCount: documents.length,
        kind: input.kind
      }
    }
  } catch (error) {
    const canceled = isCanceledError(error)
    logError('data_transfer:official', 'exportOfficialDump failed', error)
    return {
      ok: false,
      error: canceled ? 'エクスポートをキャンセルしました' : errorMessage(error),
      canceled
    }
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
