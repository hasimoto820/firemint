import { appendAppLogLine } from './file_sink'
import { sanitizeLogText } from './sanitize'

type LogLevel = 'info' | 'warn' | 'error'

function formatTimestamp(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}.${ms}`
}

/** ファイル用。スタック（絶対パスだらけ）は出さない。message + code のみ。 */
function fileDetailLines(tag: string, detail: unknown): string[] {
  const prefix = `[firemint:${tag}]`

  if (detail instanceof Error) {
    const lines = [`${prefix} error.message: ${sanitizeLogText(detail.message)}`]
    const code = (detail as Error & { code?: unknown }).code
    if (code !== undefined) {
      lines.push(`${prefix} error.code: ${String(code)}`)
    }
    return lines
  }

  if (typeof detail === 'object' && detail !== null && 'code' in detail) {
    return [
      `${prefix} detail.code: ${String((detail as { code: unknown }).code)}`,
      `${prefix} detail: ${sanitizeLogText(safeStringify(detail))}`
    ]
  }

  return [`${prefix} detail: ${sanitizeLogText(safeStringify(detail))}`]
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: LogLevel, tag: string, message: string, detail?: unknown): void {
  const safeMessage = sanitizeLogText(message)
  const line = `[firemint:${tag}] ${safeMessage}`
  const stamp = formatTimestamp()

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }

  appendAppLogLine(`${stamp} ${level.toUpperCase()} ${line}`)

  if (detail !== undefined) {
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

    if (detail instanceof Error) {
      logFn(`[firemint:${tag}] error.message:`, sanitizeLogText(detail.message))
      const code = (detail as Error & { code?: unknown }).code
      if (code !== undefined) {
        logFn(`[firemint:${tag}] error.code:`, code)
      }
      // スタックはローカル console のみ（ファイルには書かない）
      if (detail.stack) {
        logFn(`[firemint:${tag}] error.stack:`, detail.stack)
      }
    } else if (typeof detail === 'object' && detail !== null && 'code' in detail) {
      logFn(`[firemint:${tag}] detail.code:`, (detail as { code: unknown }).code)
      logFn(`[firemint:${tag}] detail:`, detail)
    } else {
      logFn(`[firemint:${tag}] detail:`, detail)
    }

    for (const extra of fileDetailLines(tag, detail)) {
      appendAppLogLine(`${stamp} ${level.toUpperCase()} ${extra}`)
    }
  }
}

export function logInfo(tag: string, message: string, detail?: unknown): void {
  write('info', tag, message, detail)
}

export function logWarn(tag: string, message: string, detail?: unknown): void {
  write('warn', tag, message, detail)
}

export function logError(tag: string, message: string, detail?: unknown): void {
  write('error', tag, message, detail)
}
