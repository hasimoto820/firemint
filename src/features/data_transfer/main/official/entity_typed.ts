import type { TypedDocument, TypedFields, TypedValue } from '../../shared/typed_value'
import { microsToTimestamp, timestampToMicros } from '../typed/timestamp'
import {
  asBool,
  asBytes,
  asDouble,
  asGroup,
  asUtf8,
  asVarint,
  decodeEmbedded,
  decodeMessage,
  encodeBytesField,
  encodeDoubleField,
  encodeGroupField,
  encodeMessageField,
  encodeUtf8Field,
  encodeVarintField,
  fieldsWith,
  firstField,
  type ProtoField
} from './proto_wire'

/**
 * 公式ダンプのエンティティ（Datastore の EntityProto）と、型つきのドキュメントの行き来。
 * 整数（field 1）と小数（field 4）を分けて読み書きする。
 */

const MEANING_GD_WHEN = 7
const MEANING_GEORSS_POINT = 9
const MEANING_BLOB = 14
const MEANING_BYTESTRING = 16
const MEANING_ENTITY_PROTO = 19

// ── 書く ──

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

/** int64 を varint にする。負の数は 2 の補数（64 ビット） */
function encodeInt64Field(id: number, value: bigint): Buffer {
  return encodeVarintField(id, BigInt.asUintN(64, value))
}

/** 配列は呼ぶ側で要素ごとに展開する。配列の中の配列は書けないので null */
function encodeValue(value: TypedValue, app: string): { meaning: number; body: Buffer } | null {
  if ('nullValue' in value) {
    // null は、中身の無い値として書く（フィールドごと落とさない）
    return { meaning: 0, body: Buffer.alloc(0) }
  }
  if ('booleanValue' in value) {
    return { meaning: 0, body: encodeVarintField(2, value.booleanValue ? 1n : 0n) }
  }
  if ('integerValue' in value) {
    return { meaning: 0, body: encodeInt64Field(1, BigInt(value.integerValue)) }
  }
  if ('doubleValue' in value) {
    return { meaning: 0, body: encodeDoubleField(4, value.doubleValue) }
  }
  if ('timestampValue' in value) {
    const micros = timestampToMicros(value.timestampValue.seconds, value.timestampValue.nanos)
    return { meaning: MEANING_GD_WHEN, body: encodeInt64Field(1, micros) }
  }
  if ('stringValue' in value) {
    return { meaning: 0, body: encodeUtf8Field(3, value.stringValue) }
  }
  if ('bytesValue' in value) {
    return {
      meaning: MEANING_BLOB,
      body: encodeBytesField(3, Buffer.from(value.bytesValue, 'base64'))
    }
  }
  if ('referenceValue' in value) {
    return { meaning: 0, body: encodeGroupField(12, encodeReference(app, value.referenceValue)) }
  }
  if ('geoPointValue' in value) {
    return {
      meaning: MEANING_GEORSS_POINT,
      body: encodeGroupField(
        5,
        Buffer.concat([
          encodeDoubleField(6, value.geoPointValue.latitude),
          encodeDoubleField(7, value.geoPointValue.longitude)
        ])
      )
    }
  }
  if ('mapValue' in value) {
    return {
      meaning: MEANING_ENTITY_PROTO,
      body: encodeBytesField(3, encodeProperties(value.mapValue.fields, app))
    }
  }
  return null
}

function encodeProperty(name: string, value: TypedValue, app: string, multiple: boolean): Buffer[] {
  if ('arrayValue' in value) {
    if (multiple) {
      return []
    }
    // 配列は要素ごとに展開する。空の配列はプロパティが出ない（モバイル版と同じ）
    return value.arrayValue.values.flatMap((item) => encodeProperty(name, item, app, true))
  }

  const encoded = encodeValue(value, app)
  if (!encoded) {
    return []
  }

  return [
    encodeMessageField(
      14,
      Buffer.concat([
        encodeVarintField(1, BigInt(encoded.meaning)),
        encodeUtf8Field(3, name),
        encodeVarintField(4, multiple ? 1n : 0n),
        encodeMessageField(5, encoded.body)
      ])
    )
  ]
}

function encodeProperties(fields: TypedFields, app: string): Buffer {
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(...encodeProperty(name, value, app, false))
  }
  return Buffer.concat(parts)
}

