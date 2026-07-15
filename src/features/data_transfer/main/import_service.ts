import { readFile } from 'fs/promises'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { ensureWritable } from '@features/workspace/main/guard'
import { getCollectionRef, getDocumentRef, joinDocumentPath } from '@shared/firestore/paths'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  ImportCollectionJsonInput,
  ImportDocument,
  ImportResult
} from '@features/data_transfer/shared/types'

type PlannedWrite =
  | {
      kind: 'existingId'
      documentPath: string
      data: Record<string, unknown>
    }
  | {
      kind: 'autoId'
      collectionPath: string
      data: Record<string, unknown>
    }

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toImportError(error: unknown, canceled = false): ImportResult {
  logError('data_transfer', 'import failed', error)

  if (canceled) {
    return { ok: false, error: 'インポートをキャンセルしました', canceled: true }
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Import failed'
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

function parseImportDocuments(raw: string): ImportDocument[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('JSON は ExportDocument の配列である必要があります')
  }

  if (parsed.length === 0) {
    throw new Error('インポート対象のドキュメントがありません')
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
 * 書込先 path を決める。
 * 仕様: path はヒント。id があるときは「親 + id」を正とする（001_008）。
 */
function resolveDocumentPath(
  document: ImportDocument,
  collectionPath: string,
  includeSubcollections: boolean
): string | 'auto' | 'skip' {
  if (document.id) {
    if (document.path && isDocumentPath(document.path) && isUnderCollectionPath(document.path, collectionPath)) {
      if (!includeSubcollections && !isDirectDocumentPath(document.path, collectionPath)) {
        return 'skip'
      }

      const segments = document.path.split('/').filter(Boolean)
      segments[segments.length - 1] = document.id
      return segments.join('/')
    }

    return joinDocumentPath(collectionPath, document.id)
  }

  if (document.path) {
    if (!isDocumentPath(document.path)) {
      throw new Error(`不正なドキュメント path です: ${document.path}`)
    }

    if (!isUnderCollectionPath(document.path, collectionPath)) {
      return 'skip'
    }

    if (!includeSubcollections && !isDirectDocumentPath(document.path, collectionPath)) {
      return 'skip'
    }

    return document.path
  }

  return 'auto'
}

function planWrites(
  documents: ImportDocument[],
  collectionPath: string,
  includeSubcollections: boolean
): { planned: PlannedWrite[]; skippedOutsideCount: number } {
  const planned: PlannedWrite[] = []
  let skippedOutsideCount = 0

  for (const document of documents) {
    const resolved = resolveDocumentPath(document, collectionPath, includeSubcollections)

    if (resolved === 'skip') {
      skippedOutsideCount += 1
      continue
    }

    if (resolved === 'auto') {
      planned.push({
        kind: 'autoId',
        collectionPath,
        data: document.data
      })
      continue
    }

    planned.push({
      kind: 'existingId',
      documentPath: resolved,
      data: document.data
    })
  }

  return { planned, skippedOutsideCount }
}

async function promptIncludeSubcollections(
  window: BrowserWindow | null,
  collectionPath: string,
  fileDocumentCount: number
): Promise<{ canceled: boolean; includeSubcollections: boolean }> {
  const options = {
    type: 'question' as const,
    title: 'コレクションへインポート',
    message: `「${collectionPath}」へ JSON をインポートします。`,
    detail: `ファイル内 ${fileDocumentCount} 件。\nサブコレクションを含めると、path が配下のドキュメントも書き込みます。\n既存ドキュメントと id/path が重なる場合は全体を中止します。`,
    checkboxLabel: 'サブコレクションを含む',
    checkboxChecked: false,
    buttons: ['プレビューへ', 'キャンセル'],
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

async function confirmImport(
  window: BrowserWindow | null,
  collectionPath: string,
  writeCount: number,
  skippedOutsideCount: number,
  includeSubcollections: boolean
): Promise<boolean> {
  const skipNote =
    skippedOutsideCount > 0 ? `\n宛先外として除外: ${skippedOutsideCount} 件` : ''
  const scope = includeSubcollections ? 'サブコレクション含む' : 'コレクション一段'
  const options = {
    type: 'question' as const,
    title: 'インポートの確認',
    message: `「${collectionPath}」へ ${writeCount} 件を書き込みます（${scope}）。`,
    detail: `既存ドキュメントと衝突する場合は書き込みません（全体停止）。${skipNote}`,
    buttons: ['インポート実行', 'キャンセル'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }

  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)

  return result.response === 0
}

async function assertNoCollisions(projectId: string, planned: PlannedWrite[]): Promise<void> {
  const collisions: string[] = []

  for (const write of planned) {
    if (write.kind !== 'existingId') {
      continue
    }

    const snapshot = await getDocumentRef(write.documentPath, projectId).get()
    if (snapshot.exists) {
      collisions.push(write.documentPath)
      if (collisions.length >= 5) {
        break
      }
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `既存ドキュメントと衝突したため中止しました: ${collisions.join(', ')}`
    )
  }
}

async function writePlannedDocuments(projectId: string, planned: PlannedWrite[]): Promise<number> {
  const db = getFirestore(projectId)
  let writtenCount = 0

  for (let offset = 0; offset < planned.length; offset += FIRESTORE_BATCH_LIMIT) {
    const chunk = planned.slice(offset, offset + FIRESTORE_BATCH_LIMIT)
    const batch = db.batch()

    for (const write of chunk) {
      const data = deserializeDocumentData(write.data)

      if (write.kind === 'existingId') {
        batch.create(getDocumentRef(write.documentPath, projectId), data)
      } else {
        batch.create(getCollectionRef(write.collectionPath, projectId).doc(), data)
      }

      writtenCount += 1
    }

    await batch.commit()
  }

  return writtenCount
}

export async function importCollectionJson(
  input: ImportCollectionJsonInput,
  window: BrowserWindow | null
): Promise<ImportResult> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = input.collectionPath.trim()
    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    const openResult = window
      ? await dialog.showOpenDialog(window, {
          title: 'インポートする JSON を選択',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : await dialog.showOpenDialog({
          title: 'インポートする JSON を選択',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return toImportError(new Error('canceled'), true)
    }

    const filePath = openResult.filePaths[0]
    const raw = await readFile(filePath, 'utf8')
    const documents = parseImportDocuments(raw)

    let includeSubcollections = input.includeSubcollections ?? false

    if (input.includeSubcollections === undefined) {
      const prompt = await promptIncludeSubcollections(window, collectionPath, documents.length)
      if (prompt.canceled) {
        return toImportError(new Error('canceled'), true)
      }
      includeSubcollections = prompt.includeSubcollections
    }

    const { planned, skippedOutsideCount } = planWrites(
      documents,
      collectionPath,
      includeSubcollections
    )

    if (planned.length === 0) {
      throw new Error('宛先コレクションに書き込むドキュメントがありません')
    }

    logInfo(
      'data_transfer',
      `importCollectionJson projectId=${input.projectId} path=${collectionPath} planned=${planned.length} includeSubcollections=${includeSubcollections}`
    )

    await assertNoCollisions(input.projectId, planned)

    const confirmed = await confirmImport(
      window,
      collectionPath,
      planned.length,
      skippedOutsideCount,
      includeSubcollections
    )

    if (!confirmed) {
      return toImportError(new Error('canceled'), true)
    }

    const writtenCount = await writePlannedDocuments(input.projectId, planned)

    return {
      ok: true,
      data: {
        writtenCount,
        skippedOutsideCount,
        includeSubcollections,
        filePath
      }
    }
  } catch (error) {
    return toImportError(error)
  }
}
