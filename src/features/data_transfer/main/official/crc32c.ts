const CASTAGNOLI = 0x82f63b78
const TABLE = new Uint32Array(256)

for (let index = 0; index < 256; index += 1) {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? CASTAGNOLI ^ (crc >>> 1) : crc >>> 1
  }
  TABLE[index] = crc >>> 0
}

export function crc32c(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc = TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const MASK_DELTA = 0xa282ead8

export function maskLeveldbCrc(crc: number): number {
  return (((crc >>> 15) | (crc << 17)) + MASK_DELTA) >>> 0
}
