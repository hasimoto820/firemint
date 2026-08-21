import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logError, logInfo } from '@shared/logging/logger'
import { isCanceledError } from '@shared/safety/canceled'
import type {
  ExportCollectionProgress,
  ExportProjectProgress,
  ImportCollectionProgress,
  ImportProjectProgress
} from '@features/data_transfer/shared/types'
import type { TransportProgress } from '@features/transport/shared/types'
import {
  collectionExportDefaultFileName,
  promptIncludeSubcollections,
  selectCollectionExportJsonPath,
  writeCollectionJsonToFile
} from '@features/data_transfer/main/service'
import { importCollectionJson } from '@features/data_transfer/main/import_service'
import {
  chooseProjectExportZipPath,
  exportProject
} from '@features/data_transfer/main/project_export_service'
import { importProject } from '@features/data_transfer/main/project_import_service'
import { transportDocuments } from '@features/transport/main/service'
import type {
  ScriptJobLogLine,
  ScriptJobSnapshot,
  StartScriptJobInput,
  StartScriptJobResult
} from '@features/script_runner/shared/types'

type ActiveJob = {
  abort: AbortController
  snapshot: ScriptJobSnapshot
}

let active: ActiveJob | null = null
let jobSeq = 0

function createJobId(): string {
  jobSeq += 1
  return `imp-exp-${Date.now()}-${jobSeq}`
}

function jobTitle(input: StartScriptJobInput): string {
  switch (input.kind) {
    case 'export_collection':
      return `Export · Collection · ${input.collectionPath}`
    case 'import_collection':
      return `Import · Collection · ${input.collectionPath}`
    case 'export_project':
      return `Export · Project · ${input.projectId}`
    case 'import_project':
      return `Import · Project · ${input.projectId}`
    case 'transport':
      return `Transport · ${input.target} · ${input.sourceProjectId} → ${input.destinationProjectId}`
  }
}

function broadcast(): void {
  if (!active) {
    return
  }

  const payload = active.snapshot
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.SCRIPT_RUNNER_SNAPSHOT, payload)
    }
  }
}

function appendLog(level: ScriptJobLogLine['level'], message: string): void {
  if (!active) {
    return
  }

  const line: ScriptJobLogLine = {
    at: new Date().toISOString(),
    level,
    message
  }
  active.snapshot = {
    ...active.snapshot,
    logs: [...active.snapshot.logs, line].slice(-200)
  }
}

function patchSnapshot(patch: Partial<ScriptJobSnapshot>): void {
  if (!active) {
    return
  }

  active.snapshot = { ...active.snapshot, ...patch }
  broadcast()
}

function applyProgress(
  percent: number,
  detail: string | null,
  writtenCount?: number | null
): void {
  if (!active) {
    return
  }

  patchSnapshot({
    percent,
    detail,
    writtenCount:
      writtenCount !== undefined ? writtenCount : active.snapshot.writtenCount
  })
}

function onCollectionExportProgress(progress: ExportCollectionProgress): void {
  const detail =
    progress.phase === 'writing'
      ? `書き出し中 ${progress.documentCount} 件`
      : progress.phase === 'done'
        ? `完了 ${progress.documentCount} 件`
        : `${progress.documentCount} 件 / ${progress.currentCollectionPath ?? '—'}`
  applyProgress(progress.percent, detail)
}

function onProjectExportProgress(progress: ExportProjectProgress): void {
  const detail =
    progress.phase === 'zipping'
      ? `ZIP 作成中…（${progress.documentCount} 件）`
      : progress.phase === 'done'
        ? `完了 ${progress.documentCount} 件`
        : `${progress.documentCount} 件 / ${progress.currentCollectionPath ?? '—'}`
  applyProgress(progress.percent, detail)
}

function onTransportProgress(progress: TransportProgress): void {
  const detail = progress.detail
    ? `${progress.phase} ${progress.processedCount} 件 / 書込 ${progress.writtenCount} / スキップ ${progress.skippedCount} / ${progress.detail}`
    : `${progress.phase} ${progress.processedCount} 件 / 書込 ${progress.writtenCount} / スキップ ${progress.skippedCount}`
  applyProgress(progress.percent, detail, progress.writtenCount)
}

function onImportProgress(
  progress: ImportCollectionProgress | ImportProjectProgress
): void {
  const written =
    progress.phase === 'writing' || progress.phase === 'done'
      ? progress.processedCount
      : undefined
  const detail = progress.detail
    ? `${progress.phase} ${progress.processedCount}/${progress.totalCount} / ${progress.detail}`
    : `${progress.phase} ${progress.processedCount}/${progress.totalCount}`
  applyProgress(progress.percent, detail, written)
}

