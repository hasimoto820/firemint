import { createWriteStream, type WriteStream } from 'fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { finished } from 'stream/promises'
import type { BrowserWindow } from 'electron'
import { app as electronApp, dialog } from 'electron'
import { ZipArchive } from 'archiver'
import type { QueryDocumentSnapshot } from '@google-cloud/firestore'
import { getWorkspaceEntry } from '@features/workspace/main/service'
import { getTypedFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { sanitizeFileName } from '../format'
import type {
  OfficialExportInput,
  OfficialExportProgress,
  OfficialExportResult,
  TransferFormat
} from '../../shared/official'
import type { TypedDocument } from '../../shared/typed_value'
import { fromSdkData } from '../typed/convert'
import { encodeJsonlDocument, encodeJsonlHeader, type JsonlScope } from '../typed/jsonl'
import { encodeTypedEntity } from './entity_typed'
import { LeveldbLogWriter } from './leveldb_log'

type ProgressReporter = (progress: OfficialExportProgress) => void

const PAGE_SIZE = 500
/** これだけ溜まったらファイルへ書き出す */
const FLUSH_BYTES = 1024 * 1024

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'エクスポートに失敗しました'
}

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

/** ファイルに書くプロジェクト ID（Emulator は Emulator 上のプロジェクト ID） */
function exportProjectId(projectId: string): string {
  const entry = getWorkspaceEntry(projectId)
  if (entry?.authType === 'emulator' && entry.emulatorProjectId) {
    return entry.emulatorProjectId
  }

  return projectId.replace(/_emulator$/, '')
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
    input.kind === 'group' ? (input.collectionId?.trim() ?? '') : (parts[parts.length - 1] ?? '')
  const safe = sanitizeFileName(raw) || 'kind'
  return `kind_${safe}`
}

function extensionOf(format: TransferFormat): string {
  return format === 'jsonl' ? 'jsonl' : 'zip'
}

function defaultFileName(input: OfficialExportInput): string {
  const stamp = exportStamp()
  const ext = extensionOf(input.format ?? 'official')
  if (input.kind === 'group') {
    return `export-group-${sanitizeFileName(input.collectionId ?? 'kind')}-${stamp}.${ext}`
  }
  if (input.kind === 'collection') {
    const parts = (input.collectionPath ?? 'collection').split('/').filter(Boolean)
    return `export-collection-${sanitizeFileName(parts[parts.length - 1] ?? 'collection')}-${stamp}.${ext}`
  }
  return `export-project-${sanitizeFileName(exportProjectId(input.projectId))}-${stamp}.${ext}`
}

function defaultExportDirectory(): string {
  return join(electronApp.getPath('documents'), 'FireMint')
}

/** ファイル名を確かめ、拡張子が無ければ付ける。使えない文字がある時は Error */
function normalizeFileName(fileName: string, format: TransferFormat): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    throw new Error('ファイル名を入れてください')
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    throw new Error('ファイル名に使えない文字があります（\\ / : * ? " < > |）')
  }
  const ext = `.${extensionOf(format)}`
  return trimmed.toLowerCase().endsWith(ext) ? trimmed : `${trimmed}${ext}`
}

/**
 * 保存するファイル。
 * フォルダは選んだもの（無ければ Documents/FireMint）。ファイル名は入力されたもの（無ければ自動）。
 */
export function defaultExportPath(input: OfficialExportInput): string {
  const fileName = input.fileName
    ? normalizeFileName(input.fileName, input.format ?? 'official')
    : defaultFileName(input)
  return join(input.directory ?? defaultExportDirectory(), fileName)
}

/**
 * 「名前を付けて保存」で、場所とファイル名を一緒に選ぶ。
 * 最初は、前に選んだフォルダ（無ければ Documents/FireMint）と自動の名前。
 * 既にあるファイルを選んだ時は、OS の上書き確認が出る。
 */
export async function chooseExportPath(
  window: BrowserWindow | null,
  input: OfficialExportInput
): Promise<string | null> {
  const format = input.format ?? 'official'
  const ext = extensionOf(format)
  const options = {
    title: format === 'jsonl' ? 'JSON を保存' : 'ZIP を保存',
    defaultPath: defaultExportPath(input),
    // 押してもまだ保存しない（保存はエクスポートの時）ので「選択」
    buttonLabel: '選択',
    filters: [{ name: format === 'jsonl' ? 'JSON Lines' : 'ZIP', extensions: [ext] }]
  }

  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath.toLowerCase().endsWith(`.${ext}`)
    ? result.filePath
    : `${result.filePath}.${ext}`
}

