package com.firemint.data_transfer

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream

// 公式ダンプの output-N の形式（LevelDB のログ）。
// 32KB のブロックに、レコードを断片（FULL / FIRST / MIDDLE / LAST）に分けて並べる。
// 読み書きとも、全体をメモリに載せず、ブロック単位で進める（001_008_todo 項目 4）。
object LeveldbLog {
  const val BLOCK_SIZE = 32 * 1024
  const val HEADER_LENGTH = 7
  const val RECORD_FULL = 1
  const val RECORD_FIRST = 2
  const val RECORD_MIDDLE = 3
  const val RECORD_LAST = 4

  fun readUInt16Le(buf: ByteArray, offset: Int): Int =
      (buf[offset].toInt() and 0xff) or ((buf[offset + 1].toInt() and 0xff) shl 8)

  fun readUInt32Le(buf: ByteArray, offset: Int): Int =
      (buf[offset].toInt() and 0xff) or
          ((buf[offset + 1].toInt() and 0xff) shl 8) or
          ((buf[offset + 2].toInt() and 0xff) shl 16) or
          ((buf[offset + 3].toInt() and 0xff) shl 24)

  fun writeUInt16Le(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = (value and 0xff).toByte()
    buf[offset + 1] = ((value ushr 8) and 0xff).toByte()
  }

  fun writeUInt32Le(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = (value and 0xff).toByte()
    buf[offset + 1] = ((value ushr 8) and 0xff).toByte()
    buf[offset + 2] = ((value ushr 16) and 0xff).toByte()
    buf[offset + 3] = ((value ushr 24) and 0xff).toByte()
  }
}

// レコードを 1 件ずつ書き足す。out は閉じない（zip のエントリーの中に書くため）
class LeveldbLogWriter(private val out: OutputStream) {
  private var blockUsed = 0

  fun add(record: ByteArray) {
    var offset = 0
    var first = true
    while (true) {
      var remaining = LeveldbLog.BLOCK_SIZE - blockUsed
      if (remaining < LeveldbLog.HEADER_LENGTH) {
        // ヘッダーが入らない余りは、0 で埋めて次のブロックへ
        if (remaining > 0) {
          out.write(ByteArray(remaining))
        }
        blockUsed = 0
        remaining = LeveldbLog.BLOCK_SIZE
      }
      val take = minOf(remaining - LeveldbLog.HEADER_LENGTH, record.size - offset)
      val isLast = offset + take >= record.size
      val type =
          when {
            first && isLast -> LeveldbLog.RECORD_FULL
            first -> LeveldbLog.RECORD_FIRST
            isLast -> LeveldbLog.RECORD_LAST
            else -> LeveldbLog.RECORD_MIDDLE
          }
      writeFragment(type, record, offset, take)
      offset += take
      first = false
      if (isLast) {
        return
      }
    }
  }

  private fun writeFragment(type: Int, data: ByteArray, offset: Int, length: Int) {
    val payload = ByteArray(1 + length)
    payload[0] = type.toByte()
    System.arraycopy(data, offset, payload, 1, length)
    val crc = Crc32c.maskLeveldbCrc(Crc32c.crc32c(payload))
    val header = ByteArray(LeveldbLog.HEADER_LENGTH)
    LeveldbLog.writeUInt32Le(header, 0, crc)
    LeveldbLog.writeUInt16Le(header, 4, length)
    header[6] = type.toByte()
    out.write(header)
    out.write(data, offset, length)
    blockUsed += LeveldbLog.HEADER_LENGTH + length
    if (blockUsed >= LeveldbLog.BLOCK_SIZE) {
      blockUsed = 0
    }
  }
}

// レコードを 1 件ずつ読む。input は閉じない（zip のエントリーから読むため）。
// 構造が壊れている（途切れている・チェックサムが合わない・知らない種類・断片の並びがおかしい）時は、
// DumpCorruptException。読めたところまでで黙って止めない（001_008_todo 項目 2）
class LeveldbLogReader(private val input: InputStream) {
  private val block = ByteArray(LeveldbLog.BLOCK_SIZE)
  private var blockLen = 0
  private var pos = 0

  // 終わりなら null
  fun next(): ByteArray? {
    var pending: ByteArrayOutputStream? = null
    while (true) {
      if (pos >= blockLen && !readBlock()) {
        if (pending != null) {
          throw DumpCorruptException()
        }
        return null
      }
      if (LeveldbLog.BLOCK_SIZE - pos < LeveldbLog.HEADER_LENGTH) {
        // ブロックの末尾の、0 で埋めた余り
        pos = blockLen
        continue
      }
      if (pos + LeveldbLog.HEADER_LENGTH > blockLen) {
        // ファイルの最後で、ヘッダーが途切れている
        if (!allZero(pos, blockLen)) {
          throw DumpCorruptException()
        }
        pos = blockLen
        continue
      }
      val length = LeveldbLog.readUInt16Le(block, pos + 4)
      val type = block[pos + 6].toInt()
      if (type == 0 && length == 0) {
        // 0 で埋めた領域。このブロックの残りを飛ばす
        if (!allZero(pos, blockLen)) {
          throw DumpCorruptException()
        }
        pos = blockLen
        continue
      }
      val bodyStart = pos + LeveldbLog.HEADER_LENGTH
      val bodyEnd = bodyStart + length
      if (bodyEnd > blockLen) {
        throw DumpCorruptException()
      }
      val payload = block.copyOfRange(pos + 6, bodyEnd)
      if (Crc32c.maskLeveldbCrc(Crc32c.crc32c(payload)) != LeveldbLog.readUInt32Le(block, pos)) {
        throw DumpCorruptException()
      }
      pos = bodyEnd
      when (type) {
        LeveldbLog.RECORD_FULL -> {
          if (pending != null) {
            throw DumpCorruptException()
          }
          return block.copyOfRange(bodyStart, bodyEnd)
        }
        LeveldbLog.RECORD_FIRST -> {
          if (pending != null) {
            throw DumpCorruptException()
          }
          pending = ByteArrayOutputStream()
          pending.write(block, bodyStart, length)
        }
        LeveldbLog.RECORD_MIDDLE ->
            (pending ?: throw DumpCorruptException()).write(block, bodyStart, length)
        LeveldbLog.RECORD_LAST -> {
          val whole = pending ?: throw DumpCorruptException()
          whole.write(block, bodyStart, length)
          return whole.toByteArray()
        }
        else -> throw DumpCorruptException()
      }
    }
  }

  // 次のブロックを読む。最後のブロックは 32KB より短い。もう無ければ false
  private fun readBlock(): Boolean {
    var n = 0
    while (n < block.size) {
      val r = input.read(block, n, block.size - n)
      if (r < 0) {
        break
      }
      n += r
    }
    blockLen = n
    pos = 0
    return n > 0
  }

  private fun allZero(from: Int, to: Int): Boolean {
    for (i in from until to) {
      if (block[i].toInt() != 0) {
        return false
      }
    }
    return true
  }
}
