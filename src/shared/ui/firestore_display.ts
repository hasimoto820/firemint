export type GeopointField = {
  field: string
  latitude: number
  longitude: number
}

export type ImageUrlField = {
  field: string
  url: string
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico']

const IMAGE_FORMAT_QUERY_VALUES = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isTimestampValue(value: unknown): value is { __firemint_type: 'timestamp'; iso: string } {
  return isRecord(value) && value.__firemint_type === 'timestamp' && typeof value.iso === 'string'
}

export function isGeopointValue(
  value: unknown
): value is { __firemint_type: 'geopoint'; latitude: number; longitude: number } {
  return (
    isRecord(value) &&
    value.__firemint_type === 'geopoint' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  )
}

export function formatTimestampIso(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return date.toLocaleString()
}

export function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (isTimestampValue(value)) {
    return formatTimestampIso(value.iso)
  }

  if (isGeopointValue(value)) {
    return `${value.latitude}, ${value.longitude}`
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function findGeopointFields(
  data: Record<string, unknown>,
  prefix = ''
): GeopointField[] {
  const results: GeopointField[] = []

  for (const [key, value] of Object.entries(data)) {
    const field = prefix ? `${prefix}.${key}` : key

    if (isGeopointValue(value)) {
      results.push({
        field,
        latitude: value.latitude,
        longitude: value.longitude
      })
      continue
    }

    if (isRecord(value) && value.__firemint_type === undefined) {
      results.push(...findGeopointFields(value, field))
    }
  }

  return results
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim())

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url
  } catch {
    return null
  }
}

function hasImageExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase()

  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

function isFirebaseStorageImageUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase()

  if (host === 'firebasestorage.googleapis.com') {
    return url.pathname.includes('/o/') && url.searchParams.get('alt') === 'media'
  }

  if (host === 'storage.googleapis.com') {
    return hasImageExtension(url.pathname)
  }

  return false
}

function hasImageFormatQuery(url: URL): boolean {
  const format = url.searchParams.get('format')?.toLowerCase()

  return format !== undefined && IMAGE_FORMAT_QUERY_VALUES.has(format)
}

export function isImageUrlValue(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  const url = parseHttpUrl(trimmed)

  if (!url) {
    return false
  }

  if (hasImageExtension(url.pathname)) {
    return true
  }

  if (isFirebaseStorageImageUrl(url)) {
    return true
  }

  return hasImageFormatQuery(url)
}

export function findImageUrlFields(
  data: Record<string, unknown>,
  prefix = ''
): ImageUrlField[] {
  const results: ImageUrlField[] = []

  for (const [key, value] of Object.entries(data)) {
    const field = prefix ? `${prefix}.${key}` : key

    if (isImageUrlValue(value)) {
      results.push({ field, url: value.trim() })
      continue
    }

    if (isRecord(value) && value.__firemint_type === undefined) {
      results.push(...findImageUrlFields(value, field))
    }
  }

  return results
}

export function buildOpenStreetMapEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.02
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta
  ].join(',')

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`
}

export function buildOpenStreetMapLink(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`
}
