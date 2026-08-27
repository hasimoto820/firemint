import { appendJobLogLine } from './file_sink'
import { sanitizeLogText } from './sanitize'

type JobLogLevel = 'info' | 'warn' | 'error'

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

/** 操作ログ（firemint_job_*）。アプリログとは混ぜない。 */
export function logJob(
  level: JobLogLevel,
  message: string,
  options?: { jobId?: string }
): void {
  const stamp = formatTimestamp()
  const job = options?.jobId ? ` job=${options.jobId}` : ''
  appendJobLogLine(`${stamp} ${level.toUpperCase()}${job} ${sanitizeLogText(message)}`)
}