/** app は s~{projectId} */
export function encodeTypedEntity(document: TypedDocument, app: string): Buffer {
  return Buffer.concat([
    encodeMessageField(13, encodeReference(app, document.path)),
    encodeProperties(document.fields, app),
    encodeMessageField(16, encodePath(document.path))
  ])
}

// ── 読む ──

export function projectIdFromApp(app: string | null): string | null {
  if (!app) {
    return null
  }

  const trimmed = app.trim()
  const tilde = trimmed.indexOf('~')
  const projectId = (tilde >= 0 ? trimmed.slice(tilde + 1) : trimmed).trim()
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/i.test(projectId)) {
    return null
  }

  return projectId.toLowerCase()
}

function pathFromElements(elements: ProtoField[]): string | null {
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

    const documentId =
      name && name.length > 0 ? name : numericId !== null ? numericId.toString() : ''
    if (!documentId) {
      return null
    }

    segments.push(type, documentId)
  }

  if (segments.length < 2 || segments.length % 2 !== 0) {
    return null
  }

  return segments.join('/')
}

function referencePath(fields: ProtoField[]): string | null {
  const pathMessage = decodeEmbedded(firstField(fields, 14))
  return pathMessage ? pathFromElements(fieldsWith(pathMessage, 1)) : null
}

function decodeValue(fields: ProtoField[], meaning: number): TypedValue {
  if (meaning === MEANING_ENTITY_PROTO) {
    const nested = decodeEmbedded(firstField(fields, 3))
    return { mapValue: { fields: nested ? decodeProperties(nested) : {} } }
  }

  if (meaning === MEANING_GD_WHEN) {
    const micros = asVarint(firstField(fields, 1))
    if (micros !== null) {
      return { timestampValue: microsToTimestamp(BigInt.asIntN(64, micros)) }
    }
  }

  if (meaning === MEANING_GEORSS_POINT) {
    const point = asGroup(firstField(fields, 5))
    const latitude = point ? asDouble(firstField(point, 6)) : null
    const longitude = point ? asDouble(firstField(point, 7)) : null
    if (latitude !== null && longitude !== null) {
      return { geoPointValue: { latitude, longitude } }
    }
  }

  const reference = asGroup(firstField(fields, 12))
  if (reference) {
    const path = referencePath(reference)
    if (path) {
      return { referenceValue: path }
    }
  }

  const intValue = asVarint(firstField(fields, 1))
  if (intValue !== null) {
    return { integerValue: BigInt.asIntN(64, intValue).toString() }
  }

  const boolValue = asBool(firstField(fields, 2))
  if (boolValue !== null) {
    return { booleanValue: boolValue }
  }

  const raw = asBytes(firstField(fields, 3))
  if (raw) {
    return meaning === MEANING_BLOB || meaning === MEANING_BYTESTRING
      ? { bytesValue: raw.toString('base64') }
      : { stringValue: raw.toString('utf8') }
  }

  const doubleValue = asDouble(firstField(fields, 4))
  if (doubleValue !== null) {
    return { doubleValue }
  }

  // 中身の無い値は null
  return { nullValue: null }
}

function decodeProperties(entityFields: ProtoField[]): TypedFields {
  const collected = new Map<string, { multiple: boolean; values: TypedValue[] }>()
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
    const value: TypedValue = valueFields ? decodeValue(valueFields, meaning) : { nullValue: null }

    const current = collected.get(name) ?? { multiple: false, values: [] }
    current.multiple = current.multiple || multiple
    current.values.push(value)
    collected.set(name, current)
  }

  const fields: TypedFields = {}
  for (const [name, entry] of collected) {
    fields[name] =
      entry.multiple || entry.values.length > 1
        ? { arrayValue: { values: entry.values } }
        : entry.values[0]
  }
  return fields
}

export type DecodedEntity = {
  document: TypedDocument
  projectId: string | null
}

/** エンティティでない・キーが読めない時は null */
export function decodeTypedEntity(record: Buffer): DecodedEntity | null {
  const fields = decodeMessage(record)
  const key = decodeEmbedded(firstField(fields, 13))
  if (!key) {
    return null
  }

  const pathMessage = decodeEmbedded(firstField(key, 14))
  const path = pathMessage ? pathFromElements(fieldsWith(pathMessage, 1)) : null
  if (!path) {
    return null
  }

  return {
    document: { path, fields: decodeProperties(fields) },
    projectId: projectIdFromApp(asUtf8(firstField(key, 13)))
  }
}
