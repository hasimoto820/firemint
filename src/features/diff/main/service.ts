import { readFile, writeFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { fetchExportDocuments } from '@features/data_transfer/main/service'
import { joinDocumentPath } from '@shared/firestore/paths'
import { isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError } from '@shared/safety/canceled'
import type {
  CollectionDiffInput,
  CollectionDiffProgress,
  CollectionDiffResult,
  CollectionDiffRow,
  CollectionDiffSummary,
  DiffExportFormat,
  DiffExportResult,
  PeekDiffJsonResult
} from '@features/diff/shared/types'

type ProgressReporter = (progress: CollectionDiffProgress) => void

type DiffJsonDocument = {
  id?: string
  path?: string
  data: Record<string, unknown>
}

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

function statusLabel(status: CollectionDiffRow['status']): string {
  switch (status) {
    case 'json_only':
      return 'JSON'
    case 'collection_only':
      return 'コレクション'
    case 'changed':
      return '中身が違う'
  }
}

function summaryToCsv(summary: CollectionDiffSummary): string {
  const header = ['id', 'path', 'collectionPath', '固有', 'JSON', 'コレクション']
    .map(escapeCsvCell)
    .join(',')
  const rows = summary.rows.map((row) =>
    [
      row.id,
      row.path,
      row.collectionPath,
      statusLabel(row.status),
      row.json,
      row.collection
    ]
      .map(escapeCsvCell)
      .join(',')
  )

  return [header, ...rows].join('\n')
}

function toDiffError(error: unknown, canceled = false): CollectionDiffResult {
  const wasCanceled = canceled || isCanceledError(error)
  logError('diff', 'compareCollectionJson failed', error)

  if (wasCanceled) {
    return { ok: false, error: '比較をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Compare collection failed'
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

function collectionParentOfDocument(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  return segments.slice(0, -1).join('/')
}

function documentIdOfPath(documentPath: string): string {
  const segments = documentPath.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? documentPath
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

function inferCollectionPath(documents: DiffJsonDocument[]): string | null {
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

function parseDiffDocuments(raw: string): DiffJsonDocument[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('JSON は ExportDocument の配列である必要があります')
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
 * 突合せ path。id が無い行は呼ばない。
 * path はヒント。id があるときは親 + id を正とする（import と同じ）。
 */
function resolveDiffDocumentPath(
  document: DiffJsonDocument,
  collectionPath: string,
  includeSubcollections: boolean
): string | 'skip' {
  const id = document.id
  if (!id) {
    return 'skip'
  }

  if (document.path && isDocumentPath(document.path) && isUnderCollectionPath(document.path, collectionPath)) {
    if (!includeSubcollections && !isDirectDocumentPath(document.path, collectionPath)) {
      return 'skip'
    }

    const segments = document.path.split('/').filter(Boolean)
    segments[segments.length - 1] = id
    return segments.join('/')
  }

  return joinDocumentPath(collectionPath, id)
}

export async function selectDiffJson(
  window: BrowserWindow | null
): Promise<{ canceled: boolean; filePath: string | null }> {
  const options = {
    title: '比べる JSON を選択',
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

export async function peekDiffJson(filePath: string): Promise<PeekDiffJsonResult> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const documents = parseDiffDocuments(raw)
    return {
      ok: true,
      collectionPath: inferCollectionPath(documents)
    }
  } catch (error) {
    logError('diff', 'peekDiffJson failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'JSON を読み取れませんでした'
    }
  }
}

export async function compareCollectionJson(
  input: CollectionDiffInput,
  onProgress?: ProgressReporter
): Promise<CollectionDiffResult> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = input.collectionPath.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    if (!input.filePath) {
      throw new Error('JSON ファイルを選んでください')
    }

    logInfo(
      'diff',
      `compareCollectionJson projectId=${input.projectId} path=${collectionPath} file=${input.filePath}`
    )

    onProgress?.({
      phase: 'loading',
      processedCount: 0,
      totalCount: 0,
      percent: 2,
      detail: input.filePath
    })

    const raw = await readFile(input.filePath, 'utf8')
    const jsonDocuments = parseDiffDocuments(raw)

    const jsonByPath = new Map<string, Record<string, unknown>>()
    let missingIdCount = 0
    let skippedOutsideCount = 0

    for (const document of jsonDocuments) {
      if (!document.id) {
        missingIdCount += 1
        continue
      }

      const resolved = resolveDiffDocumentPath(document, collectionPath, input.includeSubcollections)
      if (resolved === 'skip') {
        skippedOutsideCount += 1
        continue
      }

      jsonByPath.set(resolved, document.data)
    }

    onProgress?.({
      phase: 'reading',
      processedCount: 0,
      totalCount: 0,
      percent: 8,
      detail: collectionPath
    })

    const collectionDocuments = await fetchExportDocuments(
      input.projectId,
      collectionPath,
      input.includeSubcollections,
      {
        onProgress: (documentCount, currentCollectionPath) => {
          onProgress?.({
            phase: 'reading',
            processedCount: documentCount,
            totalCount: 0,
            percent: Math.min(80, 8 + Math.round(Math.min(documentCount, 5000) / 70)),
            detail: currentCollectionPath
          })
        }
      }
    )

    const collectionByPath = new Map(
      collectionDocuments.map((document) => [document.path, document.data])
    )

    onProgress?.({
      phase: 'comparing',
      processedCount: 0,
      totalCount: jsonByPath.size + collectionByPath.size,
      percent: 85,
      detail: null
    })

    const paths = new Set<string>([...jsonByPath.keys(), ...collectionByPath.keys()])
    const rows: CollectionDiffRow[] = []
    let sameCount = 0
    let jsonOnlyCount = 0
    let collectionOnlyCount = 0
    let changedCount = 0

    for (const path of Array.from(paths).sort()) {
      const json = jsonByPath.get(path) ?? null
      const collection = collectionByPath.get(path) ?? null

      if (json && collection) {
        if (canonicalize(json) === canonicalize(collection)) {
          sameCount += 1
          continue
        }

        changedCount += 1
        rows.push({
          id: documentIdOfPath(path),
          path,
          collectionPath: collectionParentOfDocument(path),
          status: 'changed',
          json,
          collection
        })
        continue
      }

      if (json) {
        jsonOnlyCount += 1
        rows.push({
          id: documentIdOfPath(path),
          path,
          collectionPath: collectionParentOfDocument(path),
          status: 'json_only',
          json,
          collection: null
        })
        continue
      }

      collectionOnlyCount += 1
      rows.push({
        id: documentIdOfPath(path),
        path,
        collectionPath: collectionParentOfDocument(path),
        status: 'collection_only',
        json: null,
        collection
      })
    }

    const data: CollectionDiffSummary = {
      projectId: input.projectId,
      collectionPath,
      filePath: input.filePath,
      includeSubcollections: input.includeSubcollections,
      jsonCount: jsonByPath.size,
      collectionCount: collectionDocuments.length,
      sameCount,
      jsonOnlyCount,
      collectionOnlyCount,
      changedCount,
      missingIdCount,
      skippedOutsideCount,
      rows
    }

    onProgress?.({
      phase: 'done',
      processedCount: rows.length,
      totalCount: rows.length,
      percent: 100,
      detail: null
    })

    return { ok: true, data }
  } catch (error) {
    return toDiffError(error)
  }
}

export async function exportCollectionDiffReport(
  summary: CollectionDiffSummary,
  format: DiffExportFormat,
  window: BrowserWindow | null
): Promise<DiffExportResult> {
  try {
    const baseName = sanitizeFileName(`diff_${summary.collectionPath}`)
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
              kind: 'firemint-collection-diff',
              createdAt: new Date().toISOString(),
              projectId: summary.projectId,
              collectionPath: summary.collectionPath,
              filePath: summary.filePath,
              includeSubcollections: summary.includeSubcollections,
              counts: {
                jsonCount: summary.jsonCount,
                collectionCount: summary.collectionCount,
                sameCount: summary.sameCount,
                jsonOnlyCount: summary.jsonOnlyCount,
                collectionOnlyCount: summary.collectionOnlyCount,
                changedCount: summary.changedCount,
                missingIdCount: summary.missingIdCount,
                skippedOutsideCount: summary.skippedOutsideCount
              },
              rows: summary.rows
            },
            null,
            2
          )

    await writeFile(result.filePath, content, 'utf8')
    logInfo(
      'diff',
      `exportCollectionDiffReport format=${format} file=${result.filePath} rows=${summary.rows.length}`
    )

    return { ok: true, data: { filePath: result.filePath } }
  } catch (error) {
    logError('diff', 'exportCollectionDiffReport failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Export diff report failed'
    }
  }
}
