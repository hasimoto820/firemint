import type { ExportDocument } from '../../shared/types'
import {
  asBool,
  asBytes,
  asDouble,
  asGroup,
  asUtf8,
  asVarint,
  decodeEmbedded,
  decodeMessage,
  fieldsWith,
  firstField,
  type ProtoField
} from './proto_wire'

const MEANING_GD_WHEN = 7
const MEANING_GEORSS_POINT = 9
const MEANING_BLOB = 14
const MEANING_BYTESTRING = 16
const MEANING_ENTITY_PROTO = 19

function int64ToNumber(value: bigint): number | string {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  return value.toString()
}

export function projectIdFromApp(app: string | null): string | null {
  if (!app) {
    return null
  }

  const trimmed = app.trim()
  if (!trimmed) {
    return null
  }

  const tilde = trimmed.indexOf('~')
  const raw = tilde >= 0 ? trimmed.slice(tilde + 1) : trimmed
  const projectId = raw.trim()
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/i.test(projectId)) {
    return null
  }

  return projectId.toLowerCase()
}

function pathFromElements(elements: ProtoField[]): { path: string; id: string } | null {
  const segments: string[] = []

  for (const element of elements) {
    const group = asGroup(element)
    if (!group) {
      continue
    }

    const type = asUtf8(firstField(group, 2))
    const numericId = asVarint(firstField(group, 3))
    const name = asUtf8(firstField(group, 4))

    if (!type) {
      return null
    }

    const documentId = name && name.length > 0 ? name : numericId !== null ? numericId.toString() : ''
    if (!documentId) {
      return null
    }

    segments.push(type, documentId)
  }

  if (segments.length < 2 || segments.length % 2 !== 0) {
    return null
  }

  return {
    path: segments.join('/'),
    id: segments[segments.length - 1]
  }
}

function referencePath(fields: ProtoField[]): string | null {
  const pathMessage = decodeEmbedded(firstField(fields, 14))
  if (!pathMessage) {
    return null
  }

  const parsed = pathFromElements(fieldsWith(pathMessage, 1))
  return parsed?.path ?? null
}

function propertyValue(fields: ProtoField[], meaning: number): unknown {
  if (meaning === MEANING_ENTITY_PROTO) {
    const nested = decodeEmbedded(firstField(fields, 3))
    if (!nested) {
      return {}
    }
    return propertiesToData(nested)
  }

  if (meaning === MEANING_GD_WHEN) {
    const micros = asVarint(firstField(fields, 1))
    if (micros === null) {
      return null
    }
    const millis = Number(micros) / 1000
    return {
      __firemint_type: 'timestamp',
      iso: new Date(millis).toISOString()
    }
  }

  if (meaning === MEANING_GEORSS_POINT) {
    const point = asGroup(firstField(fields, 5))
    if (!point) {
      return null
    }
    const latitude = asDouble(firstField(point, 6))
    const longitude = asDouble(firstField(point, 7))
    if (latitude === null || longitude === null) {
      return null
    }
    return {
      __firemint_type: 'geopoint',
      latitude,
      longitude
    }
  }

  const reference = asGroup(firstField(fields, 12))
  if (reference) {
    const path = referencePath(reference)
    if (!path) {
      return null
    }
    return {
      __firemint_type: 'reference',
      path
    }
  }

  const intValue = asVarint(firstField(fields, 1))
  if (intValue !== null) {
    return int64ToNumber(intValue)
  }

  const boolValue = asBool(firstField(fields, 2))
  if (boolValue !== null && firstField(fields, 2)) {
    return boolValue
  }

  const raw = asBytes(firstField(fields, 3))
  if (raw) {
    if (meaning === MEANING_BLOB || meaning === MEANING_BYTESTRING) {
      return {
        __firemint_type: 'bytes',
        base64: raw.toString('base64')
      }
    }
    return raw.toString('utf8')
  }

  const doubleValue = asDouble(firstField(fields, 4))
  if (doubleValue !== null) {
    return doubleValue
  }

  return null
}

function propertiesToData(entityFields: ProtoField[]): Record<string, unknown> {
  const collected = new Map<string, { multiple: boolean; values: unknown[] }>()

  const properties = [...fieldsWith(entityFields, 14), ...fieldsWith(entityFields, 15)]

  for (const propertyField of properties) {
    const property = decodeEmbedded(propertyField)
    if (!property) {
      continue
    }

    const name = asUtf8(firstField(property, 3))
    if (!name) {
      continue
    }

    const meaning = Number(asVarint(firstField(property, 1)) ?? 0n)
    const multiple = asBool(firstField(property, 4)) === true
    const valueFields = decodeEmbedded(firstField(property, 5))
    const value = valueFields ? propertyValue(valueFields, meaning) : null

    const current = collected.get(name) ?? { multiple: false, values: [] }
    current.multiple = current.multiple || multiple
    current.values.push(value)
    collected.set(name, current)
  }

  const data: Record<string, unknown> = {}
  for (const [name, entry] of collected) {
    data[name] = entry.multiple || entry.values.length > 1 ? entry.values : entry.values[0]
  }
  return data
}

export type ParsedOfficialEntity = {
  document: ExportDocument
  projectId: string | null
}

export function parseOfficialEntity(record: Buffer): ParsedOfficialEntity | null {
  const fields = decodeMessage(record)
  const key = decodeEmbedded(firstField(fields, 13))
  if (!key) {
    return null
  }

  const pathMessage = decodeEmbedded(firstField(key, 14))
  if (!pathMessage) {
    return null
  }

  const parsed = pathFromElements(fieldsWith(pathMessage, 1))
  if (!parsed) {
    return null
  }

  return {
    document: {
      id: parsed.id,
      path: parsed.path,
      data: propertiesToData(fields)
    },
    projectId: projectIdFromApp(asUtf8(firstField(key, 13)))
  }
}

export function entityRecordToDocument(record: Buffer): ExportDocument | null {
  return parseOfficialEntity(record)?.document ?? null
}
