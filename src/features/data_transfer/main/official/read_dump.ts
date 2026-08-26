import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import extractZip from 'extract-zip'
import type { ExportDocument } from '../../shared/types'
import type { OfficialDumpReadResult, OfficialDumpSummary } from '../../shared/official'
import { parseOfficialEntity } from './entity_to_document'
import { readLeveldbRecords } from './leveldb_log'
import { listOutputFiles } from './list_output_files'
import { logError, logInfo } from '@shared/logging/logger'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '公式ダンプの読み込みに失敗しました'
}

async function readFirebaseExportProjectId(inputDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(inputDir, 'firebase-export-metadata.json'), 'utf8')
    const parsed = JSON.parse(raw) as { projectId?: unknown; firestore?: { projectId?: unknown } }
    if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
      return parsed.projectId.trim()
    }
    if (typeof parsed.firestore?.projectId === 'string' && parsed.firestore.projectId.trim()) {
      return parsed.firestore.projectId.trim()
    }
  } catch {
    // コンソール / gcloud のフォルダ。メタデータ JSON は無い。
  }

  return null
}

async function resolveDumpRoot(inputDir: string): Promise<string> {
  try {
    const raw = await readFile(join(inputDir, 'firebase-export-metadata.json'), 'utf8')
    const parsed = JSON.parse(raw) as { firestore?: { path?: string } }
    if (typeof parsed.firestore?.path === 'string' && parsed.firestore.path.trim()) {
      return join(inputDir, parsed.firestore.path)
    }
  } catch {
    // コンソール / gcloud のフォルダ。メタデータ JSON は無い。
  }

  return inputDir
}

async function isOfficialDumpRoot(root: string): Promise<boolean> {
  const info = await stat(root)
  if (info.isFile()) {
    return /^output-\d+$/.test(basename(root))
  }

  const names = await readdir(root)
  return names.some(
    (name) =>
      name.endsWith('.overall_export_metadata') ||
      name === 'all_namespaces' ||
      /^output-\d+$/.test(name)
  )
}

function documentsFromOutput(
  buffer: Buffer,
  filePath: string
): { documents: ExportDocument[]; projectIds: string[] } {
  const records = readLeveldbRecords(buffer)
  const documents: ExportDocument[] = []
  const projectIds: string[] = []

  for (const record of records) {
    try {
      const parsed = parseOfficialEntity(record)
      if (parsed) {
        documents.push(parsed.document)
        if (parsed.projectId) {
          projectIds.push(parsed.projectId)
        }
      }
    } catch (error) {
      logError('data_transfer:official', `entity を解けませんでした file=${filePath}`, error)
    }
  }

  return { documents, projectIds }
}

function pickSourceProjectId(projectIds: string[]): string | null {
  if (projectIds.length === 0) {
    return null
  }

  const counts = new Map<string, number>()
  for (const projectId of projectIds) {
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [projectId, count] of counts) {
    if (count > bestCount) {
      best = projectId
      bestCount = count
    }
  }

  return best
}

async function readFromRoot(sourcePath: string, dumpRoot: string): Promise<OfficialDumpSummary> {
  const outputFiles = await listOutputFiles(dumpRoot)
  if (outputFiles.length === 0 && !(await isOfficialDumpRoot(dumpRoot))) {
    throw new Error('公式ダンプではありません（output-* または overall_export_metadata がありません）')
  }

  const documents: ExportDocument[] = []
  const projectIds: string[] = []
  for (const filePath of outputFiles) {
    const buffer = await readFile(filePath)
    const parsed = documentsFromOutput(buffer, filePath)
    documents.push(...parsed.documents)
    projectIds.push(...parsed.projectIds)
  }

  const sourceProjectId =
    (await readFirebaseExportProjectId(sourcePath)) ??
    (await readFirebaseExportProjectId(dumpRoot)) ??
    pickSourceProjectId(projectIds)

  logInfo(
    'data_transfer:official',
    `read dump files=${outputFiles.length} documents=${documents.length} project=${sourceProjectId ?? '-'} root=${dumpRoot}`
  )

  return {
    sourcePath,
    dumpRoot,
    outputFiles,
    documents,
    sourceProjectId
  }
}

export async function readOfficialDump(inputPath: string): Promise<OfficialDumpReadResult> {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    return { ok: false, error: 'パスが空です' }
  }

  let tempDir: string | null = null

  try {
    const info = await stat(trimmed)
    let dumpRoot = trimmed

    if (info.isFile() && trimmed.toLowerCase().endsWith('.zip')) {
      tempDir = await mkdtemp(join(tmpdir(), 'firemint-official-'))
      await extractZip(trimmed, { dir: tempDir })
      dumpRoot = await resolveDumpRoot(tempDir)
    } else if (info.isDirectory()) {
      dumpRoot = await resolveDumpRoot(trimmed)
    } else if (info.isFile()) {
      dumpRoot = trimmed
    } else {
      return { ok: false, error: 'フォルダまたは zip を指定してください' }
    }

    const data = await readFromRoot(trimmed, dumpRoot)
    return { ok: true, data }
  } catch (error) {
    logError('data_transfer:official', `readOfficialDump failed path=${trimmed}`, error)
    return { ok: false, error: errorMessage(error) }
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}