async function runJob(
  input: StartScriptJobInput,
  filePath: string | null,
  signal: AbortSignal
): Promise<void> {
  switch (input.kind) {
    case 'export_collection': {
      if (!filePath) {
        throw new Error('保存先がありません')
      }
      const result = await writeCollectionJsonToFile(
        input,
        filePath,
        onCollectionExportProgress,
        signal
      )
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        resultSummary: `${result.data.documentCount} 件を ${result.data.filePath} に保存しました`
      })
      return
    }
    case 'import_collection': {
      const result = await importCollectionJson(input, onImportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: `${result.data.writtenCount} 件をインポートしました${
          result.data.skippedCollisionCount > 0
            ? ` / スキップ ${result.data.skippedCollisionCount} 件`
            : ''
        }`
      })
      if (result.data.collisionSamples.length > 0) {
        appendLog('info', `スキップ例: ${result.data.collisionSamples.join(', ')}`)
      }
      return
    }
    case 'export_project': {
      const result = await exportProject(
        { ...input, filePath: filePath ?? input.filePath },
        null,
        onProjectExportProgress,
        signal
      )
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        resultSummary: `${result.data.documentCount} 件を ${result.data.filePath} に保存しました`
      })
      return
    }
    case 'import_project': {
      const result = await importProject(input, onImportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: `${result.data.writtenCount} 件をインポートしました${
          result.data.skippedCount > 0 ? ` / スキップ ${result.data.skippedCount} 件` : ''
        }`
      })
      if (result.data.collisionSamples.length > 0) {
        appendLog('info', `スキップ例: ${result.data.collisionSamples.join(', ')}`)
      }
      return
    }
    case 'transport': {
      const result = await transportDocuments(input, onTransportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      const skipNote =
        result.data.skippedCount > 0 ? ` / スキップ ${result.data.skippedCount} 件` : ''
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: `${result.data.writtenCount} 件をコピーしました${skipNote}`
      })
      if (result.data.collisionSamples.length > 0) {
        appendLog(
          'info',
          `スキップ例: ${result.data.collisionSamples.join(', ')}`
        )
      }
      return
    }
  }
}

function finishJob(status: ScriptJobSnapshot['status'], error: string | null): void {
  if (!active) {
    return
  }

  const writtenCount = active.snapshot.writtenCount
  if (status === 'canceled') {
    if (writtenCount && writtenCount > 0) {
      appendLog(
        'error',
        `中止しました。Firestore に書いた分は残っています（${writtenCount} 件）。ロールバックできません。`
      )
    } else {
      appendLog('info', '中止しました')
    }
  } else if (status === 'failed') {
    if (writtenCount && writtenCount > 0) {
      appendLog(
        'error',
        `失敗しました。Firestore に書いた分は残っています（${writtenCount} 件）。ロールバックできません。`
      )
    }
    if (error) {
      appendLog('error', error)
    }
  } else if (active.snapshot.resultSummary) {
    appendLog('info', active.snapshot.resultSummary)
  }

  patchSnapshot({
    status,
    error,
    percent: status === 'succeeded' ? 100 : active.snapshot.percent
  })
}

function isJobRunning(): boolean {
  return active?.snapshot.status === 'running'
}

export function getScriptJobSnapshot(): ScriptJobSnapshot | null {
  return active?.snapshot ?? null
}

export function cancelScriptJob(): { ok: true } {
  if (!isJobRunning() || !active) {
    return { ok: true }
  }

  active.abort.abort()
  appendLog('info', '中止を要求しました')
  broadcast()
  return { ok: true }
}

export async function startScriptJob(
  input: StartScriptJobInput,
  window: BrowserWindow | null
): Promise<StartScriptJobResult> {
  if (isJobRunning()) {
    return { ok: false, error: '別の Import / Export が実行中です', busy: true }
  }

  let filePath: string | null = null
  let resolvedInput = input

  if (input.kind === 'export_collection') {
    let includeSubcollections = input.includeSubcollections ?? false
    if (input.includeSubcollections === undefined) {
      const prompt = await promptIncludeSubcollections(window, input.collectionPath)
      if (prompt.canceled) {
        return { ok: false, error: '保存をキャンセルしました', canceled: true }
      }
      includeSubcollections = prompt.includeSubcollections
      resolvedInput = { ...input, includeSubcollections }
    }

    filePath = await selectCollectionExportJsonPath(
      window,
      collectionExportDefaultFileName(input.collectionPath, includeSubcollections)
    )
    if (!filePath) {
      return { ok: false, error: '保存をキャンセルしました', canceled: true }
    }
  }

  if (input.kind === 'export_project' && !input.filePath) {
    filePath = await chooseProjectExportZipPath(window, input.projectId)
    if (!filePath) {
      return { ok: false, error: '保存をキャンセルしました', canceled: true }
    }
  }

  if (isJobRunning()) {
    return { ok: false, error: '別の Import / Export が実行中です', busy: true }
  }

  const abort = new AbortController()
  const snapshot: ScriptJobSnapshot = {
    id: createJobId(),
    kind: resolvedInput.kind,
    status: 'running',
    title: jobTitle(resolvedInput),
    percent: 0,
    detail: '開始…',
    logs: [],
    error: null,
    resultSummary: null,
    writtenCount: null
  }
  active = { abort, snapshot }
  appendLog('info', `${snapshot.title} を開始しました`)
  broadcast()
  logInfo('script_runner', `start kind=${resolvedInput.kind} id=${snapshot.id}`)

  void runJob(resolvedInput, filePath, abort.signal)
    .then(() => {
      finishJob('succeeded', null)
    })
    .catch((error: unknown) => {
      const canceled =
        abort.signal.aborted ||
        isCanceledError(error) ||
        (typeof error === 'object' &&
          error !== null &&
          'canceled' in error &&
          Boolean((error as { canceled?: boolean }).canceled))
      if (canceled) {
        finishJob('canceled', null)
        return
      }

      const message = error instanceof Error ? error.message : 'Import / Export に失敗しました'
      logError('script_runner', `job failed id=${snapshot.id}`, error)
      finishJob('failed', message)
    })

  return { ok: true, data: { id: snapshot.id } }
}
