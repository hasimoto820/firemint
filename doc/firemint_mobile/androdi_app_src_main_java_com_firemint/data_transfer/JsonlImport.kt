package com.firemint.data_transfer

import com.firemint.shared.FirestoreClient
import java.io.BufferedReader
import java.io.InputStream
import org.json.JSONObject

// インポートするファイルの形式（002_007 json）。zip なら公式ダンプ、それ以外は JSON Lines として見出しを読む
object ImportFormat {
  fun isZip(open: () -> InputStream): Boolean =
      open().use { input ->
        val head = ByteArray(4)
        var read = 0
        while (read < head.size) {
          val n = input.read(head, read, head.size - read)
          if (n < 0) {
            break
          }
          read += n
        }
        read == 4 &&
            head[0] == 'P'.code.toByte() &&
            head[1] == 'K'.code.toByte() &&
            head[2] == 3.toByte() &&
            head[3] == 4.toByte()
      }
}

// JSON Lines の読み方（002_007 json）。1 行目は見出し、2 行目から 1 行 1 ドキュメント
object JsonlReader {
  // scopeKind: 見出しの scope.kind（project / collection / group）
  data class Header(val projectId: String, val scopeKind: String)

  // 見出しを読む。FireMint の JSON ファイルでない・版が違う時は、書き始める前に止める
  fun header(open: () -> InputStream): Header =
      open().bufferedReader(Charsets.UTF_8).use { reader -> readHeader(reader) }

  // 見出しの後の、空でない行を 1 行ずつ渡す。onLine が false を返したら止める
  fun forEachLine(open: () -> InputStream, onLine: (String) -> Boolean) {
    open().bufferedReader(Charsets.UTF_8).use { reader ->
      readHeader(reader)
      while (true) {
        val line = reader.readLine() ?: break
        if (line.isBlank()) {
          continue
        }
        if (!onLine(line)) {
          return
        }
      }
    }
  }

  fun countLines(open: () -> InputStream): Int {
    var count = 0
    forEachLine(open) {
      count++
      true
    }
    return count
  }

  // 1 行をドキュメントとして読む。読めない（JSON でない・path や data が不正）時は null
  fun decode(line: String): Pair<String, JSONObject>? =
      try {
        val obj = JSONObject(line)
        val path = obj.optString("path").trim().trim('/')
        val data = obj.optJSONObject("data")
        val segments = path.split('/')
        if (data == null || path.isEmpty() || segments.size % 2 != 0 || segments.any { it.isBlank() }) {
          null
        } else {
          path to data
        }
      } catch (_: Exception) {
        null
      }

  private fun readHeader(reader: BufferedReader): Header {
    val first = reader.readLine()?.removePrefix("﻿")
    val obj =
        try {
          if (first.isNullOrBlank()) null else JSONObject(first)
        } catch (_: Exception) {
          null
        }
    if (obj == null || obj.optString("kind") != DumpExport.JSONL_KIND) {
      throw IllegalStateException("FireMint の JSON ファイルではありません（1 行目の見出しがありません）")
    }
    val version = obj.optInt("version", -1)
    if (version != DumpExport.JSONL_VERSION) {
      throw IllegalStateException("この版の JSON ファイルには対応していません（version $version）")
    }
    return Header(obj.optString("projectId"), obj.optJSONObject("scope")?.optString("kind") ?: "")
  }
}

// JSON Lines のインポート。数え方と書き方は、公式ダンプ（DumpImport）と同じ
class JsonlImport(private val firestore: FirestoreClient) {

  fun import(
      projectId: String,
      open: () -> InputStream,
      overwrite: Boolean,
      isCancelled: () -> Boolean,
      onProgress: ((Int, Int) -> Unit)? = null,
  ): DumpImport.Result {
    // 1 回目: 見出しを確かめ、件数を数える（進み具合の総数）
    val total = JsonlReader.countLines(open)
    if (total == 0) {
      throw IllegalStateException("インポートするドキュメントがありません")
    }
    var imported = 0
    var skipped = 0
    var failed = 0
    val samples = ArrayList<String>()
    var processed = 0
    var stopped: Exception? = null
    val chunk = ArrayList<Pair<String, JSONObject>>()
    // 同じパスの 2 回目以降は書かない（最初の行だけを書く）
    val seen = HashSet<String>()

    fun flush(): Boolean {
      if (chunk.isEmpty()) {
        return true
      }
      val result =
          try {
            firestore.batchWriteRawFields(projectId, chunk, overwrite)
          } catch (e: Exception) {
            stopped = e
            return false
          }
      imported += result.written
      skipped += result.skipped
      failed += result.failed
      result.skippedPaths.take(EXISTING_SAMPLE_MAX - samples.size).forEach { samples.add(it) }
      processed += chunk.size
      chunk.clear()
      onProgress?.invoke(processed, total)
      return true
    }

    // 2 回目: 頭から読み、BATCH_SIZE 件たまったら書く
    onProgress?.invoke(0, total)
    JsonlReader.forEachLine(open) { line ->
      if (isCancelled()) {
        stopped = TransferCancelledException()
        return@forEachLine false
      }
      val doc = JsonlReader.decode(line)
      val fields =
          doc?.let {
            try {
              firestore.plainFieldsToFirestore(projectId, it.second)
            } catch (_: Exception) {
              null
            }
          }
      when {
        doc == null || fields == null -> {
          failed++
          processed++
          true
        }
        !seen.add(doc.first) -> {
          skipped++
          processed++
          true
        }
        else -> {
          chunk.add(doc.first to fields)
          chunk.size < BATCH_SIZE || flush()
        }
      }
    }
    if (stopped == null) {
      flush()
    }
    return DumpImport.Result(total, imported, skipped, failed, samples, stopped)
  }

  companion object {
    private const val BATCH_SIZE = 500
    private const val EXISTING_SAMPLE_MAX = 20
  }
}
