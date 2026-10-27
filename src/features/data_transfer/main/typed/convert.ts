import { DocumentReference, GeoPoint, Timestamp } from '@google-cloud/firestore'
import type { TypedFields, TypedValue } from '../../shared/typed_value'

/**
 * useBigInt の接続で読んだ値を、型つきの値にする。
 * 整数は BigInt、小数は number で返ってくるので、1 と 1.0 を区別できる。
 */
export function fromSdkValue(value: unknown): TypedValue {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }

  if (typeof value === 'bigint') {
    return { integerValue: value.toString() }
  }

  if (typeof value === 'number') {
    return { doubleValue: value }
  }

  if (typeof value === 'string') {
    return { stringValue: value }
  }

  if (value instanceof Timestamp) {
    return { timestampValue: { seconds: value.seconds.toString(), nanos: value.nanoseconds } }
  }

  if (value instanceof GeoPoint) {
    return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } }
  }

  if (value instanceof DocumentReference) {
    return { referenceValue: value.path }
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { bytesValue: Buffer.from(value).toString('base64') }
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(fromSdkValue) } }
  }

  if (typeof value === 'object') {
    return { mapValue: { fields: fromSdkData(value as Record<string, unknown>) } }
  }

  throw new Error(`読めない値です: ${typeof value}`)
}

export function fromSdkData(data: Record<string, unknown>): TypedFields {
  const fields: TypedFields = {}
  for (const [key, value] of Object.entries(data)) {
    fields[key] = fromSdkValue(value)
  }
  return fields
}

/** v1 クライアントに渡す Value。リファレンスは宛先プロジェクトのドキュメントを指す */
export type V1Value = Record<string, unknown>

export function toV1Value(value: TypedValue, database: string): V1Value {
  // proto の nullValue は enum。null のままでは「型が無い値」として断られる
  if ('nullValue' in value) {
    return { nullValue: 'NULL_VALUE' }
  }

  if ('referenceValue' in value) {
    return { referenceValue: `${database}/documents/${value.referenceValue}` }
  }

  if ('bytesValue' in value) {
    return { bytesValue: Buffer.from(value.bytesValue, 'base64') }
  }

  if ('arrayValue' in value) {
    return {
      arrayValue: { values: value.arrayValue.values.map((item) => toV1Value(item, database)) }
    }
  }

  if ('mapValue' in value) {
    return { mapValue: { fields: toV1Fields(value.mapValue.fields, database) } }
  }

  return value
}

export function toV1Fields(fields: TypedFields, database: string): Record<string, V1Value> {
  const result: Record<string, V1Value> = {}
  for (const [key, value] of Object.entries(fields)) {
    result[key] = toV1Value(value, database)
  }
  return result
}
