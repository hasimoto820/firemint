import type { ExportDocument } from '../../shared/types'
import {
  encodeBytesField,
  encodeDoubleField,
  encodeGroupField,
  encodeMessageField,
  encodeUtf8Field,
  encodeVarintField
} from './proto_wire'

const MEANING_GD_WHEN = 7n
const MEANING_GEORSS_POINT = 9n
const MEANING_BLOB = 14n
const MEANING_ENTITY_PROTO = 19n

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function encodePath(path: string): Buffer {
  const segments = path.split('/').filter(Boolean)
  const groups: Buffer[] = []

  for (let index = 0; index + 1 < segments.length; index += 2) {
    groups.push(
      encodeGroupField(
        1,
        Buffer.concat([
          encodeUtf8Field(2, segments[index]),
          encodeUtf8Field(4, segments[index + 1])
        ])
      )
    )
  }

  return Buffer.concat(groups)
}

function encodeReference(app: string, path: string): Buffer {
  return Buffer.concat([encodeUtf8Field(13, app), encodeMessageField(14, encodePath(path))])
}

function encodeValue(value: unknown, app: string): { meaning: bigint; body: Buffer } | null {
  if (value === null || value === undefined) {
    return null
  }

  if (isRecord(value) && value.__firemint_type === 'timestamp' && typeof value.iso === 'string') {
    const millis = new Date(value.iso).getTime()
    if (Number.isNaN(millis)) {
      return null
    }
    return { meaning: MEANING_GD_WHEN, body: encodeVarintField(1, BigInt(millis) * 1000n) }
  }

  if (
    isRecord(value) &&
    value.__firemint_type === 'geopoint' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  ) {
    return {
      meaning: MEANING_GEORSS_POINT,
      body: encodeGroupField(
        5,
        Buffer.concat([
          encodeDoubleField(6, value.latitude),
          encodeDoubleField(7, value.longitude)
        ])
      )
    }
  }

  if (isRecord(value) && value.__firemint_type === 'reference' && typeof value.path === 'string') {
    return {
      meaning: 0n,
      body: encodeGroupField(12, encodeReference(app, value.path))
    }
  }

  if (isRecord(value) && value.__firemint_type === 'bytes' && typeof value.base64 === 'string') {
    return {
      meaning: MEANING_BLOB,
      body: encodeBytesField(3, Buffer.from(value.base64, 'base64'))
    }
  }

  if (typeof value === 'boolean') {
    return { meaning: 0n, body: encodeVarintField(2, value ? 1n : 0n) }
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && Number.isSafeInteger(value)) {
      return { meaning: 0n, body: encodeVarintField(1, BigInt(value)) }
    }
    return { meaning: 0n, body: encodeDoubleField(4, value) }
  }

  if (typeof value === 'string') {
    return { meaning: 0n, body: encodeBytesField(3, Buffer.from(value, 'utf8')) }
  }

  if (Array.isArray(value)) {
    return null
  }

  if (isRecord(value) && value.__firemint_type === undefined) {
    return {
      meaning: MEANING_ENTITY_PROTO,
      body: encodeBytesField(3, encodeProperties(value, app))
    }
  }

  return null
}

function encodeProperty(name: string, value: unknown, app: string, multiple: boolean): Buffer[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => encodeProperty(name, item, app, true))
  }

  const encoded = encodeValue(value, app)
  if (!encoded) {
    return []
  }

  return [
    encodeMessageField(
      14,
      Buffer.concat([
        encodeVarintField(1, encoded.meaning),
        encodeUtf8Field(3, name),
        encodeVarintField(4, multiple ? 1n : 0n),
        encodeMessageField(5, encoded.body)
      ])
    )
  ]
}

function encodeProperties(data: Record<string, unknown>, app: string): Buffer {
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(data)) {
    parts.push(...encodeProperty(name, value, app, Array.isArray(value)))
  }
  return Buffer.concat(parts)
}

export function documentToEntity(document: ExportDocument, app: string): Buffer {
  const pathBody = encodePath(document.path)
  return Buffer.concat([
    encodeMessageField(13, encodeReference(app, document.path)),
    encodeProperties(document.data, app),
    encodeMessageField(16, pathBody)
  ])
}
