export const WIRE_VARINT = 0
export const WIRE_FIXED64 = 1
export const WIRE_LEN = 2
export const WIRE_START_GROUP = 3
export const WIRE_END_GROUP = 4
export const WIRE_FIXED32 = 5

export type ProtoValue =
  | { kind: 'varint'; value: bigint }
  | { kind: 'fixed64'; value: Buffer }
  | { kind: 'bytes'; value: Buffer }
  | { kind: 'group'; fields: ProtoField[] }
  | { kind: 'fixed32'; value: number }

export type ProtoField = {
  id: number
  value: ProtoValue
}

function readVarint(buffer: Buffer, offset: number): { value: bigint; offset: number } {
  let result = 0n
  let shift = 0n
  while (offset < buffer.length) {
    const byte = buffer[offset]
    offset += 1
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { value: result, offset }
    }
    shift += 7n
    if (shift > 63n) {
      throw new Error('varint が長すぎます')
    }
  }
  throw new Error('varint が途切れています')
}

function decodeFields(buffer: Buffer, start: number, end: number, stopOnEndGroup: number | null): {
  fields: ProtoField[]
  offset: number
} {
  const fields: ProtoField[] = []
  let offset = start

  while (offset < end) {
    const tag = readVarint(buffer, offset)
    offset = tag.offset
    const id = Number(tag.value >> 3n)
    const wire = Number(tag.value & 7n)

    if (wire === WIRE_END_GROUP) {
      if (stopOnEndGroup !== null && id === stopOnEndGroup) {
        return { fields, offset }
      }
      throw new Error(`想定外の end-group field=${id}`)
    }

    if (wire === WIRE_VARINT) {
      const next = readVarint(buffer, offset)
      offset = next.offset
      fields.push({ id, value: { kind: 'varint', value: next.value } })
      continue
    }

    if (wire === WIRE_FIXED64) {
      if (offset + 8 > end) {
        throw new Error('fixed64 が途切れています')
      }
      fields.push({ id, value: { kind: 'fixed64', value: buffer.subarray(offset, offset + 8) } })
      offset += 8
      continue
    }

    if (wire === WIRE_FIXED32) {
      if (offset + 4 > end) {
        throw new Error('fixed32 が途切れています')
      }
      fields.push({ id, value: { kind: 'fixed32', value: buffer.readUInt32LE(offset) } })
      offset += 4
      continue
    }

    if (wire === WIRE_LEN) {
      const length = readVarint(buffer, offset)
      offset = length.offset
      const size = Number(length.value)
      if (offset + size > end) {
        throw new Error('length-delimited が途切れています')
      }
      fields.push({
        id,
        value: { kind: 'bytes', value: Buffer.from(buffer.subarray(offset, offset + size)) }
      })
      offset += size
      continue
    }

    if (wire === WIRE_START_GROUP) {
      const nested = decodeFields(buffer, offset, end, id)
      offset = nested.offset
      fields.push({ id, value: { kind: 'group', fields: nested.fields } })
      continue
    }

    throw new Error(`未対応の wire type=${wire}`)
  }

  return { fields, offset }
}

export function decodeMessage(buffer: Buffer): ProtoField[] {
  return decodeFields(buffer, 0, buffer.length, null).fields
}

export function fieldsWith(fields: ProtoField[], id: number): ProtoField[] {
  return fields.filter((field) => field.id === id)
}

export function firstField(fields: ProtoField[], id: number): ProtoField | undefined {
  return fields.find((field) => field.id === id)
}

export function asBytes(field: ProtoField | undefined): Buffer | null {
  if (!field || field.value.kind !== 'bytes') {
    return null
  }
  return field.value.value
}

export function asVarint(field: ProtoField | undefined): bigint | null {
  if (!field || field.value.kind !== 'varint') {
    return null
  }
  return field.value.value
}

export function asGroup(field: ProtoField | undefined): ProtoField[] | null {
  if (!field || field.value.kind !== 'group') {
    return null
  }
  return field.value.fields
}

export function asUtf8(field: ProtoField | undefined): string | null {
  const bytes = asBytes(field)
  if (!bytes) {
    return null
  }
  return bytes.toString('utf8')
}

export function asDouble(field: ProtoField | undefined): number | null {
  if (!field) {
    return null
  }
  if (field.value.kind === 'fixed64') {
    return field.value.value.readDoubleLE(0)
  }
  return null
}

export function asBool(field: ProtoField | undefined): boolean | null {
  const value = asVarint(field)
  if (value === null) {
    return null
  }
  return value !== 0n
}

export function decodeEmbedded(field: ProtoField | undefined): ProtoField[] | null {
  const bytes = asBytes(field)
  if (!bytes) {
    return null
  }
  return decodeMessage(bytes)
}

function writeVarint(value: bigint, chunks: Buffer[]): void {
  let rest = value
  while (rest >= 0x80n) {
    chunks.push(Buffer.from([Number(rest & 0x7fn) | 0x80]))
    rest >>= 7n
  }
  chunks.push(Buffer.from([Number(rest)]))
}

function writeTag(id: number, wire: number, chunks: Buffer[]): void {
  writeVarint(BigInt((id << 3) | wire), chunks)
}

export function encodeVarintField(id: number, value: bigint): Buffer {
  const chunks: Buffer[] = []
  writeTag(id, WIRE_VARINT, chunks)
  writeVarint(value, chunks)
  return Buffer.concat(chunks)
}

export function encodeBytesField(id: number, value: Buffer): Buffer {
  const chunks: Buffer[] = []
  writeTag(id, WIRE_LEN, chunks)
  writeVarint(BigInt(value.length), chunks)
  chunks.push(value)
  return Buffer.concat(chunks)
}

export function encodeUtf8Field(id: number, value: string): Buffer {
  return encodeBytesField(id, Buffer.from(value, 'utf8'))
}

export function encodeDoubleField(id: number, value: number): Buffer {
  const chunks: Buffer[] = []
  writeTag(id, WIRE_FIXED64, chunks)
  const raw = Buffer.alloc(8)
  raw.writeDoubleLE(value)
  chunks.push(raw)
  return Buffer.concat(chunks)
}

export function encodeGroupField(id: number, body: Buffer): Buffer {
  const chunks: Buffer[] = []
  writeTag(id, WIRE_START_GROUP, chunks)
  chunks.push(body)
  writeTag(id, WIRE_END_GROUP, chunks)
  return Buffer.concat(chunks)
}

export function encodeMessageField(id: number, body: Buffer): Buffer {
  return encodeBytesField(id, body)
}
