export const DEFAULT_EMULATOR_HOST = '127.0.0.1:8080'
export const DEFAULT_EMULATOR_HUB = '127.0.0.1:4400'

/** 画面上は空でよい。SDK と左ツリーに渡すときの仮の projectId。demo-firemint は使わない。 */
export const EMPTY_EMULATOR_PROJECT_ID = 'emulator'

export function resolveEmulatorProjectId(raw: string): string {
  const id = raw.trim()
  return id || EMPTY_EMULATOR_PROJECT_ID
}

export function emulatorEntryId(projectId: string): string {
  const id = resolveEmulatorProjectId(projectId)

  if (id === EMPTY_EMULATOR_PROJECT_ID) {
    return EMPTY_EMULATOR_PROJECT_ID
  }

  return id.endsWith('_emulator') ? id : `${id}_emulator`
}

/** HOST:PORT に正規化する。スキーマと path は捨てる。 */
export function parseEmulatorHost(raw: string): string {
  let value = raw.trim()

  if (!value) {
    throw new Error('ホストは HOST:PORT で指定してください（例: 127.0.0.1:8080）')
  }

  value = value.replace(/^https?:\/\//i, '')
  const slash = value.indexOf('/')

  if (slash >= 0) {
    value = value.slice(0, slash)
  }

  if (!value.includes(':')) {
    value = `${value}:8080`
  }

  const separator = value.lastIndexOf(':')
  const hostname = value.slice(0, separator).trim()
  const port = Number(value.slice(separator + 1).trim())

  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('ホストは HOST:PORT で指定してください（例: 127.0.0.1:8080）')
  }

  return `${hostname}:${port}`
}
