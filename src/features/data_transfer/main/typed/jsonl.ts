import type { TransferScopeKind } from '../../shared/official'
import type { TypedDocument, TypedFields, TypedValue } from '../../shared/typed_value'
import { isoToTimestamp, timestampToIso } from './timestamp'

/**
 * JSON（.jsonl）の 1 行と、型つきの値の行き来（002_007 json）。
 * 1 行目は見出し、2 行目からは 1 行に 1 ドキュメント。
 *
 * 数値は、書かれた文字のまま型を決める。"30" は整数、"1.0" / "1e3" は小数。
 * JSON.parse / JSON.stringify は 1 と 1.0 を区別しないので、数値はここで読み書きする。
 */

export const JSONL_KIND = 'firemint-docs'
export const JSONL_VERSION = 1

export type JsonlScope =
  | { kind: 'project'; roots: string[] }
  | { kind: 'collection'; path: string; includeSubcollections: boolean }
  | { kind: 'group'; collectionId: string }

export type JsonlHeader = {
  kind: typeof JSONL_KIND
  version: typeof JSONL_VERSION
  projectId: string
  scope: JsonlScope
  createdAt: string
}

// ── 書く ──

function encodeDouble(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return `{"__firemint_type":"double","value":${JSON.stringify(String(value))}}`
  }
  if (Object.is(value, -0)) {
    return '-0.0'
  }
  const text = String(value)
  // 整数に見える小数は .0 を付けて、小数だと分かるようにする
  return /[.eE]/.test(text) ? text : `${text}.0`
}

export function encodeJsonValue(value: TypedValue): string {
  if ('nullValue' in value) return 'null'
  if ('booleanValue' in value) return value.booleanValue ? 'true' : 'false'
  if ('integerValue' in value) return BigInt(value.integerValue).toString()
  if ('doubleValue' in value) return encodeDouble(value.doubleValue)
  if ('stringValue' in value) return JSON.stringify(value.stringValue)
  if ('timestampValue' in value) {
    const iso = timestampToIso(value.timestampValue.seconds, value.timestampValue.nanos)
    return `{"__firemint_type":"timestamp","iso":${JSON.stringify(iso)}}`
  }
  if ('geoPointValue' in value) {
    const { latitude, longitude } = value.geoPointValue
    return `{"__firemint_type":"geopoint","latitude":${encodeDouble(latitude)},"longitude":${encodeDouble(longitude)}}`
  }
  if ('referenceValue' in value) {
    return `{"__firemint_type":"reference","path":${JSON.stringify(value.referenceValue)}}`
  }
  if ('bytesValue' in value) {
    return `{"__firemint_type":"bytes","base64":${JSON.stringify(value.bytesValue)}}`
  }
  if ('arrayValue' in value) return `[${value.arrayValue.values.map(encodeJsonValue).join(',')}]`
  return encodeJsonFields(value.mapValue.fields)
}

export function encodeJsonFields(fields: TypedFields): string {
  const parts = Object.entries(fields).map(
    ([key, value]) => `${JSON.stringify(key)}:${encodeJsonValue(value)}`
  )
  return `{${parts.join(',')}}`
}

export function encodeJsonlHeader(header: Omit<JsonlHeader, 'kind' | 'version'>): string {
  return JSON.stringify({ kind: JSONL_KIND, version: JSONL_VERSION, ...header })
}

export function encodeJsonlDocument(document: TypedDocument): string {
  return `{"path":${JSON.stringify(document.path)},"data":${encodeJsonFields(document.fields)}}`
}

// ── 読む ──

/** JSON.parse の途中で、数値を書かれた文字のまま持っておく箱 */
class JsonNumber {
  constructor(readonly source: string) {}
}

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown

function parseKeepingNumbers(text: string): unknown {
  const reviver: Reviver = (_key, value, context) =>
    typeof value === 'number' ? new JsonNumber(context?.source ?? String(value)) : value
  return JSON.parse(text, reviver as Parameters<typeof JSON.parse>[1])
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof JsonNumber)
  )
}

function numberValue(value: unknown): number | null {
  return value instanceof JsonNumber ? Number(value.source) : null
}

function decodeNumber(source: string): TypedValue {
  return /[.eE]/.test(source)
    ? { doubleValue: Number(source) }
    : { integerValue: BigInt(source).toString() }
}

function decodeValue(value: unknown): TypedValue {
  if (value === null) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (value instanceof JsonNumber) return decodeNumber(value.source)
  if (Array.isArray(value)) return { arrayValue: { values: value.map(decodeValue) } }
  if (!isPlainRecord(value)) {
    throw new Error('読めない値です')
  }

  const type = value.__firemint_type
  if (type === undefined) {
    return { mapValue: { fields: decodeFields(value) } }
  }

  if (type === 'timestamp' && typeof value.iso === 'string') {
    const timestamp = isoToTimestamp(value.iso)
    if (timestamp) return { timestampValue: timestamp }
  }
  if (type === 'geopoint') {
    const latitude = numberValue(value.latitude)
    const longitude = numberValue(value.longitude)
    if (latitude !== null && longitude !== null) return { geoPointValue: { latitude, longitude } }
  }
  if (type === 'reference' && typeof value.path === 'string') return { referenceValue: value.path }
  if (type === 'bytes' && typeof value.base64 === 'string') return { bytesValue: value.base64 }
  if (type === 'double' && ['NaN', 'Infinity', '-Infinity'].includes(value.value as string)) {
    return { doubleValue: Number(value.value) }
  }
  throw new Error(`__firemint_type の値が読めません: ${String(type)}`)
}

function decodeFields(record: Record<string, unknown>): TypedFields {
  const fields: TypedFields = {}
  for (const [key, value] of Object.entries(record)) {
    fields[key] = decodeValue(value)
  }
  return fields
}

/** 見出しでない・kind や version が違う時は Error */
export function parseJsonlHeader(line: string): JsonlHeader {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new Error('1 行目が見出しではありません')
  }
  if (!isPlainRecord(parsed) || parsed.kind !== JSONL_KIND) {
    throw new Error(`1 行目が見出しではありません（kind が ${JSONL_KIND} ではない）`)
  }
  if (parsed.version !== JSONL_VERSION) {
    throw new Error(`対応していない version です: ${String(parsed.version)}`)
  }
  return parsed as JsonlHeader
}

export function scopeKindOf(header: JsonlHeader): TransferScopeKind | null {
  const kind = header.scope?.kind
  return kind === 'project' || kind === 'collection' || kind === 'group' ? kind : null
}

/** 2 行目からの 1 行。読めない時は Error */
export function parseJsonlDocument(line: string): TypedDocument {
  const parsed = parseKeepingNumbers(line)
  if (!isPlainRecord(parsed) || typeof parsed.path !== 'string' || !isPlainRecord(parsed.data)) {
    throw new Error('path と data がありません')
  }
  const segments = parsed.path.split('/').filter(Boolean)
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(`ドキュメントのパスではありません: ${parsed.path}`)
  }
  return { path: segments.join('/'), fields: decodeFields(parsed.data) }
}
