package com.firemint.data_transfer

class ProtoReader(private val data: ByteArray) {
  private var pos = 0

  private fun hasNext(): Boolean = pos < data.size

  private fun readVarint(): Long {
    var result = 0L
    var shift = 0
    while (true) {
      val b = data[pos].toInt() and 0xff
      pos++
      result = result or ((b.toLong() and 0x7f) shl shift)
      if (b and 0x80 == 0) {
        break
      }
      shift += 7
    }
    return result
  }

  private fun readFixed64(): Long {
    var result = 0L
    for (i in 0 until 8) {
      result = result or ((data[pos + i].toLong() and 0xff) shl (8 * i))
    }
    pos += 8
    return result
  }

  private fun readLen(): ByteArray {
    val len = readVarint().toInt()
    val out = data.copyOfRange(pos, pos + len)
    pos += len
    return out
  }

  private fun readGroup(fieldId: Int): ByteArray {
    val start = pos
    var depth = 0
    while (pos < data.size) {
      val before = pos
      val tag = readVarint()
      val fid = (tag ushr 3).toInt()
      val wireType = (tag and 0x7).toInt()
      when (wireType) {
        ProtoWire.WIRE_VARINT -> readVarint()
        ProtoWire.WIRE_FIXED64 -> pos += 8
        ProtoWire.WIRE_LEN -> {
          // 長さを読んでから足す（pos += readVarint() だと、長さを読む前の pos に足してしまう）
          val len = readVarint().toInt()
          pos += len
        }
        ProtoWire.WIRE_START_GROUP -> depth++
        ProtoWire.WIRE_END_GROUP -> {
          if (depth == 0 && fid == fieldId) {
            return data.copyOfRange(start, before)
          }
          depth--
        }
      }
    }
    return data.copyOfRange(start, data.size)
  }

  fun readFields(): List<Triple<Int, Int, Any>> {
    val out = ArrayList<Triple<Int, Int, Any>>()
    while (hasNext()) {
      val tag = readVarint()
      val fieldId = (tag ushr 3).toInt()
      val wireType = (tag and 0x7).toInt()
      when (wireType) {
        ProtoWire.WIRE_VARINT -> out.add(Triple(fieldId, wireType, readVarint()))
        ProtoWire.WIRE_FIXED64 -> out.add(Triple(fieldId, wireType, readFixed64()))
        ProtoWire.WIRE_LEN -> out.add(Triple(fieldId, wireType, readLen()))
        ProtoWire.WIRE_START_GROUP -> out.add(Triple(fieldId, wireType, readGroup(fieldId)))
        else -> return out
      }
    }
    return out
  }
}
