package com.firemint.data_transfer

import java.io.ByteArrayOutputStream

object ProtoWire {
  const val WIRE_VARINT = 0
  const val WIRE_FIXED64 = 1
  const val WIRE_LEN = 2
  const val WIRE_START_GROUP = 3
  const val WIRE_END_GROUP = 4

  fun encodeVarintField(id: Int, value: Long): ByteArray {
    val out = ByteArrayOutputStream()
    writeTag(id, WIRE_VARINT, out)
    writeVarint(value, out)
    return out.toByteArray()
  }

  fun encodeBytesField(id: Int, value: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    writeTag(id, WIRE_LEN, out)
    writeVarint(value.size.toLong(), out)
    out.write(value)
    return out.toByteArray()
  }

  fun encodeUtf8Field(id: Int, value: String): ByteArray =
      encodeBytesField(id, value.toByteArray(Charsets.UTF_8))

  fun encodeDoubleField(id: Int, value: Double): ByteArray {
    val out = ByteArrayOutputStream()
    writeTag(id, WIRE_FIXED64, out)
    val bits = java.lang.Double.doubleToRawLongBits(value)
    val raw = ByteArray(8)
    for (i in 0 until 8) {
      raw[i] = ((bits ushr (8 * i)) and 0xff).toByte()
    }
    out.write(raw)
    return out.toByteArray()
  }

  fun encodeGroupField(id: Int, body: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    writeTag(id, WIRE_START_GROUP, out)
    out.write(body)
    writeTag(id, WIRE_END_GROUP, out)
    return out.toByteArray()
  }

  fun encodeMessageField(id: Int, body: ByteArray): ByteArray = encodeBytesField(id, body)

  fun concat(parts: List<ByteArray>): ByteArray {
    val out = ByteArrayOutputStream()
    parts.forEach { out.write(it) }
    return out.toByteArray()
  }

  private fun writeTag(id: Int, wire: Int, out: ByteArrayOutputStream) {
    writeVarint(((id shl 3) or wire).toLong(), out)
  }

  private fun writeVarint(value: Long, out: ByteArrayOutputStream) {
    var rest = value.toULong()
    while (rest >= 0x80u) {
      out.write(((rest and 0x7Fu) or 0x80u).toInt())
      rest = rest shr 7
    }
    out.write(rest.toInt())
  }
}
