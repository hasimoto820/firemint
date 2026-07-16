import { createWriteStream } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { finished } from 'stream/promises'
import { once } from 'events'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { ZipArchive } from 'archiver'
import {
  getCollectionRef,
  getDocumentRef,
  joinCollectionPath,
  joinDocumentPath
} from '@shared/firestore/paths'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  ExportDocument,
  ExportProjectInput,
  ExportProjectManifest,
  ExportProjectProgress,
  ExportProjectResult
} from '@features/data_transfer/shared/types'
import { sanitizeFileName } from './format'

const PAGE_SIZE = 500

type ProgressReporter = (progress: ExportProjectProgress) => void

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toExportError(error: unknown, canceled = false): ExportProjectResult {
  logError('data_transfer', 'exportProject failed', error)

  if (canceled) {
    return { ok: false, error: 'エクスポートをキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Export project failed'
  }
}

function toExportDocument(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>
): ExportDocument {
  return {
    id,
    path: joinDocumentPath(collectionPath, id),
    data: serializeFirestoreValue(data) as Record<string, unknown>
  }
}

function readingPercent(completedRootCount: number, totalRootCount: number): number {
  if (totalRootCount <= 0) {
    return 0
  }

  return Math.min(90, Math.round((completedRootCount / totalRootCount) * 90))
}

async function writeChunk(
  stream: NodeJS.WritableStream,
  chunk: string
): Promise<void> {
  if (!stream.write(chunk)) {
    await once(stream, 'drain')
  }
}

async function* iterateCollectionPage(
  projectId: string,
  collectionPath: string
): AsyncGenerator<ExportDocument> {
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
      yield toExportDocument(collectionPath, doc.id, doc.data() as Record<string, unknown>)
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }
}

async function* iterateExportDocuments(
  projectId: string,
  collectionPath: string,
  includeSubcollections: boolean
): AsyncGenerator<ExportDocument> {
  for await (const document of iterateCollectionPage(projectId, collectionPath)) {
    yield document

    if (!includeSubcollections) {
      continue
    }

    const subcollections = await getDocumentRef(document.path, projectId).listCollections()
    for (const subcollection of subcollections) {
      const nestedPath = joinCollectionPath(document.path, subcollection.id)
      yield* iterateExportDocuments(projectId, nestedPath, true)
    }
  }
}

async function streamDocumentsJson(
  projectId: string,
  rootCollectionIds: string[],
  includeSubcollections: boolean,
  documentsPath: string,
  onProgress: ProgressReporter
): Promise<number> {
  const stream = createWriteStream(documentsPath, { encoding: 'utf8' })
  let documentCount = 0
  let first = true
  const totalRootCount = rootCollectionIds.length

  await writeChunk(stream, '[\n')

  for (let rootIndex = 0; rootIndex < rootCollectionIds.length; rootIndex += 1) {
    const rootId = rootCollectionIds[rootIndex]
    onProgress({
      phase: 'reading',
      documentCount,
      currentCollectionPath: rootId,
      completedRootCount: rootIndex,
      totalRootCount,
      percent: readingPercent(rootIndex, totalRootCount)
    })

    for await (const document of iterateExportDocuments(
      projectId,
      rootId,
      includeSubcollections
    )) {
      const prefix = first ? '' : ',\n'
      first = false
      await writeChunk(stream, `${prefix}${JSON.stringify(document)}`)
      documentCount += 1

      if (documentCount % 50 === 0) {
        onProgress({
          phase: 'reading',
          documentCount,
          currentCollectionPath: document.path.includes('/')
            ? document.path.slice(0, document.path.lastIndexOf('/'))
            : rootId,
          completedRootCount: rootIndex,
          totalRootCount,
          percent: readingPercent(rootIndex, totalRootCount)
        })
      }
    }

    onProgress({
      phase: 'reading',
      documentCount,
      currentCollectionPath: rootId,
      completedRootCount: rootIndex + 1,
      totalRootCount,
      percent: readingPercent(rootIndex + 1, totalRootCount)
    })
  }

  await writeChunk(stream, '\n]\n')
  stream.end()
  await finished(stream)

  return documentCount
}

async function writeZipArchive(
  zipPath: string,
  manifestPath: string,
  documentsPath: string
): Promise<void> {
  const output = createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 6 } })

  archive.on('error', (error) => {
    throw error
  })

  archive.pipe(output)
  archive.file(manifestPath, { name: 'manifest.json' })
  archive.file(documentsPath, { name: 'documents.json' })
  await archive.finalize()
  await finished(output)
}

function buildDefaultZipName(projectId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `export-project-${sanitizeFileName(projectId)}-${stamp}.zip`
}

async function chooseZipPath(
  window: BrowserWindow | null,
  projectId: string
): Promise<string | null> {
  const options = {
    title: 'プロジェクトをエクスポート',
    defaultPath: buildDefaultZipName(projectId),
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  }

  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
}

export async function exportProject(
  input: ExportProjectInput,
  window: BrowserWindow | null,
  onProgress: ProgressReporter
): Promise<ExportProjectResult> {
  let tempDir: string | null = null

  try {
    ensureConnected(input.projectId)

    const rootCollectionIds = input.rootCollectionIds
      .map((id) => id.trim())
      .filter(Boolean)

    if (rootCollectionIds.length === 0) {
      throw new Error('エクスポートするルートコレクションを選んでください')
    }

    const filePath = await chooseZipPath(window, input.projectId)
    if (!filePath) {
      return toExportError(new Error('canceled'), true)
    }

    logInfo(
      'data_transfer',
      `exportProject projectId=${input.projectId} roots=${rootCollectionIds.length} includeSubcollections=${input.includeSubcollections}`
    )

    tempDir = await mkdtemp(join(tmpdir(), 'firemint-export-'))
    const documentsPath = join(tempDir, 'documents.json')
    const manifestPath = join(tempDir, 'manifest.json')

    const documentCount = await streamDocumentsJson(
      input.projectId,
      rootCollectionIds,
      input.includeSubcollections,
      documentsPath,
      onProgress
    )

    const manifest: ExportProjectManifest = {
      version: 1,
      kind: 'firemint-project-export',
      projectId: input.projectId,
      createdAt: new Date().toISOString(),
      includeSubcollections: input.includeSubcollections,
      rootCollectionIds,
      documentCount
    }

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    onProgress({
      phase: 'zipping',
      documentCount,
      currentCollectionPath: null,
      completedRootCount: rootCollectionIds.length,
      totalRootCount: rootCollectionIds.length,
      percent: 95
    })

    await writeZipArchive(filePath, manifestPath, documentsPath)

    onProgress({
      phase: 'done',
      documentCount,
      currentCollectionPath: null,
      completedRootCount: rootCollectionIds.length,
      totalRootCount: rootCollectionIds.length,
      percent: 100
    })

    return {
      ok: true,
      data: {
        filePath,
        documentCount,
        rootCollectionIds,
        includeSubcollections: input.includeSubcollections
      }
    }
  } catch (error) {
    return toExportError(error)
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
