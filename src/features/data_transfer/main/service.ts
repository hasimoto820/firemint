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
import type {
  ExportCollectionJsonInput,
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
  logError('data_transfer', 'export failed', error)

  if (canceled) {
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

async function fetchAllDocuments(
  projectId: string,
  collectionPath: string
): Promise<ExportDocument[]> {
  const collectionRef = getCollectionRef(collectionPath, projectId)
  const documents: ExportDocument[] = []
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
      documents.push(toExportDocument(collectionPath, doc.id, doc.data() as Record<string, unknown>))
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
async function fetchExportDocuments(
  projectId: string,
  collectionPath: string,
  includeSubcollections: boolean
): Promise<ExportDocument[]> {
  const documents = await fetchAllDocuments(projectId, collectionPath)

  if (!includeSubcollections) {
    return documents
  }

  const collected: ExportDocument[] = []

  for (const document of documents) {
    collected.push(document)

    const subcollections = await getDocumentRef(document.path, projectId).listCollections()
    for (const subcollection of subcollections) {
      const nestedPath = joinCollectionPath(document.path, subcollection.id)
      const nestedDocuments = await fetchExportDocuments(projectId, nestedPath, true)
      collected.push(...nestedDocuments)
    }
  }

  return collected
}

async function promptIncludeSubcollections(
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
    const suffix = includeSubcollections ? '-with-subcollections' : ''
    const defaultPath = `${sanitizeFileName(collectionPath)}${suffix}.json`
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
