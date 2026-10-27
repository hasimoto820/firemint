/**
 * 型つきの値。インポート / エクスポートの中では、値を常にこの形で持つ。
 * Firestore の Value（REST の JSON）と同じ並び。整数と小数（1 と 1.0）を区別する。
 *
 * referenceValue は、プロジェクトの一番上からのパス（users/abc）。
 * 書く時に宛先プロジェクトの名前を付ける。
 */
export type TypedValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: { seconds: string; nanos: number } }
  | { stringValue: string }
  | { bytesValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values: TypedValue[] } }
  | { mapValue: { fields: TypedFields } }

export type TypedFields = Record<string, TypedValue>

export type TypedDocument = {
  /** プロジェクトの一番上からのフルパス */
  path: string
  fields: TypedFields
}

/** パスの最後のコレクション ID（companyQ/doc1/orders/o1 → orders） */
export function collectionIdOf(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[segments.length - 2] : (segments[0] ?? '')
}

function sameNumber(left: number, right: number): boolean {
  return Object.is(left, right) || left === right
}

/**
 * 2 つの値が同じか。マップのキーの順番は見ない。NaN は NaN と同じ。
 * 公式ダンプは空の配列を持てないので、片方に無いキーは、もう片方が空の配列なら同じとみなす。
 */
export function typedValueEquals(left: TypedValue, right: TypedValue): boolean {
  if ('nullValue' in left) return 'nullValue' in right
  if ('booleanValue' in left)
    return 'booleanValue' in right && left.booleanValue === right.booleanValue
  if ('integerValue' in left)
    return 'integerValue' in right && BigInt(left.integerValue) === BigInt(right.integerValue)
  if ('doubleValue' in left)
    return 'doubleValue' in right && sameNumber(left.doubleValue, right.doubleValue)
  if ('timestampValue' in left)
    return (
      'timestampValue' in right &&
      BigInt(left.timestampValue.seconds) === BigInt(right.timestampValue.seconds) &&
      left.timestampValue.nanos === right.timestampValue.nanos
    )
  if ('stringValue' in left) return 'stringValue' in right && left.stringValue === right.stringValue
  if ('bytesValue' in left) return 'bytesValue' in right && left.bytesValue === right.bytesValue
  if ('referenceValue' in left)
    return 'referenceValue' in right && left.referenceValue === right.referenceValue
  if ('geoPointValue' in left)
    return (
      'geoPointValue' in right &&
      sameNumber(left.geoPointValue.latitude, right.geoPointValue.latitude) &&
      sameNumber(left.geoPointValue.longitude, right.geoPointValue.longitude)
    )
  if ('arrayValue' in left) {
    if (!('arrayValue' in right)) return false
    const a = left.arrayValue.values
    const b = right.arrayValue.values
    return a.length === b.length && a.every((value, index) => typedValueEquals(value, b[index]))
  }
  return 'mapValue' in right && typedFieldsEqual(left.mapValue.fields, right.mapValue.fields)
}

function isEmptyArray(value: TypedValue | undefined): boolean {
  return Boolean(value && 'arrayValue' in value && value.arrayValue.values.length === 0)
}

export function typedFieldsEqual(left: TypedFields, right: TypedFields): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    const a = left[key]
    const b = right[key]
    if (!a || !b) {
      if (isEmptyArray(a) || isEmptyArray(b)) continue
      return false
    }
    if (!typedValueEquals(a, b)) return false
  }
  return true
}
