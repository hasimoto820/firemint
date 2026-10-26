package com.firemint.data_transfer

import com.firemint.shared.FirestoreClient
import java.io.InputStream

class DumpImport(private val firestore: FirestoreClient) {

  // total: ファイルのレコード数（読み取れなかったものも含む）
  // imported: 書いた数 / skipped: 既にあったので書かなかった数 /
  // failed: 書けなかった数（読み取れなかったレコードを含む）
  // existingSamples: 既にあったドキュメントの例（EXISTING_SAMPLE_MAX 件まで）
  // stoppedError: 途中で止まった時の理由（中止は TransferCancelledException）。最後まで進んだ時は null
  data class Result(
      val total: Int,
      val imported: Int,
      val skipped: Int,
      val failed: Int,
      val existingSamples: List<String>,
      val stoppedError: Exception?,
  )

  // ファイルが無い・壊れている・中身が無い時は、書き始める前に例外で止める。
  // overwrite: 上書き（true）か追記（false）か（002_007 json）
  fun import(
      projectId: String,
      open: () -> InputStream,
      overwrite: Boolean,
      isCancelled: () -> Boolean,
      onProgress: ((Int, Int) -> Unit)? = null,
  ): Result {
    // 1 回目: 件数を数える（進み具合の総数）。構造が壊れていれば、書き始める前にここで止まる
    val total = DumpReader.countRecords(open)
    if (total == 0) {
      throw IllegalStateException("インポートするドキュメントがありません")
    }
    var imported = 0
    var skipped = 0
    var failed = 0
    val samples = ArrayList<String>()
    var processed = 0
    var stopped: Exception? = null
    val chunk = ArrayList<EntityDecoder.Entity>()

    // 溜まった分を書く。途中で止まった時は false
    fun flush(): Boolean {
      if (chunk.isEmpty()) {
        return true
      }
      val result =
          try {
            firestore.batchWriteRawFields(
                projectId,
                chunk.map { it.path to EntityDecoder.withReferenceProject(it.fields, projectId) },
                overwrite,
            )
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
    DumpReader.forEachRecord(open) { record ->
      // 中止が押された時は、そこまでで止める（001_008_todo 項目 6）
      if (isCancelled()) {
        stopped = TransferCancelledException()
        return@forEachRecord false
      }
      val entity = DumpReader.decode(record)
      if (entity == null) {
        failed++
        processed++
        true
      } else {
        chunk.add(entity)
        chunk.size < BATCH_SIZE || flush()
      }
    }
    if (stopped == null) {
      flush()
    }
    stopped?.let { return Result(total, imported, skipped, failed, samples, it) }
    return Result(total, imported, skipped, failed, samples, null)
  }

  companion object {
    private const val BATCH_SIZE = 500
    // デスクトップ版（write_dump.ts）と同じ
    private const val EXISTING_SAMPLE_MAX = 20
  }
}
