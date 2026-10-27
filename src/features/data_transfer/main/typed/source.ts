import { createReadStream } from 'fs'
import { mkdtemp, open, readFile, readdir, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join, sep } from 'path'
import { createInterface } from 'readline'
import extractZip from 'extract-zip'
import type { TransferFormat, TransferScopeKind } from '../../shared/official'
import type { TypedDocument } from '../../shared/typed_value'
import { decodeTypedEntity } from '../official/entity_typed'
import { readLeveldbRecords } from '../official/leveldb_log'
import { listOutputFiles } from '../official/list_output_files'
import { parseJsonlDocument, parseJsonlHeader, scopeKindOf } from './jsonl'

/** ファイルの 1 件。読めない時は bad（書けなかった件数に数える） */
export type SourceEntry =
  { kind: 'document'; document: TypedDocument } | { kind: 'bad'; label: string }

/**
 * インポートするファイル。先頭から 1 件ずつ読む。全体をメモリに載せない。
 * forEach は何度でも呼べる（1 回目で数え、2 回目で書く）。
 */
export type ImportSource = {
  format: TransferFormat
  sourceProjectId: string | null
  scopeKind: TransferScopeKind | null
  forEach: (callback: (entry: SourceEntry) => Promise<void> | void) => Promise<void>
  close: () => Promise<void>
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

async function readHead(filePath: string, size: number): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, size, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function readFirstLine(filePath: string): Promise<string | null> {
  const lines = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      // 先頭の BOM は外す
      return line.charCodeAt(0) === 0xfeff ? line.slice(1) : line
    }
    return null
  } finally {
    lines.close()
  }
}

// ── 公式ダンプ ──

async function readExportMetadata(
  dir: string
): Promise<{ projectId: string | null; path: string | null }> {
  try {
    const raw = await readFile(join(dir, 'firebase-export-metadata.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      projectId?: unknown
      firestore?: { projectId?: unknown; path?: unknown }
    }
    const projectId =
      typeof parsed.projectId === 'string' && parsed.projectId.trim()
        ? parsed.projectId.trim()
        : typeof parsed.firestore?.projectId === 'string' && parsed.firestore.projectId.trim()
          ? parsed.firestore.projectId.trim()
          : null
    const path =
      typeof parsed.firestore?.path === 'string' && parsed.firestore.path.trim()
        ? parsed.firestore.path.trim()
        : null
    return { projectId, path }
  } catch {
    // コンソール / gcloud のフォルダ。メタデータ JSON は無い。
    return { projectId: null, path: null }
  }
}

async function forEachDumpEntry(
  outputFiles: string[],
  callback: (entry: SourceEntry, projectId: string | null) => Promise<void> | void
): Promise<void> {
  for (const filePath of outputFiles) {
    const records = readLeveldbRecords(await readFile(filePath))
    for (let index = 0; index < records.length; index += 1) {
      const label = `${basename(filePath)} #${index + 1}`
      let decoded: ReturnType<typeof decodeTypedEntity> = null
      try {
        decoded = decodeTypedEntity(records[index])
      } catch {
        decoded = null
      }
      if (decoded) {
        await callback({ kind: 'document', document: decoded.document }, decoded.projectId)
      } else {
        await callback({ kind: 'bad', label }, null)
      }
    }
  }
}

class StopIteration extends Error {}

async function openOfficialDump(inputPath: string, isZip: boolean): Promise<ImportSource> {
  let tempDir: string | null = null

  try {
    let baseDir = inputPath
    if (isZip) {
      tempDir = await mkdtemp(join(tmpdir(), 'firemint-import-'))
      await extractZip(inputPath, { dir: tempDir })
      baseDir = tempDir
    }

    const info = await stat(baseDir)
    const metadata = info.isDirectory()
      ? await readExportMetadata(baseDir)
      : { projectId: null, path: null }
    const dumpRoot = metadata.path ? join(baseDir, metadata.path) : baseDir
    const outputFiles = await listOutputFiles(dumpRoot)
    if (outputFiles.length === 0) {
      throw new Error('ダンプではありません（output-* がありません）')
    }

    let sourceProjectId = metadata.projectId
    if (!sourceProjectId) {
      // 最初に読めたエンティティのキーにあるプロジェクト
      try {
        await forEachDumpEntry(outputFiles, (_entry, projectId) => {
          if (projectId) {
            sourceProjectId = projectId
            throw new StopIteration()
          }
        })
      } catch (error) {
        if (!(error instanceof StopIteration)) {
          throw error
        }
      }
    }

    const projectScope = outputFiles.some((file) => file.split(sep).includes('all_kinds'))
    const cleanup = tempDir

    return {
      format: 'official',
      sourceProjectId,
      scopeKind: projectScope ? 'project' : null,
      forEach: (callback) => forEachDumpEntry(outputFiles, (entry) => callback(entry)),
      close: async () => {
        if (cleanup) {
          await rm(cleanup, { recursive: true, force: true }).catch(() => undefined)
        }
      }
    }
  } catch (error) {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  }
}

// ── JSON（.jsonl） ──

async function openJsonl(filePath: string, firstLine: string): Promise<ImportSource> {
  const header = parseJsonlHeader(firstLine)

  return {
    format: 'jsonl',
    sourceProjectId: typeof header.projectId === 'string' ? header.projectId : null,
    scopeKind: scopeKindOf(header),
    forEach: async (callback) => {
      const lines = createInterface({
        input: createReadStream(filePath, 'utf8'),
        crlfDelay: Infinity
      })
      let lineNumber = 0
      for await (const line of lines) {
        lineNumber += 1
        if (lineNumber === 1 || line.trim() === '') {
          continue
        }
        let document: TypedDocument
        try {
          document = parseJsonlDocument(line)
        } catch (error) {
          const reason = error instanceof Error ? error.message : '読めません'
          await callback({ kind: 'bad', label: `${lineNumber} 行目（${reason}）` })
          continue
        }
        await callback({ kind: 'document', document })
      }
    },
    close: async () => undefined
  }
}

/**
 * ファイルを開く。形式は中身で決める。
 *   フォルダ / zip / output-N   公式ダンプ
 *   1 行目が firemint-docs の見出し   JSON
 */
export async function openImportSource(inputPath: string): Promise<ImportSource> {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    throw new Error('パスが空です')
  }

  const info = await stat(trimmed)
  if (info.isDirectory()) {
    if ((await readdir(trimmed)).length === 0) {
      throw new Error('フォルダが空です')
    }
    return openOfficialDump(trimmed, false)
  }

  if (!info.isFile()) {
    throw new Error('ファイルまたはフォルダを指定してください')
  }

  const head = await readHead(trimmed, ZIP_MAGIC.length)
  if (head.equals(ZIP_MAGIC)) {
    return openOfficialDump(trimmed, true)
  }

  if (/^output-\d+$/.test(basename(trimmed))) {
    return openOfficialDump(trimmed, false)
  }

  const firstLine = await readFirstLine(trimmed)
  if (firstLine === null || firstLine.trim() === '') {
    throw new Error('ファイルが空です')
  }
  return openJsonl(trimmed, firstLine)
}
