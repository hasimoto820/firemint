import type { TypedFields, TypedValue } from '../../shared/typed_value'
import { isoToTimestamp, timestampToIso } from './timestamp'

/**
 * 型つきの値と、__firemint_type 形式の JS の値（serialize.ts と同じ）の行き来。
 * diff・self_check など、型つきでない側に渡す時に使う。整数と小数の区別はここで落ちる。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function typedToLegacy(value: TypedValue): unknown {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) {
    const int = BigInt(value.integerValue)
    return int >= BigInt(Number.MIN_SAFE_INTEGER) && int <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(int)
      : value.integerValue
  }
  if ('doubleValue' in value) {
    return Number.isFinite(value.doubleValue)
      ? value.doubleValue
      : { __firemint_type: 'double', value: String(value.doubleValue) }
  }
  if ('timestampValue' in value) {
    return {
      __firemint_type: 'timestamp',
      iso: timestampToIso(value.timestampValue.seconds, value.timestampValue.nanos)
    }
  }
  if ('stringValue' in value) return value.stringValue
  if ('bytesValue' in value) return { __firemint_type: 'bytes', base64: value.bytesValue }
  if ('referenceValue' in value) return { __firemint_type: 'reference', path: value.referenceValue }
  if ('geoPointValue' in value) return { __firemint_type: 'geopoint', ...value.geoPointValue }
  if ('arrayValue' in value) return value.arrayValue.values.map(typedToLegacy)
  return typedFieldsToLegacy(value.mapValue.fields)
}

export function typedFieldsToLegacy(fields: TypedFields): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    data[key] = typedToLegacy(value)
  }
  return data
}

export function legacyToTyped(value: unknown): TypedValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'bigint') return { integerValue: value.toString() }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(legacyToTyped) } }
  if (isRecord(value)) {
    const type = value.__firemint_type
    if (type === 'timestamp' && typeof value.iso === 'string') {
      const timestamp = isoToTimestamp(value.iso)
      if (timestamp) return { timestampValue: timestamp }
    }
    if (
      type === 'geopoint' &&
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number'
    ) {
      return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } }
    }
    if (type === 'reference' && typeof value.path === 'string')
      return { referenceValue: value.path }
    if (type === 'bytes' && typeof value.base64 === 'string') return { bytesValue: value.base64 }
    if (type === 'double' && typeof value.value === 'string')
      return { doubleValue: Number(value.value) }
    return { mapValue: { fields: legacyToTypedFields(value) } }
  }
  throw new Error(`読めない値です: ${typeof value}`)
}

export function legacyToTypedFields(data: Record<string, unknown>): TypedFields {
  const fields: TypedFields = {}
  for (const [key, value] of Object.entries(data)) {
    fields[key] = legacyToTyped(value)
  }
  return fields
}
