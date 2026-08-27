import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { basename, join } from 'path'
import { app } from 'electron'
import {
  LOGS_DIR_NAME,
  LOG_MAX_BYTES,
  LOG_RETENTION_DAYS,
  logPrefixForKind,
  type LogFileKind
} from './log_policy'

type ActiveFile = {
  date: string
  path: string
}

let ready = false
const pending: Array<{ kind: LogFileKind; line: string }> = []
const activeByKind: Partial<Record<LogFileKind, ActiveFile>> = {}

export function getLogsDir(): string {
  return join(app.getPath('userData'), LOGS_DIR_NAME)
}

function localDateString(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function segmentPath(kind: LogFileKind, date: string, segment: number): string {
  const prefix = logPrefixForKind(kind)
  const name = segment <= 1 ? `${prefix}_${date}.log` : `${prefix}_${date}_${segment}.log`
  return join(getLogsDir(), name)
}

function parseSegment(kind: LogFileKind, date: string, fileName: string): number | null {
  const prefix = logPrefixForKind(kind)
  const base = `${prefix}_${date}.log`
  if (fileName === base) {
    return 1
  }

  const match = fileName.match(new RegExp(`^${prefix}_${date}_(\\d+)\\.log$`))
  if (!match) {
    return null
  }

  const segment = Number(match[1])
  return Number.isFinite(segment) && segment >= 2 ? segment : null
}

function highestSegment(kind: LogFileKind, date: string): number {
  let highest = 0
  try {
    for (const name of readdirSync(getLogsDir())) {
      const segment = parseSegment(kind, date, name)
      if (segment != null && segment > highest) {
        highest = segment
      }
    }
  } catch {
    return 0
  }

  return highest
}

function resolveWritePath(kind: LogFileKind): string {
  const date = localDateString()
  const cached = activeByKind[kind]

  if (cached?.date === date) {
    try {
      if (statSync(cached.path).size < LOG_MAX_BYTES) {
        return cached.path
      }
    } catch {
      // recreate below
    }

    const currentSegment = parseSegment(kind, date, basename(cached.path)) ?? 1
    const next = segmentPath(kind, date, currentSegment + 1)
    activeByKind[kind] = { date, path: next }
    return next
  }

  const highest = highestSegment(kind, date)
  if (highest === 0) {
    const path = segmentPath(kind, date, 1)
    activeByKind[kind] = { date, path }
    return path
  }

  const latest = segmentPath(kind, date, highest)
  try {
    if (statSync(latest).size < LOG_MAX_BYTES) {
      activeByKind[kind] = { date, path: latest }
      return latest
    }
  } catch {
    // fall through
  }

  const next = segmentPath(kind, date, highest + 1)
  activeByKind[kind] = { date, path: next }
  return next
}

function daysBetween(isoDate: string, today: string): number | null {
  const a = Date.parse(`${isoDate}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null
  }

  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

export function purgeOldLogFiles(): void {
  const dir = getLogsDir()
  const today = localDateString()
  const pattern = /^(firemint_app|firemint_job)_(\d{4}-\d{2}-\d{2})(?:_\d+)?\.log$/

  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }

  for (const name of names) {
    const match = name.match(pattern)
    if (!match) {
      continue
    }

    const age = daysBetween(match[2], today)
    if (age == null || age < LOG_RETENTION_DAYS) {
      continue
    }

    try {
      unlinkSync(join(dir, name))
    } catch {
      // ignore
    }
  }
}

function writeLine(kind: LogFileKind, line: string): void {
  const path = resolveWritePath(kind)
  appendFileSync(path, `${line}\n`, 'utf-8')
}

export function appendAppLogLine(line: string): void {
  if (!ready) {
    pending.push({ kind: 'app', line })
    return
  }

  try {
    writeLine('app', line)
  } catch {
    // file failures must not break the app
  }
}

export function appendJobLogLine(line: string): void {
  if (!ready) {
    pending.push({ kind: 'job', line })
    return
  }

  try {
    writeLine('job', line)
  } catch {
    // ignore
  }
}

/** main 起動時。userData/logs を作り、古いファイルを掃除してから追記を開始する。 */
export function initFileLogging(): string {
  const dir = getLogsDir()
  mkdirSync(dir, { recursive: true })
  purgeOldLogFiles()
  ready = true

  for (const item of pending.splice(0, pending.length)) {
    try {
      writeLine(item.kind, item.line)
    } catch {
      // ignore
    }
  }

  return dir
}
