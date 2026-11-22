import { tr } from '@shared/i18n/shared/current'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logJob } from '@shared/logging/job_logger'
import { logError, logInfo } from '@shared/logging/logger'
import { formatUnavailableFirestoreMessage } from '@shared/firestore/native_check'
import { isCanceledError } from '@shared/safety/canceled'
import type { OfficialExportProgress } from '@features/data_transfer/shared/official'
import type { TransportProgress } from '@features/transport/shared/types'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import { promptIncludeSubcollections } from '@features/data_transfer/main/service'
import { importOfficialDump } from '@features/data_transfer/main/official/write_dump'
import { exportOfficialDump } from '@features/data_transfer/main/official/export_dump'
import type {
  OfficialExportInput,
  OfficialImportSummary
} from '@features/data_transfer/shared/official'
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
      return input.emulatorHost
        ? `Import · Emulator ${input.emulatorProjectId || input.emulatorHost}`
        : `Import · ${input.projectId}`
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

function applyProgress(percent: number, detail: string | null, writtenCount?: number | null): void {
  if (!active) {
    return
  }

  patchSnapshot({
    percent,
    detail,
    writtenCount: writtenCount !== undefined ? writtenCount : active.snapshot.writtenCount
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
  const detail = `${progress.phase} ${tr('sr.count', { count: progress.processedCount })}${suffix}`
  logProgressLine(progress.phase, progress.percent, detail)
}

function onTransportProgress(progress: TransportProgress): void {
  const detail = progress.detail
    ? `${progress.phase} ${tr('sr.write_progress', { count: progress.processedCount, written: progress.writtenCount, skipped: progress.skippedCount })} / ${progress.detail}`
    : `${progress.phase} ${tr('sr.write_progress', { count: progress.processedCount, written: progress.writtenCount, skipped: progress.skippedCount })}`
  logProgressLine(progress.phase, progress.percent, detail, progress.writtenCount)
}

function onImportProgress(progress: ImportProjectProgress): void {
  const written =
    progress.phase === 'writing' || progress.phase === 'done' ? progress.processedCount : undefined
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

  appendLog('info', tr('sr.samples', { reason, count: samples.length }))
  for (const path of samples) {
    appendLog('info', `  skip ${path}`)
  }
}

async function runExport(input: OfficialExportInput, signal: AbortSignal): Promise<void> {
  const result = await exportOfficialDump(input, onOfficialExportProgress, signal)
  if (!result.ok) {
    throw Object.assign(new Error(result.error), { canceled: result.canceled })
  }
  patchSnapshot({
    resultSummary: tr('sr.exported', {
      count: result.data.documentCount,
      path: result.data.filePath
    })
  })
}

/** 書いた / 飛ばした / 書けなかった件数と、途中で止まった理由 */
function reportImportSummary(summary: OfficialImportSummary): void {
  const mode = summary.writeMode === 'overwrite' ? tr('dt.overwrite') : tr('dt.append')
  patchSnapshot({
    writtenCount: summary.writtenCount,
    resultSummary: `${mode}: ${tr('sr.import_counts', { written: summary.writtenCount, skipped: summary.skippedCount, failed: summary.failedCount })} → ${summary.writtenProjectId}`
  })
  appendLog(
    'info',
    tr('sr.project_flow', {
      source: summary.sourceProjectId ?? '-',
      target: summary.writtenProjectId,
      mode
    })
  )
  appendLog(
    'info',
    `${tr('sr.import_counts', { written: summary.writtenCount, skipped: summary.skippedCount, failed: summary.failedCount })}${tr('sr.file_total', { count: summary.documentCount })}`
  )
  appendCollisionSamples(summary.skippedSamples, tr('sr.skipped'))
  if (summary.failedSamples.length > 0) {
    appendLog('error', tr('sr.failed_samples', { count: summary.failedCount }))
    for (const label of summary.failedSamples) {
      appendLog('error', `  fail ${label}`)
    }
  }
  if (summary.stoppedReason) {
    appendLog('error', tr('sr.stopped_reason', { reason: summary.stoppedReason }))
  }
}

async function runJob(input: StartScriptJobInput, signal: AbortSignal): Promise<void> {
  switch (input.kind) {
    case 'export_collection':
      return runExport(
        {
          projectId: input.projectId,
          kind: 'collection',
          format: input.format,
          collectionPath: input.collectionPath,
          includeSubcollections: input.includeSubcollections,
          directory: input.directory,
          fileName: input.fileName,
          filePath: input.filePath
        },
        signal
      )
    case 'export_group':
      return runExport(
        {
          projectId: input.projectId,
          kind: 'group',
          format: input.format,
          collectionId: input.collectionId,
          directory: input.directory,
          fileName: input.fileName,
          filePath: input.filePath
        },
        signal
      )
    case 'export_project':
      return runExport(
        {
          projectId: input.projectId,
          kind: 'project',
          format: input.format,
          rootCollectionIds: input.rootCollectionIds,
          includeSubcollections: input.includeSubcollections,
          directory: input.directory,
          fileName: input.fileName,
          filePath: input.filePath
        },
        signal
      )
    case 'import_official': {
      const result = await importOfficialDump(input, onImportProgress, signal)
      if (!result.ok) {
        if (result.partial) {
          reportImportSummary(result.partial)
        }
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      reportImportSummary(result.data)
      return
    }
    case 'transport': {
      const result = await transportDocuments(input, onTransportProgress, signal)
      if (!result.ok) {
        throw Object.assign(new Error(result.error), { canceled: result.canceled })
      }
      patchSnapshot({
        writtenCount: result.data.writtenCount,
        resultSummary: tr('sr.transport_summary', {
          written: result.data.writtenCount,
          skipped: result.data.skippedCount,
          total: result.data.documentCount
        })
      })
      appendCollisionSamples(result.data.collisionSamples, tr('sr.skipped_existing'))
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
      appendLog('error', tr('sr.canceled_written', { count: writtenCount }))
    } else {
      appendLog('info', tr('sr.canceled'))
    }
  } else if (status === 'failed') {
    if (writtenCount && writtenCount > 0) {
      appendLog('error', tr('sr.failed_written', { count: writtenCount }))
    }
    if (error) {
      appendLog('error', error)
    }
  } else if (active.snapshot.resultSummary) {
    appendLog('info', tr('sr.done', { summary: active.snapshot.resultSummary }))
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
  appendLog('info', tr('sr.cancel_requested'))
  broadcast()
  return { ok: true }
}

export async function startScriptJob(
  input: StartScriptJobInput,
  window: BrowserWindow | null
): Promise<StartScriptJobResult> {
  if (isJobRunning()) {
    return { ok: false, error: tr('sr.busy'), busy: true }
  }

  let resolvedInput = input

  if (input.kind === 'export_collection' && input.includeSubcollections === undefined) {
    const prompt = await promptIncludeSubcollections(window, input.collectionPath)
    if (prompt.canceled) {
      return { ok: false, error: tr('diff.save_canceled'), canceled: true }
    }
    resolvedInput = { ...input, includeSubcollections: prompt.includeSubcollections }
  }

  if (isJobRunning()) {
    return { ok: false, error: tr('sr.busy'), busy: true }
  }

  const abort = new AbortController()
  const snapshot: ScriptJobSnapshot = {
    id: createJobId(),
    kind: resolvedInput.kind,
    status: 'running',
    title: jobTitle(resolvedInput),
    percent: 0,
    detail: tr('sr.starting'),
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
  appendLog('info', tr('sr.started', { title: snapshot.title }))
  broadcast()
  logInfo('script_runner', `start kind=${resolvedInput.kind} id=${snapshot.id}`)

  void runJob(resolvedInput, abort.signal)
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

      const raw = error instanceof Error ? error.message : tr('sr.err_failed')
      const message = formatUnavailableFirestoreMessage(raw) ?? raw
      logError('script_runner', `job failed id=${snapshot.id}`, error)
      finishJob('failed', message)
    })

  return { ok: true, data: { id: snapshot.id } }
}
