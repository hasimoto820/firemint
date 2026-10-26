package com.firemint.data_transfer

import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

// ダンプのファイルの構造が壊れている（LeveldbLogReader）
class DumpCorruptException : IllegalStateException("ファイルが壊れています")

// エクスポート・インポートの中止（001_008_todo 項目 6）
class TransferCancelledException : Exception("中止しました")

// ダンプの zip を、頭から少しずつ読む（全体をメモリに載せない。001_008_todo 項目 4）。
// open は、利用者が選んだファイルを開く（コピーは作らない。項目 5）。読むたびに開き直す
object DumpReader {
  // output-N のレコードを、頭から 1 件ずつ渡す。onRecord が false を返したら、そこで止める。
  // 構造が壊れていれば DumpCorruptException
  fun forEachRecord(open: () -> InputStream, onRecord: (ByteArray) -> Boolean) {
    ZipInputStream(open()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (!entry.isDirectory && File(entry.name).name.startsWith("output-")) {
          val reader = LeveldbLogReader(zip)
          while (true) {
            val record = reader.next() ?: break
            if (!onRecord(record)) {
              return
            }
          }
        }
        zip.closeEntry()
        entry = zip.nextEntry
      }
    }
  }

  // レコードの数（読み取れないレコードも含む）。ファイル全体を一度読むので、構造が壊れていればここで分かる
  fun countRecords(open: () -> InputStream): Int {
    var count = 0
    forEachRecord(open) {
      count++
      true
    }
    return count
  }

  // エクスポート元のプロジェクト（最初に読めたドキュメントのキーから）。分からなければ空
  fun sourceProjectId(open: () -> InputStream): String {
    var projectId = ""
    forEachRecord(open) { record ->
      val entity = decode(record) ?: return@forEachRecord true
      projectId = entity.projectId
      false
    }
    return projectId
  }

  // ドキュメントとして読む。読めなければ null
  fun decode(record: ByteArray): EntityDecoder.Entity? =
      try {
        EntityDecoder.decode(record)
      } catch (_: Exception) {
        null
      }

  fun isProjectScope(open: () -> InputStream): Boolean {
    ZipInputStream(open()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name.startsWith("all_namespaces/all_kinds/")) {
          return true
        }
        zip.closeEntry()
        entry = zip.nextEntry
      }
    }
    return false
  }
}
