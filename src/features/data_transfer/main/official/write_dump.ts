import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { basename } from 'path'
import { ensureFirestoreWritable } from '@features/workspace/main/guard'
import {
  addEmulatorEntryAndLoad,
  getWorkspaceEntry
} from '@features/workspace/main/service'
import { emulatorEntryId } from '@features/connection/shared/emulator'
import type { ExportDocument } from '../../shared/types'
import type {
  OfficialImportInput,
  OfficialImportResult,
  OfficialImportValidationResult
} from '../../shared/official'
import type { ImportProjectProgress } from '../../shared/types'
import { getDocumentRef } from '@shared/firestore/paths'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { deserializeDocumentData } from '@shared/firestore/serialize'
import { FIRESTORE_BATCH_LIMIT } from '@shared/safety/operations'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { logError, logInfo } from '@shared/logging/logger'
import { readOfficialDump } from './read_dump'

type ProgressReporter = (progress: ImportProjectProgress) => void

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function previewWriteProjectId(
  selectedProjectId: string,
  sourceProjectId: string | null
): string {
  const dest = getWorkspaceEntry(selectedProjectId)

  if (!dest || dest.authType !== 'emulator') {
    return selectedProjectId
  }

  if (!sourceProjectId) {
    throw new Error('ダンプから projectId が取れません。Emulator にプロジェクトとして入れられません。')
  }

  if (dest.emulatorProjectId === sourceProjectId) {
    return dest.id
  }

  return emulatorEntryId(sourceProjectId)
}

async function resolveWriteProjectId(
  selectedProjectId: string,
  sourceProjectId: string | null
): Promise<string> {
  const dest = getWorkspaceEntry(selectedProjectId)

  if (!dest || dest.authType !== 'emulator') {
    return selectedProjectId
  }

  const writtenProjectId = previewWriteProjectId(selectedProjectId, sourceProjectId)
  if (writtenProjectId === dest.id) {
    return dest.id
  }

  if (!sourceProjectId) {
    throw new Error('ダンプから projectId が取れません。Emulator にプロジェクトとして入れられません。')
  }

  if (!dest.emulatorHost) {
    throw new Error('Emulator のホストがありません')
  }

  const added = await addEmulatorEntryAndLoad({
    projectId: sourceProjectId,
    host: dest.emulatorHost,
    setFocused: true
  })

  if (!added.ok) {
    throw new Error(added.error)
  }

  logInfo(
    'data_transfer:official',
    `emulator new project host=${dest.emulatorHost} source=${sourceProjectId} pool=${added.data.id}`
  )

  return added.data.id
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'ダンプのインポートに失敗しました'
}

function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length
}

function sortByPath(documents: ExportDocument[]): ExportDocument[] {
  return [...documents].sort((left, right) => {
    const depth = pathDepth(left.path) - pathDepth(right.path)
    if (depth !== 0) {
      return depth
    }
    return left.path.localeCompare(right.path)
  })
}

async function writeDocuments(
  projectId: string,
  documents: ExportDocument[],
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<{ writtenCount: number; skippedCount: number; collisionSamples: string[] }> {
  const db = getFirestore(projectId)
  const collisionSamples: string[] = []
  const pending: ExportDocument[] = []
  let writtenCount = 0
  let skippedCount = 0
  const ordered = sortByPath(documents)
  const totalCount = ordered.length

  const flush = async (): Promise<void> => {
    if (pending.length === 0) {
      return
    }

    throwIfCanceled(signal)
    const batch = db.batch()
    for (const document of pending) {
      batch.create(
        getDocumentRef(document.path, projectId),
        deserializeDocumentData(document.data, projectId)
      )
    }
    await batch.commit()
    writtenCount += pending.length
    pending.length = 0
  }

  for (let index = 0; index < ordered.length; index += 1) {
    throwIfCanceled(signal)
    const document = ordered[index]
    const snapshot = await getDocumentRef(document.path, projectId).get()
    if (snapshot.exists) {
      skippedCount += 1
      if (collisionSamples.length < 20) {
        collisionSamples.push(document.path)
      }
    } else {
      pending.push(document)
      if (pending.length >= FIRESTORE_BATCH_LIMIT) {
        await flush()
      }
    }

    if (index === 0 || (index + 1) % 50 === 0 || index + 1 === totalCount) {
      onProgress?.({
        phase: 'writing',
        processedCount: index + 1,
        totalCount,
        percent: totalCount === 0 ? 100 : Math.min(99, Math.round(((index + 1) / totalCount) * 100)),
        detail: document.path
      })
    }
  }

  await flush()
  return { writtenCount, skippedCount, collisionSamples }
}

export async function selectOfficialDump(
  window: BrowserWindow | null
): Promise<{ canceled: boolean; filePath: string | null }> {
  const choice = window
    ? await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['フォルダ', 'ZIP', 'キャンセル'],
        defaultId: 0,
        cancelId: 2,
        message: 'フォルダ / ZIP を選ぶ',
        detail: 'コンソール / gcloud / Emulator のフォルダ、またはその zip。'
      })
    : { response: 0 }

  if (choice.response === 2) {
    return { canceled: true, filePath: null }
  }

  const options =
    choice.response === 1
      ? {
          title: 'ZIP を選択',
          properties: ['openFile' as const],
          filters: [{ name: 'ZIP', extensions: ['zip'] }]
        }
      : {
          title: 'フォルダを選択',
          properties: ['openDirectory' as const]
        }

  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null }
  }

  return { canceled: false, filePath: result.filePaths[0] }
}

