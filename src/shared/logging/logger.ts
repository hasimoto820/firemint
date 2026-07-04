type LogLevel = 'info' | 'warn' | 'error'

function write(level: LogLevel, tag: string, message: string, detail?: unknown): void {
  const line = `[firemint:${tag}] ${message}`

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }

  if (detail !== undefined) {
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

    if (detail instanceof Error) {
      logFn(`[firemint:${tag}] error.message:`, detail.message)
      if (detail.stack) {
        logFn(`[firemint:${tag}] error.stack:`, detail.stack)
      }
      const code = (detail as Error & { code?: unknown }).code
      if (code !== undefined) {
        logFn(`[firemint:${tag}] error.code:`, code)
      }
      return
    }

    if (typeof detail === 'object' && detail !== null && 'code' in detail) {
      logFn(`[firemint:${tag}] detail.code:`, (detail as { code: unknown }).code)
    }

    logFn(`[firemint:${tag}] detail:`, detail)
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
