export class CanceledError extends Error {
  readonly canceled = true as const

  constructor(message = 'canceled') {
    super(message)
    this.name = 'CanceledError'
  }
}

export function throwIfCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CanceledError()
  }
}

export function isCanceledError(error: unknown): boolean {
  return error instanceof CanceledError
}
