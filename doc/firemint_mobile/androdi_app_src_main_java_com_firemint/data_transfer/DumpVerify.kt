package com.firemint.data_transfer

import com.firemint.shared.FirestoreClient
import java.io.InputStream
import org.json.JSONArray
import org.json.JSONObject

class DumpVerify(private val firestore: FirestoreClient) {

  companion object {
    // 詳細検証で、クラウドからまとめて読む件数
    private const val VERIFY_CHUNK = 300
  }

  data class Side(val total: Int, val only: Int)

  data class Row(val collectionId: String, val cloud: Side?, val file: Side?)

  data class QuickRow(val collectionId: String, val cloud: Long?, val file: Long?)

  // 検証するファイル。公式ダンプと JSON Lines（002_007 json）で、読み方だけが違う
  interface Source {
    // ドキュメントを 1 件ずつ渡す（パスと、Firestore の型付きのフィールド）。読めないものは飛ばす
    fun forEach(onDoc: (String, JSONObject) -> Unit)

    // プロジェクト全体のエクスポートか（クラウドにだけあるコレクションも行に出すため）
    fun isProjectScope(): Boolean
  }

  // リファレンスは、インポートと同じく宛先プロジェクトに書き換えて比べる
  fun dumpSource(projectId: String, open: () -> InputStream): Source =
      object : Source {
        override fun forEach(onDoc: (String, JSONObject) -> Unit) {
          DumpReader.forEachRecord(open) { record ->
            DumpReader.decode(record)?.let {
              onDoc(it.path, EntityDecoder.withReferenceProject(it.fields, projectId))
            }
            true
          }
        }

        override fun isProjectScope(): Boolean = DumpReader.isProjectScope(open)
      }

  // 同じパスの 2 回目以降は、インポートと同じく数えない
  fun jsonlSource(projectId: String, open: () -> InputStream): Source =
      object : Source {
        override fun forEach(onDoc: (String, JSONObject) -> Unit) {
          val seen = HashSet<String>()
          JsonlReader.forEachLine(open) { line ->
            JsonlReader.decode(line)?.let { (path, data) ->
              val fields =
                  try {
                    firestore.plainFieldsToFirestore(projectId, data)
                  } catch (_: Exception) {
                    null
                  }
              if (fields != null && seen.add(path)) {
                onDoc(path, fields)
              }
            }
            true
          }
        }

        override fun isProjectScope(): Boolean = JsonlReader.header(open).scopeKind == "project"
      }

  // ファイルを頭から少しずつ読んで、コレクション ID ごとの件数を数える
  fun verifyQuick(projectId: String, source: Source): List<QuickRow> {
    val fileCounts = LinkedHashMap<String, Long>()
    source.forEach { path, _ ->
      val kind = kindOf(path)
      fileCounts[kind] = (fileCounts[kind] ?: 0L) + 1L
    }
    if (fileCounts.isEmpty()) {
      throw IllegalStateException("検証するドキュメントがありません")
    }

    val ids = LinkedHashSet<String>(fileCounts.keys)
    if (source.isProjectScope()) {
      ids.addAll(firestore.listCollections(projectId, ""))
    }

    return ids.map { id ->
      val cloudTotal = firestore.countCollectionGroup(projectId, id)
      QuickRow(id, if (cloudTotal > 0) cloudTotal else null, fileCounts[id])
    }
  }

