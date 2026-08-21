import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { writeFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import {
  getCollectionRef,
  getDocumentRef,
  joinCollectionPath,
  joinDocumentPath
} from '@shared/firestore/paths'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import type {
  ExportCollectionJsonInput,
  ExportCollectionProgress,
  ExportDocument,
  ExportDocumentsInput,
  ExportResult
} from '@features/data_transfer/shared/types'
import { documentsToCsv, documentsToJson, sanitizeFileName } from './format'

const PAGE_SIZE = 500

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toExportError(error: unknown, canceled = false): ExportResult {
  const wasCanceled = canceled || isCanceledError(error)
  logError('data_transfer', 'export failed', error)

  if (wasCanceled) {
    return { ok: false, error: '保存をキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Export failed'
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

type FetchExportOptions = {
  signal?: AbortSignal
  onProgress?: (documentCount: number, collectionPath: string) => void
}

async function fetchAllDocuments(
  projectId: string,
  collectionPath: string,
  options?: FetchExportOptions,
  startingCount = 0
): Promise<ExportDocument[]> {
  const collectionRef = getCollectionRef(collectionPath, projectId)
  const documents: ExportDocument[] = []
  let lastDocument: QueryDocumentSnapshot | undefined
  let documentCount = startingCount

  while (true) {
    throwIfCanceled(options?.signal)

    let query = collectionRef.orderBy('__name__').limit(PAGE_SIZE)

    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()

    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      throwIfCanceled(options?.signal)
      documents.push(toExportDocument(collectionPath, doc.id, doc.data() as Record<string, unknown>))
      documentCount += 1

      if (documentCount === 1 || documentCount % 50 === 0) {
        options?.onProgress?.(documentCount, collectionPath)
      }
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }

  return documents
}

/**
 * コレクション一段、またはサブコレクション込みでドキュメントを収集する。
 * 含む場合は flat な ExportDocument[]（path がフルパス）。
 */
export async function fetchExportDocuments(
  projectId: string,
  collectionPath: string,
  includeSubcollections: boolean,
  options?: FetchExportOptions,
  startingCount = 0
): Promise<ExportDocument[]> {
  const documents = await fetchAllDocuments(projectId, collectionPath, options, startingCount)
  let documentCount = startingCount + documents.length

  if (!includeSubcollections) {
    return documents
  }

  const collected: ExportDocument[] = []

  for (const document of documents) {
    throwIfCanceled(options?.signal)
    collected.push(document)

    const subcollections = await getDocumentRef(document.path, projectId).listCollections()
    for (const subcollection of subcollections) {
      throwIfCanceled(options?.signal)
      const nestedPath = joinCollectionPath(document.path, subcollection.id)
      const nestedDocuments = await fetchExportDocuments(
        projectId,
        nestedPath,
        true,
        options,
        documentCount
      )
      documentCount += nestedDocuments.length
      collected.push(...nestedDocuments)
    }
  }

  return collected
}

export async function promptIncludeSubcollections(
  window: BrowserWindow | null,
  collectionPath: string
): Promise<{ canceled: boolean; includeSubcollections: boolean }> {
  const options = {
    type: 'question' as const,
    title: 'コレクションをエクスポート',
    message: `「${collectionPath}」を JSON エクスポートします。`,
    detail: 'サブコレクションを含めると、配下のドキュメントもすべて書き出します（件数・時間が増えます）。',
    checkboxLabel: 'サブコレクションを含む',
    checkboxChecked: false,
    buttons: ['エクスポート', 'キャンセル'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }

  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)

  if (result.response === 1) {
    return { canceled: true, includeSubcollections: false }
  }

  return { canceled: false, includeSubcollections: result.checkboxChecked }
}

async function saveTextFile(
  window: BrowserWindow | null,
  content: string,
  defaultPath: string,
  extension: 'json' | 'csv'
): Promise<string | null> {
  const filters =
    extension === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }]
      : [{ name: 'CSV', extensions: ['csv'] }]

  const result = window
    ? await dialog.showSaveDialog(window, {
        title: 'エクスポート先を選択',
        defaultPath,
        filters
      })
    : await dialog.showSaveDialog({
        title: 'エクスポート先を選択',
        defaultPath,
        filters
      })

  if (result.canceled || !result.filePath) {
    return null
  }

  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}

export function collectionExportDefaultFileName(
  collectionPath: string,
  includeSubcollections: boolean
): string {
  const suffix = includeSubcollections ? '-with-subcollections' : ''
  return `${sanitizeFileName(collectionPath)}${suffix}.json`
}

export async function selectCollectionExportJsonPath(
  window: BrowserWindow | null,
  defaultPath: string
): Promise<string | null> {
  const options = {
    title: 'エクスポート先を選択',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }

  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
}

type CollectionExportProgressReporter = (progress: ExportCollectionProgress) => void

export async function writeCollectionJsonToFile(
  input: ExportCollectionJsonInput,
  filePath: string,
  onProgress?: CollectionExportProgressReporter,
  signal?: AbortSignal
): Promise<ExportResult> {
  try {
    ensureConnected(input.projectId)
    throwIfCanceled(signal)

    const collectionPath = input.collectionPath.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    const includeSubcollections = input.includeSubcollections ?? false

    logInfo(
      'data_transfer',
      `writeCollectionJsonToFile projectId=${input.projectId} path=${collectionPath} includeSubcollections=${includeSubcollections} file=${filePath}`
    )

    const documents = await fetchExportDocuments(
      input.projectId,
      collectionPath,
      includeSubcollections,
      {
        signal,
        onProgress: (documentCount, currentCollectionPath) => {
          onProgress?.({
            phase: 'reading',
            documentCount,
            currentCollectionPath,
            percent: Math.min(85, 5 + Math.floor(documentCount / 20))
          })
        }
      }
    )

    throwIfCanceled(signal)

    if (documents.length === 0) {
      throw new Error('エクスポート対象のドキュメントがありません')
    }

    onProgress?.({
      phase: 'writing',
      documentCount: documents.length,
      currentCollectionPath: collectionPath,
      percent: 92
    })

    await writeFile(filePath, documentsToJson(documents), 'utf8')

    onProgress?.({
      phase: 'done',
      documentCount: documents.length,
      currentCollectionPath: collectionPath,
      percent: 100
    })

    return {
      ok: true,
      data: {
        filePath,
        documentCount: documents.length,
        includeSubcollections
      }
    }
  } catch (error) {
    return toExportError(error)
  }
}

export async function exportCollectionJson(
  input: ExportCollectionJsonInput,
  window: BrowserWindow | null
): Promise<ExportResult> {
  try {
    ensureConnected(input.projectId)

    const collectionPath = input.collectionPath.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    let includeSubcollections = input.includeSubcollections ?? false

    if (input.includeSubcollections === undefined) {
      const prompt = await promptIncludeSubcollections(window, collectionPath)
      if (prompt.canceled) {
        return toExportError(new Error('canceled'), true)
      }
      includeSubcollections = prompt.includeSubcollections
    }

    logInfo(
      'data_transfer',
      `exportCollectionJson projectId=${input.projectId} path=${collectionPath} includeSubcollections=${includeSubcollections}`
    )

    const documents = await fetchExportDocuments(
      input.projectId,
      collectionPath,
      includeSubcollections
    )

    if (documents.length === 0) {
      throw new Error('エクスポート対象のドキュメントがありません')
    }

    const content = documentsToJson(documents)
    const defaultPath = collectionExportDefaultFileName(collectionPath, includeSubcollections)
    const filePath = await saveTextFile(window, content, defaultPath, 'json')

    if (!filePath) {
      return toExportError(new Error('canceled'), true)
    }

    return {
      ok: true,
      data: {
        filePath,
        documentCount: documents.length,
        includeSubcollections
      }
    }
  } catch (error) {
    return toExportError(error)
  }
}

export async function exportDocumentsJson(
  input: ExportDocumentsInput,
  window: BrowserWindow | null
): Promise<ExportResult> {
  try {
    if (input.documents.length === 0) {
      throw new Error('エクスポート対象のドキュメントがありません')
    }

    logInfo('data_transfer', `exportDocumentsJson count=${input.documents.length}`)

    const content = documentsToJson(input.documents)
    const baseName = sanitizeFileName(input.defaultFileName ?? 'query-result')
    const filePath = await saveTextFile(window, content, `${baseName}.json`, 'json')

    if (!filePath) {
      return toExportError(new Error('canceled'), true)
    }

    return {
      ok: true,
      data: {
        filePath,
        documentCount: input.documents.length,
        includeSubcollections: false
      }
    }
  } catch (error) {
    return toExportError(error)
  }
}

export async function exportDocumentsCsv(
  input: ExportDocumentsInput,
  window: BrowserWindow | null
): Promise<ExportResult> {
  try {
    if (input.documents.length === 0) {
      throw new Error('エクスポート対象のドキュメントがありません')
    }

    logInfo('data_transfer', `exportDocumentsCsv count=${input.documents.length}`)

    const content = documentsToCsv(input.documents)
    const baseName = sanitizeFileName(input.defaultFileName ?? 'query-result')
    const filePath = await saveTextFile(window, content, `${baseName}.csv`, 'csv')

    if (!filePath) {
      return toExportError(new Error('canceled'), true)
    }

    return {
      ok: true,
      data: {
        filePath,
        documentCount: input.documents.length,
        includeSubcollections: false
      }
    }
  } catch (error) {
    return toExportError(error)
  }
}