// ── 読む（1 ページずつ） ──

type TypedDb = ReturnType<typeof getTypedFirestore>

function toTypedDocument(doc: QueryDocumentSnapshot): TypedDocument {
  return { path: doc.ref.path, fields: fromSdkData(doc.data()) }
}

async function* iterateCollection(
  db: TypedDb,
  collectionPath: string,
  includeSubcollections: boolean,
  signal?: AbortSignal
): AsyncGenerator<TypedDocument> {
  let last: QueryDocumentSnapshot | undefined

  while (true) {
    throwIfCanceled(signal)
    let query = db.collection(collectionPath).orderBy('__name__').limit(PAGE_SIZE)
    if (last) {
      query = query.startAfter(last)
    }

    const snapshot = await query.get()
    for (const doc of snapshot.docs) {
      yield toTypedDocument(doc)

      if (includeSubcollections) {
        for (const subcollection of await doc.ref.listCollections()) {
          yield* iterateCollection(db, subcollection.path, true, signal)
        }
      }
    }

    if (snapshot.size < PAGE_SIZE) {
      break
    }
    last = snapshot.docs[snapshot.docs.length - 1]
  }
}

async function* iterateGroup(
  db: TypedDb,
  collectionId: string,
  signal?: AbortSignal
): AsyncGenerator<TypedDocument> {
  let last: QueryDocumentSnapshot | undefined

  while (true) {
    throwIfCanceled(signal)
    let query = db.collectionGroup(collectionId).orderBy('__name__').limit(PAGE_SIZE)
    if (last) {
      query = query.startAfter(last)
    }

    const snapshot = await query.get()
    for (const doc of snapshot.docs) {
      yield toTypedDocument(doc)
    }

    if (snapshot.size < PAGE_SIZE) {
      break
    }
    last = snapshot.docs[snapshot.docs.length - 1]
  }
}

async function* iterateScope(
  input: OfficialExportInput,
  signal?: AbortSignal
): AsyncGenerator<TypedDocument> {
  const db = getTypedFirestore(input.projectId)

  if (input.kind === 'group') {
    const collectionId = input.collectionId?.trim()
    if (!collectionId) {
      throw new Error('グループ名（コレクション ID）を指定してください')
    }
    yield* iterateGroup(db, collectionId, signal)
    return
  }

  if (input.kind === 'collection') {
    const collectionPath = input.collectionPath?.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }
    yield* iterateCollection(db, collectionPath, input.includeSubcollections ?? false, signal)
    return
  }

  const roots = input.rootCollectionIds ?? []
  if (roots.length === 0) {
    throw new Error('エクスポートするルートコレクションを選んでください')
  }
  for (const rootId of roots) {
    yield* iterateCollection(db, rootId, input.includeSubcollections ?? true, signal)
  }
}

function jsonlScope(input: OfficialExportInput): JsonlScope {
  if (input.kind === 'group') {
    return { kind: 'group', collectionId: input.collectionId?.trim() ?? '' }
  }
  if (input.kind === 'collection') {
    return {
      kind: 'collection',
      path: input.collectionPath?.trim() ?? '',
      includeSubcollections: input.includeSubcollections ?? false
    }
  }
  return { kind: 'project', roots: input.rootCollectionIds ?? [] }
}

// ── 書く ──

/** ファイルへ順に書く。溜まった分を書き出す時に、書き込みが追いつくのを待つ */
class FileSink {
  private readonly stream: WriteStream
  private pending: Buffer[] = []
  private pendingBytes = 0

  constructor(filePath: string) {
    this.stream = createWriteStream(filePath)
  }

  push(chunk: Buffer): void {
    this.pending.push(chunk)
    this.pendingBytes += chunk.length
  }

  async flushIfLarge(): Promise<void> {
    if (this.pendingBytes >= FLUSH_BYTES) {
      await this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) {
      return
    }
    const data = Buffer.concat(this.pending)
    this.pending = []
    this.pendingBytes = 0
    if (!this.stream.write(data)) {
      await new Promise<void>((resolve, reject) => {
        this.stream.once('drain', resolve)
        this.stream.once('error', reject)
      })
    }
  }

