import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logJob } from '@shared/logging/job_logger'
import { logError, logInfo } from '@shared/logging/logger'
import { formatUnavailableFirestoreMessage } from '@shared/firestore/native_check'
import { isCanceledError } from '@shared/safety/canceled'
import type { OfficialExportProgress } from '@features/data_transfer/shared/official'
import type { TransportProgress } from '@features/transport/shared/types'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import {
  promptIncludeSubcollections
} from '@features/data_transfer/main/service'
import { importOfficialDump } from '@features/data_transfer/main/official/write_dump'
import {
  chooseOfficialExportZipPath,
  exportOfficialDump
} from '@features/data_transfer/main/official/export_dump'
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
  lastLoggedPhase: string | null
  lastLoggedPercent: number
}

let active: ActiveJob | null = null
let jobSeq = 0

const UI_LOG_LIMIT = 400

function createJobId(): string {
  jobSeq += 1
  return `imp-exp-${Date.now()}-${jobSeq}`
}

function jobTitle(input: StartScriptJobInput): string {
  switch (input.kind) {
    case 'export_collection':
      return `Export · Collection · ${input.collectionPath}`
    case 'export_group':
      return `Export · Group · ${input.collectionId}`
    case 'export_project':
      return `Export · Project · ${input.projectId}`
    case 'import_official':
      return `Import · ${input.projectId}`
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
    logs: [...active.snapshot.logs, line].slice(-UI_LOG_LIMIT)
  }
  logJob(level === 'error' ? 'error' : 'info', message, { jobId: active.snapshot.id })
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

/** 進捗を画面詳細とログの両方へ。フェーズ切替 or 約10%ごと。 */
function logProgressLine(
  phase: string,
  percent: number,
  detail: string,
  writtenCount?: number | null
): void {
  if (!active) {
    return
  }

  const phaseChanged = active.lastLoggedPhase !== phase
  const percentJump = percent - active.lastLoggedPercent >= 10
  const forceEnd = percent >= 100

  if (!phaseChanged && !percentJump && !forceEnd && active.lastLoggedPhase != null) {
    applyProgress(percent, detail, writtenCount)
    return
  }

  active.lastLoggedPhase = phase
  active.lastLoggedPercent = percent
  applyProgress(percent, detail, writtenCount)
  appendLog('info', detail)
  broadcast()
}

function onOfficialExportProgress(progress: OfficialExportProgress): void {
  const suffix = progress.detail ? ` / ${progress.detail}` : ''
  const detail = `${progress.phase} ${progress.processedCount} 件${suffix}`
  logProgressLine(progress.phase, progress.percent, detail)
}

function onTransportProgress(progress: TransportProgress): void {
  const detail = progress.detail
    ? `${progress.phase} ${progress.processedCount} 件 / 書込 ${progress.writtenCount} / スキップ ${progress.skippedCount} / ${progress.detail}`
    : `${progress.phase} ${progress.processedCount} 件 / 書込 ${progress.writtenCount} / スキップ ${progress.skippedCount}`
  logProgressLine(progress.phase, progress.percent, detail, progress.writtenCount)
}

function onImportProgress(progress: ImportProjectProgress): void {
  const written =
    progress.phase === 'writing' || progress.phase === 'done'
      ? progress.processedCount
      : undefined
  const total = progress.totalCount > 0 ? `/${progress.totalCount}` : ''
  const detail = progress.detail
    ? `${progress.phase} ${progress.processedCount}${total} / ${progress.detail}`
    : `${progress.phase} ${progress.processedCount}${total}`
  logProgressLine(progress.phase, progress.percent, detail, written)
}

function appendCollisionSamples(samples: string[], reason: string): void {
  if (samples.length === 0) {
    return
  }

  appendLog('info', `${reason}: ${samples.length} 件（例）`)
  for (const path of samples) {
    appendLog('info', `  skip ${path}`)
  }
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
      const result = await exportOfficialDump(
        {
          projectId: input.projectId,
          kind: 'collection',
          collectionPath: input.collectionPath,
          includeSubcollections: input.includeSubcollections,
          filePath
        },
        onOfficialExportProgress,
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
    case 'export_group': {
      if (!filePath) {
        throw new Error('保存先がありません')
      }
      const result = await exportOfficialDump(
        {
          projectId: input.projectId,
          kind: 'group',
          collectionId: input.collectionId,
          filePath
        },
        onOfficialExportProgress,
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
    case 'export_project': {
      if (!filePath && !input.filePath) {
        throw new Error('保存先がありません')
      }
      const result = await exportOfficialDump(
        {
          projectId: input.projectId,
          kind: 'project',
          rootCollectionIds: input.rootCollectionIds,
          includeSubcollections: input.includeSubcollections,
          filePath: filePath ?? input.filePath
        },
        onOfficialExportProgress,
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
    case 'import_official': {
      const result = await importOfficialDump(input, onImportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: `成功 ${result.data.writtenCount} / スキップ ${result.data.skippedCount} → ${result.data.writtenProjectId}`
      })
      appendLog(
        'info',
        `プロジェクト ${result.data.sourceProjectId ?? '-'} → ${result.data.writtenProjectId}`
      )
      appendCollisionSamples(result.data.collisionSamples, '既存のためスキップ')
      return
    }
    case 'transport': {
      const result = await transportDocuments(input, onTransportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: `成功 ${result.data.writtenCount} / スキップ ${result.data.skippedCount} / 対象 ${result.data.documentCount}`
      })
      appendCollisionSamples(result.data.collisionSamples, '既存のためスキップ')
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
    appendLog('info', `完了: ${active.snapshot.resultSummary}`)
  }

  appendLog('info', `---- job end status=${status} id=${active.snapshot.id} ----`)

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

    filePath = await chooseOfficialExportZipPath(window, {
      projectId: input.projectId,
      kind: 'collection',
      collectionPath: input.collectionPath,
      includeSubcollections
    })
    if (!filePath) {
      return { ok: false, error: '保存をキャンセルしました', canceled: true }
    }
  }

  if (input.kind === 'export_group' && !input.filePath) {
    filePath = await chooseOfficialExportZipPath(window, {
      projectId: input.projectId,
      kind: 'group',
      collectionId: input.collectionId
    })
    if (!filePath) {
      return { ok: false, error: '保存をキャンセルしました', canceled: true }
    }
  }

  if (input.kind === 'export_project' && !input.filePath) {
    filePath = await chooseOfficialExportZipPath(window, {
      projectId: input.projectId,
      kind: 'project',
      rootCollectionIds: input.rootCollectionIds
    })
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
  active = {
    abort,
    snapshot,
    lastLoggedPhase: null,
    lastLoggedPercent: -1
  }
  appendLog('info', `---- job start id=${snapshot.id} ----`)
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

      const raw = error instanceof Error ? error.message : 'Import / Export に失敗しました'
      const message = formatUnavailableFirestoreMessage(raw) ?? raw
      logError('script_runner', `job failed id=${snapshot.id}`, error)
      finishJob('failed', message)
    })

  return { ok: true, data: { id: snapshot.id } }
}
