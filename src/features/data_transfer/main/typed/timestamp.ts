/** タイムスタンプ（秒 + ナノ秒）と ISO 8601 の文字列の行き来。マイクロ秒より細かい桁も落とさない */

const NANOS_PER_SECOND = 1_000_000_000n

export function timestampToIso(seconds: string, nanos: number): string {
  const base = new Date(Number(BigInt(seconds)) * 1000).toISOString().slice(0, 19)
  if (nanos === 0) {
    return `${base}Z`
  }
  const fraction = nanos.toString().padStart(9, '0').replace(/0+$/, '')
  return `${base}.${fraction}Z`
}

/** 読めない時は null */
export function isoToTimestamp(iso: string): { seconds: string; nanos: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    iso.trim()
  )
  if (!match) {
    return null
  }
  const millis = Date.parse(`${match[1]}${match[3]}`)
  if (Number.isNaN(millis)) {
    return null
  }
  return {
    seconds: (BigInt(millis) / 1000n).toString(),
    nanos: Number((match[2] ?? '').padEnd(9, '0') || '0')
  }
}

export function timestampToMicros(seconds: string, nanos: number): bigint {
  return BigInt(seconds) * 1_000_000n + BigInt(Math.floor(nanos / 1000))
}

export function microsToTimestamp(micros: bigint): { seconds: string; nanos: number } {
  const totalNanos = micros * 1000n
  let seconds = totalNanos / NANOS_PER_SECOND
  let nanos = totalNanos % NANOS_PER_SECOND
  if (nanos < 0n) {
    seconds -= 1n
    nanos += NANOS_PER_SECOND
  }
  return { seconds: seconds.toString(), nanos: Number(nanos) }
}