  async close(): Promise<void> {
    await this.flush()
    this.stream.end()
    await finished(this.stream)
  }

  destroy(): void {
    this.stream.destroy()
  }
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  const output = createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const failed = new Promise<never>((_, reject) => {
    archive.on('error', reject)
    output.on('error', reject)
  })
  archive.pipe(output)
  archive.directory(sourceDir, false)
  await Promise.race([archive.finalize().then(() => finished(output)), failed])
}

/**
 * エクスポート。1 ページ読むたびにファイルへ書き足す。全体をメモリに載せない。
 * 書きかけは {保存先}.part に書き、終わったら保存先に置き換える。
 * 途中で止まった・中止した・中身が無かった時は、書きかけのファイルを消す。
 */
export async function exportOfficialDump(
  input: OfficialExportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialExportResult> {
  const format = input.format ?? 'official'
  let partPath: string | null = null
  let tempDir: string | null = null
  let sink: FileSink | null = null

  try {
    const filePath = input.filePath ?? defaultExportPath(input)
    partPath = `${filePath}.part`
    ensureConnected(input.projectId)
    throwIfCanceled(signal)
    await mkdir(dirname(filePath), { recursive: true })

    onProgress?.({
      phase: 'reading',
      processedCount: 0,
      totalCount: 0,
      percent: 5,
      detail: 'ドキュメントを読み込み中…'
    })

    const projectId = exportProjectId(input.projectId)
    const stamp = exportStamp()
    let dumpRoot: string | null = null
    let entityWriter: LeveldbLogWriter | null = null

    if (format === 'jsonl') {
      sink = new FileSink(partPath)
      sink.push(
        Buffer.from(
          `${encodeJsonlHeader({ projectId, scope: jsonlScope(input), createdAt: new Date().toISOString() })}\n`,
          'utf8'
        )
      )
    } else {
      tempDir = await mkdtemp(join(tmpdir(), 'firemint-export-'))
      dumpRoot = join(tempDir, stamp)
      const kindFolder = kindFolderName(input)
      const kindDir = join(dumpRoot, 'all_namespaces', kindFolder)
      await mkdir(kindDir, { recursive: true })
      await writeFile(join(dumpRoot, `${stamp}.overall_export_metadata`), Buffer.alloc(0))
      await writeFile(
        join(kindDir, `all_namespaces_${kindFolder}.export_metadata`),
        Buffer.alloc(0)
      )
      const activeSink = new FileSink(join(kindDir, 'output-0'))
      sink = activeSink
      entityWriter = new LeveldbLogWriter((chunk) => activeSink.push(chunk))
    }

    const app = `s~${projectId}`
    let documentCount = 0

    for await (const document of iterateScope(input, signal)) {
      if (entityWriter) {
        entityWriter.write(encodeTypedEntity(document, app))
      } else {
        sink.push(Buffer.from(`${encodeJsonlDocument(document)}\n`, 'utf8'))
      }
      await sink.flushIfLarge()

      documentCount += 1
      if (documentCount === 1 || documentCount % 200 === 0) {
        onProgress?.({
          phase: 'reading',
          processedCount: documentCount,
          totalCount: 0,
          percent: Math.min(80, 5 + Math.floor(documentCount / 100)),
          detail: document.path
        })
      }
    }

    await sink.close()
    sink = null

    if (documentCount === 0) {
      throw new Error('エクスポートするドキュメントがありません')
    }

    onProgress?.({
      phase: 'writing',
      processedCount: documentCount,
      totalCount: documentCount,
      percent: 90,
      detail: basename(filePath)
    })

    if (dumpRoot) {
      throwIfCanceled(signal)
      await zipDirectory(dumpRoot, partPath)
    }
    await rename(partPath, filePath)

    logInfo(
      'data_transfer:export',
      `export format=${format} kind=${input.kind} projectId=${input.projectId} documents=${documentCount} file=${filePath}`
    )

    onProgress?.({
      phase: 'done',
      processedCount: documentCount,
      totalCount: documentCount,
      percent: 100,
      detail: basename(filePath)
    })

    return { ok: true, data: { filePath, documentCount, kind: input.kind, format } }
  } catch (error) {
    sink?.destroy()
    if (partPath) {
      await rm(partPath, { force: true }).catch(() => undefined)
    }
    const canceled = isCanceledError(error)
    logError('data_transfer:export', 'export failed', error)
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
