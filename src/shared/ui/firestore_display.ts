export type GeopointField = {
  field: string
  latitude: number
  longitude: number
}

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