export async function validateOfficialImport(
  input: OfficialImportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialImportValidationResult> {
  try {
    ensureConnected(input.projectId)
    throwIfCanceled(signal)

    onProgress?.({
      phase: 'extracting',
      processedCount: 0,
      totalCount: 0,
      percent: 5,
      detail: 'ダンプを読み込み中…'
    })

    const loaded = await readOfficialDump(input.dumpPath)
    if (!loaded.ok) {
      return loaded
    }

    const documents = loaded.data.documents
    if (documents.length === 0) {
      return { ok: false, error: 'ダンプにドキュメントがありません' }
    }

    const writtenProjectId = previewWriteProjectId(
      input.projectId,
      loaded.data.sourceProjectId
    )
    const canCheck =
      getWorkspaceEntry(writtenProjectId) !== null && isFirestoreConnected(writtenProjectId)

    const collisionSamples: string[] = []
    let checkedCount = 0
    const totalCount = documents.length

    if (canCheck) {
      for (const document of documents) {
        throwIfCanceled(signal)
        checkedCount += 1

        if (checkedCount === 1 || checkedCount % 50 === 0 || checkedCount === totalCount) {
          onProgress?.({
            phase: 'validating',
            processedCount: checkedCount,
            totalCount,
            percent: totalCount === 0 ? 90 : Math.min(90, Math.round((checkedCount / totalCount) * 90)),
            detail: document.path
          })
        }

        const snapshot = await getDocumentRef(document.path, writtenProjectId).get()
        if (snapshot.exists && collisionSamples.length < 5) {
          collisionSamples.push(document.path)
        }

        if (collisionSamples.length >= 5) {
          break
        }
      }
    } else {
      checkedCount = documents.length
    }

    onProgress?.({
      phase: 'done',
      processedCount: checkedCount,
      totalCount,
      percent: 100,
      detail: null
    })

    return {
      ok: true,
      data: {
        dumpPath: input.dumpPath,
        documentCount: documents.length,
        samplePaths: documents.slice(0, 8).map((document) => document.path),
        hasCollisions: collisionSamples.length > 0,
        collisionSamples,
        checkedCount,
        sourceProjectId: loaded.data.sourceProjectId,
        writtenProjectId
      }
    }
  } catch (error) {
    const canceled = isCanceledError(error)
    logError('data_transfer:official', 'validateOfficialImport failed', error)
    return {
      ok: false,
      error: canceled ? '検証をキャンセルしました' : errorMessage(error),
      canceled
    }
  }
}

export async function importOfficialDump(
  input: OfficialImportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialImportResult> {
  try {
    throwIfCanceled(signal)

    onProgress?.({
      phase: 'extracting',
      processedCount: 0,
      totalCount: 0,
      percent: 5,
      detail: 'ダンプを読み込み中…'
    })

    const loaded = await readOfficialDump(input.dumpPath)
    if (!loaded.ok) {
      return loaded
    }

    const documents = loaded.data.documents
    if (documents.length === 0) {
      return { ok: false, error: 'ダンプにドキュメントがありません' }
    }

    const writtenProjectId = await resolveWriteProjectId(
      input.projectId,
      loaded.data.sourceProjectId
    )
    ensureConnected(writtenProjectId)
    ensureFirestoreWritable(writtenProjectId)

    logInfo(
      'data_transfer:official',
      `importOfficialDump selected=${input.projectId} written=${writtenProjectId} source=${loaded.data.sourceProjectId ?? '-'} documents=${documents.length} dump=${input.dumpPath}`
    )

    const write = await writeDocuments(writtenProjectId, documents, onProgress, signal)

    onProgress?.({
      phase: 'done',
      processedCount: documents.length,
      totalCount: documents.length,
      percent: 100,
      detail: basename(input.dumpPath)
    })

    return {
      ok: true,
      data: {
        dumpPath: input.dumpPath,
        documentCount: documents.length,
        writtenCount: write.writtenCount,
        skippedCount: write.skippedCount,
        collisionSamples: write.collisionSamples,
        sourceProjectId: loaded.data.sourceProjectId,
        writtenProjectId
      }
    }
  } catch (error) {
    const canceled = isCanceledError(error)
    logError('data_transfer:official', 'importOfficialDump failed', error)
    return {
      ok: false,
      error: canceled ? 'インポートをキャンセルしました' : errorMessage(error),
      canceled
    }
  }
}
