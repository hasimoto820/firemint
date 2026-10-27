import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { basename } from 'path'
import { ensureFirestoreWritable } from '@features/workspace/main/guard'
import { addEmulatorEntryAndLoad, getWorkspaceEntry } from '@features/workspace/main/service'
import { emulatorEntryId } from '@features/connection/shared/emulator'
import type {
  ImportFileInfoResult,
  ImportVerifyInput,
  ImportVerifyRow,
  OfficialImportInput,
  OfficialImportResult,
  OfficialImportSummary,
  OfficialImportValidationResult
} from '../../shared/official'
import type { ImportProjectProgress } from '../../shared/types'
import { collectionIdOf, typedFieldsEqual, type TypedDocument } from '../../shared/typed_value'
import { getFirestoreV1, getTypedFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { isCanceledError, throwIfCanceled } from '@shared/safety/canceled'
import { logError, logInfo } from '@shared/logging/logger'
import { fromSdkData } from '../typed/convert'
import { openImportSource, type ImportSource } from '../typed/source'
import { TypedBatchWriter } from '../typed/writer'

type ProgressReporter = (progress: ImportProjectProgress) => void

/** 詳細検証で、クラウドから 1 回に読む件数 */
const VERIFY_CHUNK = 100

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

const NO_SOURCE_PROJECT_MESSAGE =
  'ファイルから projectId が取れません。Emulator にプロジェクトとして入れられません。'

type WriteTarget = Pick<OfficialImportInput, 'projectId' | 'emulatorHost' | 'emulatorProjectId'>

/** Emulator に新しく作る時のプロジェクト ID。指定が無ければファイルのエクスポート元 */
function newEmulatorProjectId(target: WriteTarget, sourceProjectId: string | null): string {
  const id = target.emulatorProjectId?.trim() || sourceProjectId
  if (!id) {
    throw new Error(NO_SOURCE_PROJECT_MESSAGE)
  }
  return id
}

/** 書き込む先。選んだプロジェクトか、Emulator に新しく作るプロジェクト */
function previewWriteProjectId(target: WriteTarget, sourceProjectId: string | null): string {
  if (!target.emulatorHost) {
    return target.projectId
  }
  return emulatorEntryId(newEmulatorProjectId(target, sourceProjectId))
}

async function resolveWriteProjectId(
  target: WriteTarget,
  sourceProjectId: string | null
): Promise<string> {
  const writtenProjectId = previewWriteProjectId(target, sourceProjectId)
  if (!target.emulatorHost) {
    return writtenProjectId
  }
  if (getWorkspaceEntry(writtenProjectId) && isFirestoreConnected(writtenProjectId)) {
    return writtenProjectId
  }

  const projectId = newEmulatorProjectId(target, sourceProjectId)
  const added = await addEmulatorEntryAndLoad({
    projectId,
    host: target.emulatorHost,
    setFocused: true
  })

  if (!added.ok) {
    throw new Error(added.error)
  }

  logInfo(
    'data_transfer:import',
    `emulator new project host=${target.emulatorHost} id=${projectId} source=${sourceProjectId ?? '-'} pool=${added.data.id}`
  )

  return added.data.id
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function percentOf(processed: number, total: number, from: number, to: number): number {
  if (total <= 0) {
    return from
  }
  return Math.min(to, from + Math.round(((to - from) * processed) / total))
}

/** 1 回目: 件数を数える。見出しが無い・中身が無い時は、書き始める前に止める */
async function countSource(
  source: ImportSource,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<number> {
  let count = 0
  await source.forEach((entry) => {
    throwIfCanceled(signal)
    count += 1
    if (count === 1 || count % 1000 === 0) {
      onProgress?.({
        phase: 'counting',
        processedCount: count,
        totalCount: 0,
        percent: 5,
        detail: entry.kind === 'document' ? entry.document.path : entry.label
      })
    }
  })
  if (count === 0) {
    throw new Error('ファイルにドキュメントがありません')
  }
  return count
}

export async function selectOfficialDump(
  window: BrowserWindow | null
): Promise<{ canceled: boolean; filePath: string | null }> {
  const choice = window
    ? await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['ファイル（ZIP / JSONL）', 'フォルダ', 'キャンセル'],
        defaultId: 0,
        cancelId: 2,
        message: 'インポートするファイルを選ぶ',
        detail:
          '公式ダンプ（zip、またはコンソール / gcloud / Emulator のフォルダ）か、JSON（.jsonl）。'
      })
    : { response: 0 }

  if (choice.response === 2) {
    return { canceled: true, filePath: null }
  }

  const options =
    choice.response === 0
      ? {
          title: 'ファイルを選択',
          properties: ['openFile' as const],
          filters: [{ name: 'ZIP / JSONL', extensions: ['zip', 'jsonl'] }]
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

/** ファイルの形式と、エクスポート元のプロジェクトを読む（中身は読まない） */
export async function inspectImportFile(filePath: string): Promise<ImportFileInfoResult> {
  let source: ImportSource | null = null
  try {
    source = await openImportSource(filePath)
    return {
      ok: true,
      data: {
        filePath,
        format: source.format,
        sourceProjectId: source.sourceProjectId,
        scopeKind: source.scopeKind
      }
    }
  } catch (error) {
    logError('data_transfer:import', `inspectImportFile failed path=${filePath}`, error)
    return { ok: false, error: errorMessage(error, 'ファイルを読めませんでした') }
  } finally {
    await source?.close()
  }
}

/**
 * 検証（書かない）。コレクション ID ごとに、クラウドとファイルの件数を並べる。
 *   簡易  件数だけ
 *   詳細  ファイルのドキュメントをパスでクラウドから読んで比べ、側ごとの「だけ」の件数を出す
 */
export async function validateOfficialImport(
  input: ImportVerifyInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialImportValidationResult> {
  let source: ImportSource | null = null

  try {
    if (!input.emulatorHost) {
      ensureConnected(input.projectId)
    }
    onProgress?.({
      phase: 'extracting',
      processedCount: 0,
      totalCount: 0,
      percent: 2,
      detail: 'ファイルを開いています…'
    })
    source = await openImportSource(input.dumpPath)
    const totalCount = await countSource(source, onProgress, signal)

    const writtenProjectId = previewWriteProjectId(input, source.sourceProjectId)
    const canCheck =
      getWorkspaceEntry(writtenProjectId) !== null && isFirestoreConnected(writtenProjectId)
    const db = canCheck ? getTypedFirestore(writtenProjectId) : null
    const detailed = input.level === 'detailed' && db !== null

    const fileCount = new Map<string, number>()
    const fileOnly = new Map<string, number>()
    const matched = new Map<string, number>()
    const changed = new Map<string, number>()
    const add = (map: Map<string, number>, id: string): void => {
      map.set(id, (map.get(id) ?? 0) + 1)
    }

    let chunk: TypedDocument[] = []
    let processed = 0

    const compare = async (): Promise<void> => {
      if (!db || chunk.length === 0) {
        return
      }
      const snapshots = await db.getAll(...chunk.map((document) => db.doc(document.path)))
      chunk.forEach((document, index) => {
        const id = collectionIdOf(document.path)
        const snapshot = snapshots[index]
        if (!snapshot.exists) {
          add(fileOnly, id)
          return
        }
        add(matched, id)
        if (!typedFieldsEqual(document.fields, fromSdkData(snapshot.data() ?? {}))) {
          add(changed, id)
        }
      })
      chunk = []
    }

    await source.forEach(async (entry) => {
      throwIfCanceled(signal)
      processed += 1
      if (entry.kind === 'document') {
        add(fileCount, collectionIdOf(entry.document.path))
        if (detailed) {
          chunk.push(entry.document)
          if (chunk.length >= VERIFY_CHUNK) {
            await compare()
          }
        }
      }
      if (processed === 1 || processed % 200 === 0 || processed === totalCount) {
        onProgress?.({
          phase: 'validating',
          processedCount: processed,
          totalCount,
          percent: percentOf(processed, totalCount, 10, 90),
          detail: entry.kind === 'document' ? entry.document.path : entry.label
        })
      }
    })
    await compare()

    const ids = new Set(fileCount.keys())
    if (db && source.scopeKind === 'project') {
      for (const collection of await db.listCollections()) {
        ids.add(collection.id)
      }
    }

    const rows: ImportVerifyRow[] = []
    for (const id of ids) {
      throwIfCanceled(signal)
      const cloudTotal = db ? Number((await db.collectionGroup(id).count().get()).data().count) : 0
      const both = matched.get(id) ?? 0
      const diff = changed.get(id) ?? 0
      const fileTotal = fileCount.get(id)
      rows.push({
        collectionId: id,
        cloud:
          cloudTotal > 0
            ? { total: cloudTotal, only: detailed ? Math.max(0, cloudTotal - both) + diff : null }
            : null,
        file:
          fileTotal !== undefined
            ? { total: fileTotal, only: detailed ? (fileOnly.get(id) ?? 0) + diff : null }
            : null
      })
    }

    onProgress?.({
      phase: 'done',
      processedCount: totalCount,
      totalCount,
      percent: 100,
      detail: null
    })

    return {
      ok: true,
      data: {
        dumpPath: input.dumpPath,
        format: source.format,
        level: detailed ? 'detailed' : 'quick',
        documentCount: [...fileCount.values()].reduce((sum, count) => sum + count, 0),
        rows,
        changedCount: detailed
          ? [...changed.values()].reduce((sum, count) => sum + count, 0)
          : null,
        sourceProjectId: source.sourceProjectId,
        writtenProjectId
      }
    }
  } catch (error) {
    const canceled = isCanceledError(error)
    logError('data_transfer:import', 'validateOfficialImport failed', error)
    return {
      ok: false,
      error: canceled ? '検証をキャンセルしました' : errorMessage(error, '検証に失敗しました'),
      canceled
    }
  } finally {
    await source?.close()
  }
}

/**
 * インポート。1 回目に件数を数え、2 回目に書く。全体をメモリに載せない。
 *   追記    クラウドに無いドキュメントだけ作る。既にあるものは飛ばした件数
 *   上書き  ファイルにあるドキュメントを、ファイルの中身で丸ごと置き換える
 * 同じパスが 2 回以上出てきた時は、最初の行だけを書く。読めない行は書けなかった件数。
 */
export async function importOfficialDump(
  input: OfficialImportInput,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<OfficialImportResult> {
  const writeMode = input.writeMode ?? 'append'
  let source: ImportSource | null = null
  let summary: OfficialImportSummary | null = null
  let writer: TypedBatchWriter | null = null

  const snapshotSummary = (stoppedReason: string | null): OfficialImportSummary | null => {
    if (!summary || !writer) {
      return null
    }
    return { ...summary, ...writer.counts, stoppedReason }
  }

  try {
    throwIfCanceled(signal)
    onProgress?.({
      phase: 'extracting',
      processedCount: 0,
      totalCount: 0,
      percent: 2,
      detail: 'ファイルを開いています…'
    })
    source = await openImportSource(input.dumpPath)
    const totalCount = await countSource(source, onProgress, signal)

    const writtenProjectId = await resolveWriteProjectId(input, source.sourceProjectId)
    ensureConnected(writtenProjectId)
    ensureFirestoreWritable(writtenProjectId)

    logInfo(
      'data_transfer:import',
      `import format=${source.format} mode=${writeMode} selected=${input.projectId} written=${writtenProjectId} source=${source.sourceProjectId ?? '-'} entries=${totalCount} file=${input.dumpPath}`
    )

    summary = {
      dumpPath: input.dumpPath,
      format: source.format,
      writeMode,
      documentCount: totalCount,
      writtenCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedSamples: [],
      failedSamples: [],
      stoppedReason: null,
      sourceProjectId: source.sourceProjectId,
      writtenProjectId
    }
    const activeWriter = new TypedBatchWriter(getFirestoreV1(writtenProjectId), writeMode, signal)
    writer = activeWriter

    const seen = new Set<string>()
    let processed = 0

    await source.forEach(async (entry) => {
      throwIfCanceled(signal)
      processed += 1

      if (entry.kind === 'bad') {
        activeWriter.countFailed(entry.label)
      } else if (seen.has(entry.document.path)) {
        activeWriter.countSkipped(`${entry.document.path}（同じパスの 2 回目以降）`)
      } else {
        seen.add(entry.document.path)
        await activeWriter.add(entry.document)
      }

      if (processed === 1 || processed % 200 === 0 || processed === totalCount) {
        onProgress?.({
          phase: 'writing',
          processedCount: processed,
          totalCount,
          percent: percentOf(processed, totalCount, 10, 99),
          detail: entry.kind === 'document' ? entry.document.path : entry.label
        })
      }
    })
    await activeWriter.flush()

    onProgress?.({
      phase: 'done',
      processedCount: totalCount,
      totalCount,
      percent: 100,
      detail: basename(input.dumpPath)
    })

    return { ok: true, data: snapshotSummary(null) as OfficialImportSummary }
  } catch (error) {
    const canceled = isCanceledError(error)
    const message = canceled
      ? 'インポートをキャンセルしました'
      : errorMessage(error, 'インポートに失敗しました')
    logError('data_transfer:import', 'importOfficialDump failed', error)
    return {
      ok: false,
      error: message,
      canceled,
      partial: snapshotSummary(message) ?? undefined
    }
  } finally {
    await source?.close()
  }
}
