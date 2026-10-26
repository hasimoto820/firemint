package com.firemint.data_transfer

object Crc32c {
  private val CASTAGNOLI = 0x82f63b78.toInt()
  private val TABLE = IntArray(256)

  init {
    for (index in 0 until 256) {
      var crc = index
      repeat(8) {
        crc = if (crc and 1 != 0) CASTAGNOLI xor (crc ushr 1) else crc ushr 1
      }
      TABLE[index] = crc
    }
  }

  fun crc32c(buffer: ByteArray): Int {
    var crc = 0.inv()
    for (b in buffer) {
      crc = TABLE[(crc xor (b.toInt() and 0xff)) and 0xff] xor (crc ushr 8)
    }
    return crc.inv()
  }

  private val MASK_DELTA = 0xa282ead8.toInt()

  fun maskLeveldbCrc(crc: Int): Int = ((crc ushr 15) or (crc shl 17)) + MASK_DELTA
}
