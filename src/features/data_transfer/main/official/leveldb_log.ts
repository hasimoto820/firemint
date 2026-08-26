import { crc32c, maskLeveldbCrc } from './crc32c'

const BLOCK_SIZE = 32 * 1024
const HEADER_LENGTH = 7

const RECORD_NONE = 0
const RECORD_FULL = 1
const RECORD_FIRST = 2
const RECORD_MIDDLE = 3
const RECORD_LAST = 4

class LeveldbEofError extends Error {
  constructor() {
    super('leveldb log eof')
    this.name = 'LeveldbEofError'
  }
}

function readHeader(buffer: Buffer, offset: number): {
  crc: number
  length: number
  type: number
} {
  if (offset + HEADER_LENGTH > buffer.length) {
    throw new LeveldbEofError()
  }

  return {
    crc: buffer.readUInt32LE(offset),
    length: buffer.readUInt16LE(offset + 4),
    type: buffer.readUInt8(offset + 6)
  }
}

function crcMatches(type: number, data: Buffer, stored: number): boolean {
  const payload = Buffer.alloc(1 + data.length)
  payload[0] = type
  data.copy(payload, 1)
  const computed = maskLeveldbCrc(crc32c(payload))
  if (computed === stored) {
    return true
  }
  return crc32c(payload) === stored
}

export function readLeveldbRecords(buffer: Buffer, checkCrc = false): Buffer[] {
  const records: Buffer[] = []
  let offset = 0
  let pending: Buffer | null = null

  while (offset < buffer.length) {
    const blockUsed = offset % BLOCK_SIZE
    const remaining = BLOCK_SIZE - blockUsed

    if (remaining < HEADER_LENGTH) {
      offset += remaining
      continue
    }

    let header: { crc: number; length: number; type: number }
    try {
      header = readHeader(buffer, offset)
    } catch (error) {
      if (error instanceof LeveldbEofError) {
        break
      }
      throw error
    }

    if (header.type === RECORD_NONE && header.length === 0) {
      offset += remaining
      continue
    }

    if (HEADER_LENGTH + header.length > remaining) {
      offset += remaining
      pending = null
      continue
    }

    const dataStart = offset + HEADER_LENGTH
    const dataEnd = dataStart + header.length
    if (dataEnd > buffer.length) {
      break
    }

    const data = buffer.subarray(dataStart, dataEnd)
    offset = dataEnd

    if (header.type === RECORD_NONE) {
      pending = null
      continue
    }

    if (checkCrc && !crcMatches(header.type, data, header.crc)) {
      throw new Error(`leveldb CRC が一致しません offset=${offset - HEADER_LENGTH - header.length}`)
    }

    if (header.type === RECORD_FULL) {
      records.push(Buffer.from(data))
      pending = null
      continue
    }

    if (header.type === RECORD_FIRST) {
      pending = Buffer.from(data)
      continue
    }

    if (header.type === RECORD_MIDDLE) {
      pending = pending ? Buffer.concat([pending, data]) : Buffer.from(data)
      continue
    }

    if (header.type === RECORD_LAST) {
      const complete = pending ? Buffer.concat([pending, data]) : Buffer.from(data)
      records.push(complete)
      pending = null
      continue
    }
  }

  return records
}

export function writeLeveldbRecord(data: Buffer): Buffer {
  return writeLeveldbRecords([data])
}

export function writeLeveldbRecords(records: Buffer[]): Buffer {
  const chunks: Buffer[] = []
  let blockUsed = 0

  const pad = (size: number): void => {
    if (size > 0) {
      chunks.push(Buffer.alloc(size))
    }
  }

  const writeFragment = (type: number, data: Buffer): void => {
    let remaining = BLOCK_SIZE - blockUsed
    if (remaining < HEADER_LENGTH) {
      pad(remaining)
      blockUsed = 0
      remaining = BLOCK_SIZE
    }

    const payload = Buffer.alloc(1 + data.length)
    payload[0] = type
    data.copy(payload, 1)
    const header = Buffer.alloc(HEADER_LENGTH)
    header.writeUInt32LE(maskLeveldbCrc(crc32c(payload)), 0)
    header.writeUInt16LE(data.length, 4)
    header.writeUInt8(type, 6)
    chunks.push(header, data)
    blockUsed += HEADER_LENGTH + data.length
    if (blockUsed >= BLOCK_SIZE) {
      blockUsed = 0
    }
  }

  for (const record of records) {
    let offset = 0
    let first = true
    while (offset < record.length || first) {
      let remaining = BLOCK_SIZE - blockUsed
      if (remaining < HEADER_LENGTH) {
        pad(remaining)
        blockUsed = 0
        remaining = BLOCK_SIZE
      }

      const take = Math.min(remaining - HEADER_LENGTH, Math.max(record.length - offset, 0))
      const isLast = offset + take >= record.length
      const type =
        first && isLast ? RECORD_FULL : first ? RECORD_FIRST : isLast ? RECORD_LAST : RECORD_MIDDLE
      writeFragment(type, record.subarray(offset, offset + take))
      offset += take
      first = false
      if (isLast) {
        break
      }
    }
  }

  return Buffer.concat(chunks)
}
