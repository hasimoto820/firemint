import { writeFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { listRootCollections } from '@features/explorer/main/service'
import { readOfficialDump } from '@features/data_transfer/main/official/read_dump'
import { iterateExportDocuments, iterateGroupDocuments } from '@features/data_transfer/main/project_export_service'
import type { OfficialDumpSummary } from '@features/data_transfer/shared/official'
import type { ExportDocument } from '@features/data_transfer/shared/types'
import { isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError } from '@shared/safety/canceled'
import type {
  DiffExportFormat,
  DiffExportResult,
  DiffProgress,
  DiffRow,
  DiffSummary,
  DumpDiffInput,
  DumpDiffResult,
  PeekDiffDumpResult
} from '@features/diff/shared/types'

type ProgressReporter = (progress: DiffProgress) => void

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function statusLabel(status: DiffRow['status']): string {
  switch (status) {
    case 'dump_only':
      return 'ダンプ'
    case 'project_only':
      return 'プロジェクト'
    case 'changed':
      return '中身が違う'
  }
}

function summaryToCsv(summary: DiffSummary): string {
  const header = ['id', 'path', 'collectionPath', '固有', 'ダンプ', 'プロジェクト']
    .map(escapeCsvCell)
    .join(',')
  const rows = summary.rows.map((row) =>
    [row.id, row.path, row.collectionPath, statusLabel(row.status), row.dump, row.project]
      .map(escapeCsvCell)
      .join(',')
  )

  return [header, ...rows].join('\n')
}

function toDiffError(error: unknown, canceled = false): DumpDiffResult {
  const wasCanceled = canceled || isCanceledError(error)
  logError('diff', 'compareOfficialDump failed', error)

  if (wasCanceled) {
    return { ok: false, error: '比較をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Compare dump failed'
  }
}

function collectionParentOfDocument(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  return segments.slice(0, -1).join('/')
}

function documentIdOfPath(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? documentPath
}

function collectionIdOfPath(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[segments.length - 2] : ''
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}

  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeys(record[key])
  }

  return sorted
}

function canonicalize(value: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(value))
}

function isAllKindsDump(summary: OfficialDumpSummary): boolean {
  return summary.outputFiles.some((filePath) => /(?:^|[/\\])all_kinds(?:[/\\]|$)/.test(filePath))
}

function uniqueCollectionParents(documents: ExportDocument[]): string[] {
  const parents = new Set<string>()
  for (const document of documents) {
    const parent = collectionParentOfDocument(document.path)
    if (parent) {
      parents.add(parent)
    }
  }
  return Array.from(parents).sort()
}

function collectionTreeRoot(parents: string[]): string | null {
  if (parents.length === 0) {
    return null
  }

  const sorted = [...parents].sort((left, right) => left.length - right.length || left.localeCompare(right))
  const root = sorted[0]
  if (sorted.every((parent) => parent === root || parent.startsWith(`${root}/`))) {
    return root
  }

  return null
}

function inferGroupId(documents: ExportDocument[]): string | null {
  const ids = new Set(
    documents.map((document) => collectionIdOfPath(document.path)).filter((id) => id.length > 0)
  )
  if (ids.size !== 1) {
    return null
  }

  if (collectionTreeRoot(uniqueCollectionParents(documents))) {
    return null
  }

  return Array.from(ids)[0] ?? null
}

async function collectLiveDocuments(
  projectId: string,
  dump: OfficialDumpSummary,
  onProgress?: ProgressReporter
): Promise<ExportDocument[]> {
  const documents: ExportDocument[] = []

  const report = (detail: string): void => {
    onProgress?.({
      phase: 'reading',
      processedCount: documents.length,
      totalCount: 0,
      percent: Math.min(80, 12 + Math.round(Math.min(documents.length, 5000) / 70)),
      detail
    })
  }

  if (isAllKindsDump(dump)) {
    const roots = await listRootCollections(projectId)
    const listed = roots.ok ? roots.data : []
    const dumpRoots = [
      ...new Set(
        dump.documents
          .map((document) => document.path.split('/').filter(Boolean)[0])
          .filter((rootId): rootId is string => Boolean(rootId))
      )
    ]
    const rootIds = [...new Set([...listed, ...dumpRoots])].sort()

    for (const rootId of rootIds) {
      for await (const document of iterateExportDocuments(projectId, rootId, true)) {
        documents.push(document)
        if (documents.length === 1 || documents.length % 50 === 0) {
          report(document.path)
        }
      }
    }

    return documents
  }

  const groupId = inferGroupId(dump.documents)
  if (groupId) {
    for await (const document of iterateGroupDocuments(projectId, groupId)) {
      documents.push(document)
      if (documents.length === 1 || documents.length % 50 === 0) {
        report(document.path)
      }
    }
    return documents
  }

  for (const collectionPath of uniqueCollectionParents(dump.documents)) {
    for await (const document of iterateExportDocuments(projectId, collectionPath, false)) {
      documents.push(document)
      if (documents.length === 1 || documents.length % 50 === 0) {
        report(document.path)
      }
    }
  }

  return documents
}

export async function peekDiffDump(dumpPath: string): Promise<PeekDiffDumpResult> {
  try {
    const result = await readOfficialDump(dumpPath)
    if (!result.ok) {
      return result
    }

    return {
      ok: true,
      documentCount: result.data.documents.length,
      samplePaths: result.data.documents.slice(0, 8).map((document) => document.path),
      sourceProjectId: result.data.sourceProjectId
    }
  } catch (error) {
    logError('diff', 'peekDiffDump failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ダンプを読み取れませんでした'
    }
  }
}