  // ファイルを頭から少しずつ読み、読んだ分だけクラウドからまとめて読んで比べる
  // （全体をメモリに載せない。001_008_todo 項目 4）。
  // 「クラウドにしか無い」数は、件数の差で出す
  // （コレクション ID ごとのクラウドの件数 − ファイルとクラウドの両方にあった件数）
  fun verifyDetailed(
      projectId: String,
      source: Source,
      onProgress: ((Int) -> Unit)? = null,
  ): List<Row> {
    // コレクション ID ごとの、ファイルの件数・ファイルにしか無い数・両方にあった数・中身が違う数
    val fileCount = LinkedHashMap<String, Int>()
    val fileOnly = HashMap<String, Int>()
    val matched = HashMap<String, Int>()
    val changed = HashMap<String, Int>()
    val chunk = ArrayList<Pair<String, JSONObject>>()
    var processed = 0

    fun add(map: MutableMap<String, Int>, kind: String) {
      map[kind] = (map[kind] ?: 0) + 1
    }

    fun compare() {
      if (chunk.isEmpty()) {
        return
      }
      val cloud = firestore.batchGetRawFields(projectId, chunk.map { it.first })
      for ((path, fields) in chunk) {
        val kind = kindOf(path)
        val cloudFields = cloud[path]
        if (cloudFields == null) {
          add(fileOnly, kind)
        } else {
          add(matched, kind)
          if (!fieldsEqual(fields, cloudFields)) {
            add(changed, kind)
          }
        }
      }
      processed += chunk.size
      chunk.clear()
      onProgress?.invoke(processed)
    }

    source.forEach { path, fields ->
      add(fileCount, kindOf(path))
      chunk.add(path to fields)
      if (chunk.size >= VERIFY_CHUNK) {
        compare()
      }
    }
    compare()
    if (fileCount.isEmpty()) {
      throw IllegalStateException("検証するドキュメントがありません")
    }

    val ids = LinkedHashSet<String>(fileCount.keys)
    if (source.isProjectScope()) {
      ids.addAll(firestore.listCollections(projectId, ""))
    }

    return ids.map { id ->
      val cloudTotal = firestore.countCollectionGroup(projectId, id).toInt()
      val both = matched[id] ?: 0
      val diff = changed[id] ?: 0
      val cloudSide =
          if (cloudTotal > 0) Side(cloudTotal, (cloudTotal - both).coerceAtLeast(0) + diff) else null
      val fileSide = fileCount[id]?.let { Side(it, (fileOnly[id] ?: 0) + diff) }
      Row(id, cloudSide, fileSide)
    }
  }

  private fun kindOf(path: String): String {
    val segments = path.split('/').filter { it.isNotEmpty() }
    return if (segments.size >= 2) segments[segments.size - 2] else segments.lastOrNull() ?: ""
  }

  // REST は、空の配列・空のマップ（values / fields）と、位置情報の 0 を省く。
  // 片方にだけ無いキーは、もう片方がその「省かれる値」なら同じとみなす
  private fun fieldsEqual(a: JSONObject, b: JSONObject): Boolean {
    val keys = HashSet<String>()
    a.keys().forEach { keys.add(it) }
    b.keys().forEach { keys.add(it) }
    for (key in keys) {
      val av = a.opt(key)
      val bv = b.opt(key)
      val same =
          when {
            av == null -> isOmittable(bv)
            bv == null -> isOmittable(av)
            else -> valuesEqual(av, bv)
          }
      if (!same) {
        return false
      }
    }
    return true
  }

  private fun isOmittable(value: Any?): Boolean =
      when (value) {
        is JSONArray -> value.length() == 0
        is JSONObject -> value.length() == 0
        is Number -> value.toDouble() == 0.0
        else -> false
      }

  private fun valuesEqual(a: Any, b: Any): Boolean =
      when {
        // null は、クラウドからは {"nullValue": null}、JSON から作ると {"nullValue": "NULL_VALUE"}。どちらも null
        a is JSONObject && b is JSONObject && a.has("nullValue") && b.has("nullValue") -> true
        a is JSONObject && b is JSONObject && a.has("timestampValue") && b.has("timestampValue") ->
            parseIsoMicros(a.getString("timestampValue")) == parseIsoMicros(b.getString("timestampValue"))
        a is JSONObject && b is JSONObject -> fieldsEqual(a, b)
        a is JSONArray && b is JSONArray ->
            a.length() == b.length() && (0 until a.length()).all { valuesEqual(a.get(it), b.get(it)) }
        // 小数（doubleValue・位置情報）は、値で比べる。JSON の読み方で、35.0 が Integer 35 になることがある
        a is Number && b is Number -> a.toDouble() == b.toDouble()
        else -> a == b
      }

  private fun parseIsoMicros(iso: String): Long? {
    val trimmed = iso.trim().removeSuffix("Z")
    val dot = trimmed.indexOf('.')
    val main = if (dot >= 0) trimmed.substring(0, dot) else trimmed
    val fracRaw = if (dot >= 0) trimmed.substring(dot + 1) else ""
    val fracMicros = fracRaw.padEnd(6, '0').take(6).toLongOrNull() ?: 0L
    return try {
      val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
      fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
      val seconds = (fmt.parse(main)?.time ?: return null) / 1000L
      seconds * 1_000_000L + fracMicros
    } catch (_: Exception) {
      null
    }
  }
}