export async function compareOfficialDump(
  input: DumpDiffInput,
  onProgress?: ProgressReporter
): Promise<DumpDiffResult> {
  try {
    ensureConnected(input.projectId)

    if (!input.dumpPath) {
      throw new Error('ダンプを選んでください')
    }

    logInfo('diff', `compareOfficialDump projectId=${input.projectId} dump=${input.dumpPath}`)

    onProgress?.({
      phase: 'loading',
      processedCount: 0,
      totalCount: 0,
      percent: 4,
      detail: input.dumpPath
    })

    const dump = await readOfficialDump(input.dumpPath)
    if (!dump.ok) {
      return dump
    }

    if (dump.data.documents.length === 0) {
      throw new Error('ダンプにドキュメントがありません')
    }

    const dumpByPath = new Map<string, Record<string, unknown>>()
    for (const document of dump.data.documents) {
      dumpByPath.set(document.path, document.data)
    }

    onProgress?.({
      phase: 'reading',
      processedCount: 0,
      totalCount: 0,
      percent: 12,
      detail: input.projectId
    })

    const liveDocuments = await collectLiveDocuments(input.projectId, dump.data, onProgress)
    const projectByPath = new Map(
      liveDocuments.map((document) => [document.path, document.data])
    )

    onProgress?.({
      phase: 'comparing',
      processedCount: 0,
      totalCount: dumpByPath.size + projectByPath.size,
      percent: 88,
      detail: null
    })

    const paths = new Set<string>([...dumpByPath.keys(), ...projectByPath.keys()])
    const rows: DiffRow[] = []
    let sameCount = 0
    let dumpOnlyCount = 0
    let projectOnlyCount = 0
    let changedCount = 0

    for (const path of Array.from(paths).sort()) {
      const dumpData = dumpByPath.get(path) ?? null
      const projectData = projectByPath.get(path) ?? null

      if (dumpData && projectData) {
        if (canonicalize(dumpData) === canonicalize(projectData)) {
          sameCount += 1
          continue
        }

        changedCount += 1
        rows.push({
          id: documentIdOfPath(path),
          path,
          collectionPath: collectionParentOfDocument(path),
          status: 'changed',
          dump: dumpData,
          project: projectData
        })
        continue
      }

      if (dumpData) {
        dumpOnlyCount += 1
        rows.push({
          id: documentIdOfPath(path),
          path,
          collectionPath: collectionParentOfDocument(path),
          status: 'dump_only',
          dump: dumpData,
          project: null
        })
        continue
      }

      projectOnlyCount += 1
      rows.push({
        id: documentIdOfPath(path),
        path,
        collectionPath: collectionParentOfDocument(path),
        status: 'project_only',
        dump: null,
        project: projectData
      })
    }

    const data: DiffSummary = {
      projectId: input.projectId,
      dumpPath: input.dumpPath,
      sourceProjectId: dump.data.sourceProjectId,
      dumpCount: dumpByPath.size,
      projectCount: liveDocuments.length,
      sameCount,
      dumpOnlyCount,
      projectOnlyCount,
      changedCount,
      rows
    }

    onProgress?.({
      phase: 'done',
      processedCount: rows.length,
      totalCount: rows.length,
      percent: 100,
      detail: null
    })

    logInfo(
      'diff',
      `compareOfficialDump done dump=${data.dumpCount} project=${data.projectCount} changed=${changedCount} dumpOnly=${dumpOnlyCount} projectOnly=${projectOnlyCount}`
    )

    return { ok: true, data }
  } catch (error) {
    return toDiffError(error)
  }
}

export async function exportDumpDiffReport(
  summary: DiffSummary,
  format: DiffExportFormat,
  window: BrowserWindow | null
): Promise<DiffExportResult> {
  try {
    const baseName = sanitizeFileName(`diff_${summary.projectId}`)
    const extension = format === 'csv' ? 'csv' : 'json'
    const defaultPath = `${baseName}.${extension}`
    const filters =
      format === 'csv'
        ? [{ name: 'CSV', extensions: ['csv'] }]
        : [{ name: 'JSON', extensions: ['json'] }]
    const result = window
      ? await dialog.showSaveDialog(window, {
          title: '差分レポートの保存先',
          defaultPath,
          filters
        })
      : await dialog.showSaveDialog({
          title: '差分レポートの保存先',
          defaultPath,
          filters
        })

    if (result.canceled || !result.filePath) {
      return { ok: false, error: '保存をキャンセルしました', canceled: true }
    }

    const content =
      format === 'csv'
        ? summaryToCsv(summary)
        : JSON.stringify(
            {
              version: 1,
              kind: 'firemint-dump-diff',
              createdAt: new Date().toISOString(),
              projectId: summary.projectId,
              dumpPath: summary.dumpPath,
              sourceProjectId: summary.sourceProjectId,
              counts: {
                dumpCount: summary.dumpCount,
                projectCount: summary.projectCount,
                sameCount: summary.sameCount,
                dumpOnlyCount: summary.dumpOnlyCount,
                projectOnlyCount: summary.projectOnlyCount,
                changedCount: summary.changedCount
              },
              rows: summary.rows
            },
            null,
            2
          )

    await writeFile(result.filePath, content, 'utf8')
    logInfo(
      'diff',
      `exportDumpDiffReport format=${format} file=${result.filePath} rows=${summary.rows.length}`
    )

    return { ok: true, data: { filePath: result.filePath } }
  } catch (error) {
    logError('diff', 'exportDumpDiffReport failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Export diff report failed'
    }
  }
}
