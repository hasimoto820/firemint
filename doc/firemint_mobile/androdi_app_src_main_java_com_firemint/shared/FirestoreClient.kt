package com.firemint.shared

import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class NeedTokenException : Exception("NEED_TOKEN")

// reason: Firestore のエラーの種類（"ABORTED"、"ALREADY_EXISTS" など）。読めない時は空
class FirestoreHttpException(val status: Int, detail: String, val reason: String = "") :
    Exception(detail)

// onUnauthorized: サーバーが権限エラー（401）を返した時に呼ぶ（保存したトークンを捨てる）
class FirestoreClient(
    private val tokenProvider: () -> String?,
    private val onUnauthorized: () -> Unit = {},
) {

  data class DocumentPage(
      val docs: List<Pair<String, String>>,
      val nextPageToken: String,
  )

  data class QueryDoc(val id: String, val path: String, val fieldsJson: String)

  // partial: 端末側で絞り込む演算子（部分一致・存在する・存在しない）で、
  //          コレクションの一部（先頭の fetchLimit 件）しか見ていない時に true
  // sourceCount: 絞り込む前の、コレクション（またはグループ）全体の件数
  data class QueryResult(
      val docs: List<QueryDoc>,
      val totalCount: Long,
      val partial: Boolean,
      val sourceCount: Long,
  )

  data class DumpPage(
      val docs: List<Pair<String, JSONObject>>,
      val nextPageToken: String,
  )

  fun listCollections(projectId: String, parentPath: String): List<String> {
    val all = ArrayList<String>()
    var token = ""
    repeat(20) {
      val body = JSONObject().put("pageSize", 300)
      if (token.isNotBlank()) {
        body.put("pageToken", token)
      }
      val json = request("POST", collectionIdsUrl(projectId, parentPath), body.toString())
      val ids = json.optJSONArray("collectionIds")
      if (ids != null) {
        for (i in 0 until ids.length()) {
          all.add(ids.getString(i))
        }
      }
      token = json.optString("nextPageToken")
      if (token.isBlank()) {
        return all
      }
    }
    return all
  }

  fun listDocuments(
      projectId: String,
      collectionPath: String,
      pageToken: String,
  ): DocumentPage {
    val col = requirePath(collectionPath, "collection")
    val qs = ArrayList<String>()
    qs.add("pageSize=100")
    if (pageToken.isNotBlank()) {
      qs.add("pageToken=${Uri.encode(pageToken)}")
    }
    val url = "${documentsRoot(projectId)}/${encodePath(col)}?${qs.joinToString("&")}"
    val json = request("GET", url, null)
    val docs = json.optJSONArray("documents") ?: JSONArray()
    val out = ArrayList<Pair<String, String>>()
    for (i in 0 until docs.length()) {
      val name = docs.getJSONObject(i).optString("name")
      if (name.isBlank()) {
        continue
      }
      val id = name.substringAfterLast('/')
      val path = name.substringAfter("/documents/")
      out.add(Uri.decode(id) to path)
    }
    return DocumentPage(out, json.optString("nextPageToken"))
  }

  fun listDumpPage(
      projectId: String,
      collectionPath: String,
      pageToken: String,
  ): DumpPage {
    val col = requirePath(collectionPath, "collection")
    val qs = ArrayList<String>()
    qs.add("pageSize=300")
    if (pageToken.isNotBlank()) {
      qs.add("pageToken=${Uri.encode(pageToken)}")
    }
    val url = "${documentsRoot(projectId)}/${encodePath(col)}?${qs.joinToString("&")}"
    val json = request("GET", url, null)
    val docs = json.optJSONArray("documents") ?: JSONArray()
    val out = ArrayList<Pair<String, JSONObject>>()
    for (i in 0 until docs.length()) {
      val doc = docs.getJSONObject(i)
      val name = doc.optString("name")
      if (name.isBlank()) {
        continue
      }
      val path = name.substringAfter("/documents/")
      out.add(path to (doc.optJSONObject("fields") ?: JSONObject()))
    }
    return DumpPage(out, json.optString("nextPageToken"))
  }

  fun getFieldsJson(projectId: String, documentPath: String): String {
    val url = "${documentsRoot(projectId)}/${encodePath(requirePath(documentPath, "document"))}"
    val json = request("GET", url, null)
    val fields = json.optJSONObject("fields")
    val plain = if (fields == null) JSONObject() else firestoreToPlain(fields, projectId)
    return prettyJson(plain)
  }

  fun saveFieldsJson(projectId: String, documentPath: String, fieldsJson: String) {
    val dest = requirePath(documentPath, "document")
    val body = fieldsBody(projectId, fieldsJson)
    val url = "${documentsRoot(projectId)}/${encodePath(dest)}"
    request("PATCH", url, body)
  }

  fun createFieldsJson(
      projectId: String,
      collectionPath: String,
      documentId: String,
      fieldsJson: String,
  ) {
    val col = requirePath(collectionPath, "collection")
    val id = requireSegment(documentId, "document_id")
    val dest = "$col/$id"
    val url =
        "${documentsRoot(projectId)}/${encodePath(dest)}?currentDocument.exists=false"
    request("PATCH", url, fieldsBody(projectId, fieldsJson))
  }

  fun countCollectionGroup(projectId: String, collectionId: String): Long {
    val from = JSONObject().put("collectionId", collectionId).put("allDescendants", true)
    val query = JSONObject().put("from", JSONArray().put(from))
    val body =
        JSONObject()
            .put(
                "structuredAggregationQuery",
                JSONObject()
                    .put("structuredQuery", query)
                    .put(
                        "aggregations",
                        JSONArray().put(JSONObject().put("alias", "total").put("count", JSONObject())),
                    ),
            )
    val rows =
        requestJsonArray("POST", "${documentsRoot(projectId)}:runAggregationQuery", body.toString())
    if (rows.length() == 0) {
      return 0
    }
    val fields =
        rows.optJSONObject(0)
            ?.optJSONObject("result")
            ?.optJSONObject("aggregateFields")
            ?.optJSONObject("total")
    val raw = fields?.optString("integerValue") ?: fields?.opt("doubleValue")?.toString()
    return raw?.toLongOrNull() ?: 0
  }

  // written: 書いた数 / skipped: 既にあったので書かなかった数（ALREADY_EXISTS）/
  // failed: それ以外の理由で書けなかった数 / skippedPaths: 既にあったドキュメントのパス
  data class BatchWriteResult(
      val written: Int,
      val skipped: Int,
      val failed: Int,
      val skippedPaths: List<String>,
  )

  // インポートの書き込み（002_007 json）。
  // 追記（overwrite = false）: 無いドキュメントだけを作る。既にあるドキュメントは、書かずにスキップとして数える
  //   （各書き込みに currentDocument.exists = false を付け、ALREADY_EXISTS で返ったものを数える）
  // 上書き（overwrite = true）: ドキュメントを丸ごと置き換える。無ければ作る（公式のインポートと同じ）
  fun batchWriteRawFields(
      projectId: String,
      docs: List<Pair<String, JSONObject>>,
      overwrite: Boolean,
  ): BatchWriteResult {
    if (docs.isEmpty()) {
      return BatchWriteResult(0, 0, 0, emptyList())
    }
    val writes = JSONArray()
    for ((path, fields) in docs) {
      val write =
          JSONObject()
              .put(
                  "update",
                  JSONObject()
                      .put("name", documentResourceName(projectId, requirePath(path, "document")))
                      .put("fields", fields),
              )
      if (!overwrite) {
        write.put("currentDocument", JSONObject().put("exists", false))
      }
      writes.put(write)
    }
    val body = JSONObject().put("writes", writes).toString()
    val json = request("POST", "${documentsRoot(projectId)}:batchWrite", body)
    val statuses = json.optJSONArray("status") ?: JSONArray()
    var written = 0
    var skipped = 0
    var failed = 0
    val skippedPaths = ArrayList<String>()
    // 結果が足りない時（返ってこなかった分）は、失敗に数える
    for (i in docs.indices) {
      val status = if (i < statuses.length()) statuses.optJSONObject(i) else null
      when (if (status == null) -1 else status.optInt("code", 0)) {
        0 -> written++
        CODE_ALREADY_EXISTS -> {
          skipped++
          skippedPaths.add(docs[i].first)
        }
        else -> failed++
      }
    }
    return BatchWriteResult(written, skipped, failed, skippedPaths)
  }

  // lastName: このページの最後のドキュメントの名前（次のページの起点）。最後のページなら空
  data class GroupDumpPage(val docs: List<Pair<String, JSONObject>>, val lastName: String)

  // コレクショングループを、ID の順に 1 ページ読む（型付きのまま）。after: 前のページの lastName
  fun listGroupDumpPage(projectId: String, collectionId: String, after: String): GroupDumpPage {
    val q =
        JSONObject()
            .put(
                "from",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("collectionId", requireSegment(collectionId, "collection"))
                            .put("allDescendants", true)),
            )
            .put(
                "orderBy",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("field", JSONObject().put("fieldPath", "__name__"))
                            .put("direction", "ASCENDING")),
            )
            .put("limit", GROUP_PAGE_SIZE)
    if (after.isNotEmpty()) {
      q.put(
          "startAt",
          JSONObject()
              .put("values", JSONArray().put(JSONObject().put("referenceValue", after)))
              .put("before", false),
      )
    }
    val rows =
        requestJsonArray(
            "POST", "${documentsRoot(projectId)}:runQuery", JSONObject().put("structuredQuery", q).toString())
    val out = ArrayList<Pair<String, JSONObject>>()
    var last = ""
    for (i in 0 until rows.length()) {
      val doc = rows.optJSONObject(i)?.optJSONObject("document") ?: continue
      val name = doc.optString("name")
      if (name.isBlank()) {
        continue
      }
      out.add(name.substringAfter("/documents/") to (doc.optJSONObject("fields") ?: JSONObject()))
      last = name
    }
    return GroupDumpPage(out, if (out.size < GROUP_PAGE_SIZE) "" else last)
  }

  // パスで指定したドキュメントを、まとめて読む（型付きのまま）。無いドキュメントは結果に入らない
  fun batchGetRawFields(projectId: String, paths: List<String>): Map<String, JSONObject> {
    if (paths.isEmpty()) {
      return emptyMap()
    }
    val names = JSONArray()
    paths.forEach { names.put(documentResourceName(projectId, requirePath(it, "document"))) }
    val rows =
        requestJsonArray(
            "POST",
            "${documentsRoot(projectId)}:batchGet",
            JSONObject().put("documents", names).toString(),
        )
    val out = HashMap<String, JSONObject>()
    for (i in 0 until rows.length()) {
      val found = rows.optJSONObject(i)?.optJSONObject("found") ?: continue
      val path = found.optString("name").substringAfter("/documents/")
      out[path] = found.optJSONObject("fields") ?: JSONObject()
    }
    return out
  }

  private fun documentResourceName(projectId: String, documentPath: String): String =
      "projects/$projectId/databases/(default)/documents/$documentPath"

  fun deleteDocument(projectId: String, documentPath: String) {
    val dest = requirePath(documentPath, "document")
    val url = "${documentsRoot(projectId)}/${encodePath(dest)}"
    request("DELETE", url, null)
  }

  // 検索の件数だけを数える（「全件」で読む前に、件数を確認に出すため）。
  // 端末側で絞り込む演算子の時は、コレクション（またはグループ）全体の件数になる
  fun countQuery(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      field: String,
      operator: String,
      value: String,
      operator2: String,
      value2: String,
      valueType: String,
  ): Long {
    val structured =
        structuredQuery(
            collectionPath, collectionGroup, field, operator, value, valueType, operator2, value2)
    return countDocuments(projectId, collectionPath, collectionGroup, structured)
  }

  // fetchAll = false … サーバーから取ってくるのは fetchLimit 件まで
  // fetchAll = true  … 上限なし。当てはまるもの（端末側で絞り込む演算子は、コレクション全体）を読む
  fun queryDocuments(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      field: String,
      operator: String,
      value: String,
      operator2: String,
      value2: String,
      valueType: String,
      fetchLimit: Int,
      fetchAll: Boolean,
  ): QueryResult {
    val structured =
        structuredQuery(
            collectionPath, collectionGroup, field, operator, value, valueType, operator2, value2)
    val total = countDocuments(projectId, collectionPath, collectionGroup, structured)
    if (isClientOperator(operator) && fetchAll) {
      val matched = scanAll(projectId, collectionPath, collectionGroup, field, operator, value)
      return QueryResult(matched, matched.size.toLong(), false, total)
    }
    val fetch =
        structuredQuery(
            collectionPath, collectionGroup, field, operator, value, valueType, operator2, value2)
    if (!fetchAll) {
      fetch.put("limit", fetchLimit.coerceIn(1, 500))
    }
    val body = JSONObject().put("structuredQuery", fetch)
    val rows = requestJsonArray("POST", runQueryUrl(projectId, collectionPath, collectionGroup), body.toString())
    val docs = parseQueryDocs(projectId, rows)
    if (isClientOperator(operator)) {
      val filtered = applyClientFilter(docs, field, operator, value)
      return QueryResult(filtered, filtered.size.toLong(), total > docs.size, total)
    }
    return QueryResult(docs, total, false, total)
  }

  // 端末側で絞り込む演算子の「全件」。コレクション全体を、ID の順に少しずつ読み、
  // 読むたびに絞り込む（端末に残すのは、当てはまったものだけ）
  private fun scanAll(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      field: String,
      operator: String,
      value: String,
  ): List<QueryDoc> {
    val matched = ArrayList<QueryDoc>()
    val url = runQueryUrl(projectId, collectionPath, collectionGroup)
    var last = ""
    while (true) {
      val page = structuredQuery(collectionPath, collectionGroup, field, operator, value)
      page.put(
          "orderBy",
          JSONArray()
              .put(
                  JSONObject()
                      .put("field", JSONObject().put("fieldPath", "__name__"))
                      .put("direction", "ASCENDING")),
      )
      page.put("limit", SCAN_PAGE_SIZE)
      if (last.isNotEmpty()) {
        // 前のページの最後のドキュメントの、次から
        page.put(
            "startAt",
            JSONObject()
                .put("values", JSONArray().put(JSONObject().put("referenceValue", last)))
                .put("before", false),
        )
      }
      val rows = requestJsonArray("POST", url, JSONObject().put("structuredQuery", page).toString())
      var read = 0
      for (i in 0 until rows.length()) {
        val name = rows.optJSONObject(i)?.optJSONObject("document")?.optString("name") ?: ""
        if (name.isNotEmpty()) {
          read++
          last = name
        }
      }
      matched.addAll(applyClientFilter(parseQueryDocs(projectId, rows), field, operator, value))
      if (read < SCAN_PAGE_SIZE) {
        return matched
      }
    }
  }

  // コレクションと、その下のサブコレクション（どの深さも）にあるドキュメントの合計。
  // コレクションを問わない全子孫の問い合わせ（collectionId の無い allDescendants）を、
  // 名前（__name__）がこのコレクションの下にあるものに絞って数える。
  // 範囲の端はドキュメントの名前にする（このコレクションの最小の ID 〜 次のコレクション名の最小の ID）
  fun countWithDescendants(projectId: String, collectionPath: String): Long {
    val path = requirePath(collectionPath, "collection").trim('/')
    val name = "projects/$projectId/databases/(default)/documents/$path"
    val minId = "__id-9223372036854775808__"
    fun bound(op: String, reference: String) =
        JSONObject()
            .put(
                "fieldFilter",
                JSONObject()
                    .put("field", JSONObject().put("fieldPath", "__name__"))
                    .put("op", op)
                    .put("value", JSONObject().put("referenceValue", reference)),
            )
    val where =
        JSONObject()
            .put(
                "compositeFilter",
                JSONObject()
                    .put("op", "AND")
                    .put(
                        "filters",
                        JSONArray()
                            .put(bound("GREATER_THAN_OR_EQUAL", "$name/$minId"))
                            .put(bound("LESS_THAN", "$name\u0000/$minId")),
                    ),
            )
    val query =
        JSONObject()
            .put("from", JSONArray().put(JSONObject().put("allDescendants", true)))
            .put("where", where)
    return countDocuments(projectId, collectionPath, false, query)
  }

  private fun countDocuments(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      structured: JSONObject,
  ): Long {
    val query = JSONObject(structured.toString())
    query.remove("limit")
    val body =
        JSONObject()
            .put(
                "structuredAggregationQuery",
                JSONObject()
                    .put("structuredQuery", query)
                    .put(
                        "aggregations",
                        JSONArray().put(JSONObject().put("alias", "total").put("count", JSONObject())),
                    ),
            )
    val rows =
        requestJsonArray(
            "POST",
            runAggregationUrl(projectId, collectionPath, collectionGroup),
            body.toString(),
        )
    if (rows.length() == 0) {
      return 0
    }
    val fields =
        rows.optJSONObject(0)
            ?.optJSONObject("result")
            ?.optJSONObject("aggregateFields")
            ?.optJSONObject("total")
    val raw = fields?.optString("integerValue") ?: fields?.opt("doubleValue")?.toString()
    return raw?.toLongOrNull() ?: 0
  }

  private fun structuredQuery(
      collectionPath: String,
      collectionGroup: Boolean,
      field: String,
      operator: String,
      value: String,
      valueType: String = TYPE_AUTO,
      operator2: String = "",
      value2: String = "",
  ): JSONObject {
    val colId = collectionId(collectionPath)
    val from = JSONObject().put("collectionId", colId)
    if (collectionGroup) {
      from.put("allDescendants", true)
    }
    val q = JSONObject().put("from", JSONArray().put(from))
    val where = serverWhere(field, operator, value, valueType, operator2, value2)
    if (where != null) {
      q.put("where", where)
    }
    return q
  }

  // 2つ目の条件（operator2 / value2）は、同じフィールドの範囲（< <= > >=）どうしの時だけ使う
  // （例: createdAt >= A かつ createdAt < B）。同じフィールドなので、複合インデックスは要らない
  private fun serverWhere(
      field: String,
      operator: String,
      value: String,
      valueType: String,
      operator2: String,
      value2: String,
  ): JSONObject? {
    val first = fieldFilter(field, operator, value, valueType) ?: return null
    if (!isRangeOperator(operator) || !isRangeOperator(operator2)) {
      return first
    }
    val second = fieldFilter(field, operator2, value2, valueType) ?: return first
    return JSONObject()
        .put(
            "compositeFilter",
            JSONObject().put("op", "AND").put("filters", JSONArray().put(first).put(second)),
        )
  }

  private fun isRangeOperator(operator: String) =
      operator == "<" || operator == "<=" || operator == ">" || operator == ">="

  private fun fieldFilter(
      field: String,
      operator: String,
      value: String,
      valueType: String,
  ): JSONObject? {
    val path = field.trim()
    if (path.isEmpty() || isClientOperator(operator)) {
      return null
    }
    val op = firestoreOp(operator) ?: return null
    if (!isListOperator(operator) && value.trim().isEmpty()) {
      return null
    }
    return JSONObject()
        .put(
            "fieldFilter",
            JSONObject()
                .put("field", JSONObject().put("fieldPath", path))
                .put("op", op)
                .put("value", filterValue(operator, value, valueType)),
        )
  }

  private fun firestoreOp(operator: String): String? =
      when (operator) {
        "==" -> "EQUAL"
        "!=" -> "NOT_EQUAL"
        "<" -> "LESS_THAN"
        "<=" -> "LESS_THAN_OR_EQUAL"
        ">" -> "GREATER_THAN"
        ">=" -> "GREATER_THAN_OR_EQUAL"
        "in" -> "IN"
        "not-in" -> "NOT_IN"
        "array-contains" -> "ARRAY_CONTAINS"
        "array-contains-any" -> "ARRAY_CONTAINS_ANY"
        else -> null
      }

  // 値が「, 区切りの一覧」になる演算子
  private fun isListOperator(operator: String) =
      operator == "in" || operator == "not-in" || operator == "array-contains-any"

  private fun isClientOperator(operator: String) =
      operator == "contains" || operator == "exists" || operator == "not-exists"

  private fun filterValue(operator: String, value: String, valueType: String): JSONObject {
    if (isListOperator(operator)) {
      val arr = JSONArray()
      value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
        arr.put(typedScalar(it, valueType))
      }
      return JSONObject().put("arrayValue", JSONObject().put("values", arr))
    }
    return typedScalar(value, valueType)
  }

  // 検索の「値」を、選ばれた「型」の値にする。
  // 自動 … 見た目から決める（true / false → 真偽値、数字 → 数値、他 → 文字列）
  // それ以外 … その型として読む。読めない時は、検索せずに止める
  private fun typedScalar(raw: String, valueType: String): JSONObject {
    val t = raw.trim()
    return when (valueType) {
      TYPE_STRING -> JSONObject().put("stringValue", t)
      TYPE_NUMBER -> {
        val number: Any =
            t.toLongOrNull()
                ?: t.toDoubleOrNull()
                ?: throw IllegalArgumentException("数値として読めません: $t")
        wrapScalar(number)
      }
      TYPE_BOOLEAN ->
          when (t) {
            "true" -> JSONObject().put("booleanValue", true)
            "false" -> JSONObject().put("booleanValue", false)
            else -> throw IllegalArgumentException("真偽値は true か false で書いてください: $t")
          }
      TYPE_TIMESTAMP -> JSONObject().put("timestampValue", timestampText(t))
      else -> wrapScalar(parseScalar(t))
    }
  }

  // 「2026-01-01」「2026-01-01 12:00」「2026-01-01 12:00:30」は、世界標準時（UTC）として、
  // そのまま使う。時間帯の調整はしない（画面に出る日時も UTC なので、見えている値をそのまま
  // 入れれば当たる。端末の時間帯の設定にも左右されない）。
  // 「2026-01-01T03:00:00Z」の形も、そのまま使う
  private fun timestampText(text: String): String {
    if (TIMESTAMP.matches(text)) {
      return text
    }
    val utcZone = TimeZone.getTimeZone("UTC")
    for (pattern in listOf("yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd")) {
      val format = SimpleDateFormat(pattern, Locale.US)
      format.isLenient = false
      format.timeZone = utcZone
      val pos = ParsePosition(0)
      val date = format.parse(text, pos)
      if (date != null && pos.index == text.length) {
        val utc = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        utc.timeZone = utcZone
        return utc.format(date)
      }
    }
    throw IllegalArgumentException("日時は 2026-01-01 12:00 の形で書いてください: $text")
  }

  private fun parseScalar(raw: String): Any {
    val t = raw.trim()
    if (t == "true") {
      return true
    }
    if (t == "false") {
      return false
    }
    t.toLongOrNull()?.let {
      return it
    }
    t.toDoubleOrNull()?.let {
      return it
    }
    return t
  }

  private fun applyClientFilter(
      docs: List<QueryDoc>,
      field: String,
      operator: String,
      value: String,
  ): List<QueryDoc> {
    val path = field.trim()
    if (path.isEmpty() || !isClientOperator(operator)) {
      return docs
    }
    return docs.filter { doc ->
      val obj = JSONObject(doc.fieldsJson)
      val has = obj.has(path) && obj.get(path) != JSONObject.NULL
      when (operator) {
        "exists" -> has
        "not-exists" -> !has
        "contains" -> has && obj.get(path).toString().contains(value)
        else -> true
      }
    }
  }

  private fun parseQueryDocs(projectId: String, rows: JSONArray): List<QueryDoc> {
    val out = ArrayList<QueryDoc>()
    for (i in 0 until rows.length()) {
      val document = rows.optJSONObject(i)?.optJSONObject("document") ?: continue
      val name = document.optString("name")
      if (name.isBlank()) {
        continue
      }
      val id = Uri.decode(name.substringAfterLast('/'))
      val path = name.substringAfter("/documents/")
      val fields = document.optJSONObject("fields")
      val plain = if (fields == null) JSONObject() else firestoreToPlain(fields, projectId)
      out.add(QueryDoc(id, path, plain.toString()))
    }
    return out
  }

  private fun collectionId(collectionPath: String): String {
    val t = requirePath(collectionPath, "collection")
    return t.substringAfterLast('/')
  }

  private fun runQueryUrl(projectId: String, collectionPath: String, collectionGroup: Boolean): String {
    val root = documentsRoot(projectId)
    if (collectionGroup) {
      return "$root:runQuery"
    }
    val parent = parentDocument(collectionPath)
    return if (parent == null) "$root:runQuery" else "$root/${encodePath(parent)}:runQuery"
  }

  private fun runAggregationUrl(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
  ): String {
    val root = documentsRoot(projectId)
    if (collectionGroup) {
      return "$root:runAggregationQuery"
    }
    val parent = parentDocument(collectionPath)
    return if (parent == null) {
      "$root:runAggregationQuery"
    } else {
      "$root/${encodePath(parent)}:runAggregationQuery"
    }
  }

  private fun parentDocument(collectionPath: String): String? {
    val parts = requirePath(collectionPath, "collection").split('/').filter { it.isNotEmpty() }
    if (parts.size < 2) {
      return null
    }
    return parts.dropLast(1).joinToString("/")
  }

  private fun collectionIdsUrl(projectId: String, parentPath: String): String {
    val base = documentsRoot(projectId)
    return if (parentPath.isBlank()) {
      "$base:listCollectionIds"
    } else {
      "$base/${encodePath(requirePath(parentPath, "document"))}:listCollectionIds"
    }
  }

  private fun fieldsBody(projectId: String, fieldsJson: String): String {
    val raw = fieldsJson.trim().ifBlank { "{}" }
    val plain = JSONObject(raw)
    return JSONObject().put("fields", plainToFirestore(plain, projectId)).toString()
  }

  private fun requirePath(path: String, label: String): String {
    val t = path.trim().trim('/')
    if (t.isEmpty()) {
      throw IllegalArgumentException("$label が空です")
    }
    return t
  }

  private fun requireSegment(id: String, label: String): String {
    val t = id.trim()
    if (t.isEmpty()) {
      throw IllegalArgumentException("$label が空です")
    }
    if ('/' in t) {
      throw IllegalArgumentException("$label に / は使えません")
    }
    return t
  }

  private fun documentsRoot(projectId: String) =
      "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents"

  private fun encodePath(path: String) =
      path.split('/').filter { it.isNotEmpty() }.joinToString("/") { Uri.encode(it) }

  private fun request(method: String, url: String, body: String?): JSONObject {
    val text = requestText(method, url, body)
    return if (text.isBlank()) JSONObject() else JSONObject(text)
  }

  private fun requestJsonArray(method: String, url: String, body: String?): JSONArray {
    val text = requestText(method, url, body).trim()
    if (text.isBlank()) {
      return JSONArray()
    }
    return JSONArray(text)
  }

  private fun requestText(method: String, url: String, body: String?): String {
    val token = tokenProvider() ?: throw NeedTokenException()
    val conn = (URL(url).openConnection() as HttpURLConnection)
    try {
      conn.requestMethod = method
      conn.connectTimeout = 20_000
      conn.readTimeout = 40_000
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Content-Type", "application/json")
      if (body != null) {
        conn.doOutput = true
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      }
      val code = conn.responseCode
      val text =
          try {
            (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()
                ?.readText()
                ?: ""
          } catch (_: IOException) {
            ""
          }
      if (code == 401) {
        onUnauthorized()
        throw NeedTokenException()
      }
      if (code !in 200..299) {
        // runQuery / runAggregationQuery は、エラーも配列（[{"error": {...}}]）で返す
        val error =
            try {
              val body = text.trim()
              if (body.startsWith("[")) {
                JSONArray(body).optJSONObject(0)?.optJSONObject("error")
              } else {
                JSONObject(body).optJSONObject("error")
              }
            } catch (_: Exception) {
              null
            }
        val msg = error?.optString("message") ?: text.ifBlank { "HTTP $code" }
        throw FirestoreHttpException(code, msg, error?.optString("status") ?: "")
      }
      return text
    } finally {
      conn.disconnect()
    }
  }

  // ---- query モードの JS（001_008_todo「query モードの JS」）----
  //
  // 値は、編集欄と同じ形（普通の JSON ＋ __firemint_type）で受け取る。
  // フィールドのパスは、区切った一覧（["a", "b"] … a.b）で受け取る。

  data class JsQueryResult(val docs: List<QueryDoc>, val partial: Boolean)

  // spec: {"filters": [{"field": [...], "op": "==", "value": ...}],
  //        "orderBy": [{"field": [...], "direction": "asc" | "desc"}],
  //        "limit": n}（limit は書いた時だけ）
  // 部分一致・存在する・存在しないは、サーバーで絞った結果を、端末でさらに絞る
  fun jsQuery(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      specJson: String,
      transaction: String,
  ): JsQueryResult {
    val spec = JSONObject(specJson)
    val q = structuredQuery(collectionPath, collectionGroup, "", "", "")
    val serverFilters = JSONArray()
    val clientFilters = ArrayList<JSONObject>()
    val filters = spec.optJSONArray("filters") ?: JSONArray()
    for (i in 0 until filters.length()) {
      val f = filters.getJSONObject(i)
      if (isClientOperator(f.getString("op"))) {
        clientFilters.add(f)
      } else {
        serverFilters.put(jsFilter(projectId, f))
      }
    }
    when (serverFilters.length()) {
      0 -> {}
      1 -> q.put("where", serverFilters.getJSONObject(0))
      else ->
          q.put(
              "where",
              JSONObject()
                  .put("compositeFilter", JSONObject().put("op", "AND").put("filters", serverFilters)),
          )
    }
    val orders = spec.optJSONArray("orderBy") ?: JSONArray()
    if (orders.length() > 0) {
      val out = JSONArray()
      for (i in 0 until orders.length()) {
        val o = orders.getJSONObject(i)
        out.put(
            JSONObject()
                .put("field", JSONObject().put("fieldPath", fieldPathText(o.getJSONArray("field"))))
                .put("direction", if (o.optString("direction") == "desc") "DESCENDING" else "ASCENDING"),
        )
      }
      q.put("orderBy", out)
    }
    val limit = if (spec.has("limit")) spec.getInt("limit") else null
    if (limit != null) {
      q.put("limit", limit)
    }
    val body = JSONObject().put("structuredQuery", q)
    if (transaction.isNotEmpty()) {
      body.put("transaction", transaction)
    }
    val rows =
        requestJsonArray("POST", runQueryUrl(projectId, collectionPath, collectionGroup), body.toString())
    var docs = parseQueryDocs(projectId, rows)
    val fetched = docs.size
    for (f in clientFilters) {
      docs =
          applyClientFilter(
              docs, fieldPathText(f.getJSONArray("field")), f.getString("op"), f.opt("value")?.toString() ?: "")
    }
    val partial = clientFilters.isNotEmpty() && limit != null && fetched >= limit
    return JsQueryResult(docs, partial)
  }

  // 無い時は null
  fun jsGet(projectId: String, documentPath: String, transaction: String): QueryDoc? {
    var url = "${documentsRoot(projectId)}/${encodePath(requirePath(documentPath, "document"))}"
    if (transaction.isNotEmpty()) {
      url += "?transaction=${Uri.encode(transaction)}"
    }
    val json =
        try {
          request("GET", url, null)
        } catch (e: FirestoreHttpException) {
          if (e.status == 404) {
            return null
          }
          throw e
        }
    val name = json.optString("name")
    val fields = json.optJSONObject("fields")
    val plain = if (fields == null) JSONObject() else firestoreToPlain(fields, projectId)
    return QueryDoc(Uri.decode(name.substringAfterLast('/')), name.substringAfter("/documents/"), plain.toString())
  }

  // writes: [{"delete": path}
  //          | {"path": ..., "fields": {...}, "mask": [[...], ...], "transforms": [...], "exists": bool}]
  //   mask: 書くフィールドの一覧（無い時は、ドキュメント全体の置き換え）
  //   transforms: [{"field": [...], "kind": "serverTimestamp" | "increment" | "arrayUnion"
  //                 | "arrayRemove", "value": ...}]
  //   exists: true … 有る時だけ（update） / false … 無い時だけ（create・add）
  // まとめて 1 回で書く（全部成功するか、全部失敗するか）
  fun jsCommit(projectId: String, writesJson: String, transaction: String) {
    val writes = JSONArray(writesJson)
    val out = JSONArray()
    for (i in 0 until writes.length()) {
      val w = writes.getJSONObject(i)
      if (w.has("delete")) {
        out.put(
            JSONObject()
                .put("delete", documentResourceName(projectId, requirePath(w.getString("delete"), "document"))))
        continue
      }
      val name = documentResourceName(projectId, requirePath(w.getString("path"), "document"))
      val write =
          JSONObject()
              .put(
                  "update",
                  JSONObject()
                      .put("name", name)
                      .put("fields", plainToFirestore(w.optJSONObject("fields") ?: JSONObject(), projectId)),
              )
      val mask = w.optJSONArray("mask")
      if (mask != null) {
        val paths = JSONArray()
        for (j in 0 until mask.length()) {
          paths.put(fieldPathText(mask.getJSONArray(j)))
        }
        write.put("updateMask", JSONObject().put("fieldPaths", paths))
      }
      val transforms = w.optJSONArray("transforms")
      if (transforms != null && transforms.length() > 0) {
        val list = JSONArray()
        for (j in 0 until transforms.length()) {
          list.put(fieldTransform(projectId, transforms.getJSONObject(j)))
        }
        write.put("updateTransforms", list)
      }
      if (w.has("exists")) {
        write.put("currentDocument", JSONObject().put("exists", w.getBoolean("exists")))
      }
      out.put(write)
    }
    if (out.length() == 0) {
      return
    }
    val body = JSONObject().put("writes", out)
    if (transaction.isNotEmpty()) {
      body.put("transaction", transaction)
    }
    request("POST", "${documentsRoot(projectId)}:commit", body.toString())
  }

  fun jsBeginTransaction(projectId: String): String {
    val json = request("POST", "${documentsRoot(projectId)}:beginTransaction", "{}")
    return json.getString("transaction")
  }

  fun jsRollback(projectId: String, transaction: String) {
    request(
        "POST",
        "${documentsRoot(projectId)}:rollback",
        JSONObject().put("transaction", transaction).toString(),
    )
  }

  private fun jsFilter(projectId: String, f: JSONObject): JSONObject {
    val operator = f.getString("op")
    val path = fieldPathText(f.getJSONArray("field"))
    val field = JSONObject().put("fieldPath", path)
    val value = f.opt("value")
    // null・NaN との比較は、REST では別の形（unaryFilter）で書く
    if (operator == "==" || operator == "!=") {
      val unary =
          when {
            value == null || value == JSONObject.NULL -> if (operator == "==") "IS_NULL" else "IS_NOT_NULL"
            value is JSONObject && value.optString(TYPE_KEY) == "double" && value.optString("value") == "NaN" ->
                if (operator == "==") "IS_NAN" else "IS_NOT_NAN"
            else -> null
          }
      if (unary != null) {
        return JSONObject().put("unaryFilter", JSONObject().put("field", field).put("op", unary))
      }
    }
    val op = firestoreOp(operator) ?: throw IllegalArgumentException("where の演算子が不明です: $operator")
    return JSONObject()
        .put(
            "fieldFilter",
            JSONObject().put("field", field).put("op", op).put("value", wrap(value, projectId)),
        )
  }

  private fun fieldTransform(projectId: String, t: JSONObject): JSONObject {
    val out = JSONObject().put("fieldPath", fieldPathText(t.getJSONArray("field")))
    when (val kind = t.getString("kind")) {
      "serverTimestamp" -> out.put("setToServerValue", "REQUEST_TIME")
      "increment" -> out.put("increment", wrap(t.get("value"), projectId))
      "arrayUnion" -> out.put("appendMissingElements", wrap(t.getJSONArray("value"), projectId).getJSONObject("arrayValue"))
      "arrayRemove" -> out.put("removeAllFromArray", wrap(t.getJSONArray("value"), projectId).getJSONObject("arrayValue"))
      else -> throw IllegalArgumentException("FieldValue が不明です: $kind")
    }
    return out
  }

  // ["a", "b-c"] → a.`b-c`（英数字と _ だけの名前は、そのまま）
  private fun fieldPathText(segments: JSONArray): String {
    if (segments.length() == 0) {
      throw IllegalArgumentException("フィールドが空です")
    }
    return (0 until segments.length()).joinToString(".") { i ->
      val s = segments.getString(i)
      if (SIMPLE_FIELD.matches(s)) s else "`" + s.replace("\\", "\\\\").replace("`", "\\`") + "`"
    }
  }

  // ---- 編集欄の JSON と、Firestore の型付きの値の変換 ----
  //
  // 読んで、そのまま保存しても、型が変わらないこと（001_008_todo 1）。
  // JSON でそのまま書ける型は、普通の JSON にする。
  //   文字列 "abc" / 整数 30 / 小数 1.0 / 真偽値 / null / 配列 / マップ
  // JSON で書けない型は、型の名前を添える（デスクトップ版 FireMint の serialize.ts と同じ形）。
  //   {"__firemint_type": "timestamp", "iso": "2026-10-12T00:00:00Z"}
  //   {"__firemint_type": "geopoint", "latitude": 35.6, "longitude": 139.7}
  //   {"__firemint_type": "reference", "path": "users/abc"}
  //   {"__firemint_type": "bytes", "base64": "AAEC"}
  //   {"__firemint_type": "double", "value": "NaN"}   … NaN / Infinity / -Infinity だけ
  // 保存の時に、JSON の見た目から型を推測しない（"0901234567" は文字列、30 は整数、1.0 は小数）。

  private fun firestoreToPlain(fields: JSONObject, projectId: String): JSONObject {
    val out = JSONObject()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      out.put(key, unwrap(fields.getJSONObject(key), projectId))
    }
    return out
  }

  private fun typed(type: String): JSONObject = JSONObject().put(TYPE_KEY, type)

  private fun unwrap(value: JSONObject, projectId: String): Any? {
    return when {
      value.has("nullValue") -> JSONObject.NULL
      value.has("booleanValue") -> value.getBoolean("booleanValue")
      value.has("integerValue") -> value.getString("integerValue").toLong()
      value.has("doubleValue") -> {
        // NaN と無限大は、REST では文字列で届く。JSON の数値では書けない
        val d = value.get("doubleValue").toString().toDouble()
        if (d.isNaN() || d.isInfinite()) typed("double").put("value", d.toString()) else d
      }
      value.has("stringValue") -> value.getString("stringValue")
      value.has("timestampValue") -> typed("timestamp").put("iso", value.getString("timestampValue"))
      value.has("bytesValue") -> typed("bytes").put("base64", value.getString("bytesValue"))
      value.has("referenceValue") ->
          typed("reference").put("path", referencePath(value.getString("referenceValue"), projectId))
      value.has("geoPointValue") -> {
        // 0 の時は、REST が項目ごと省く
        val geo = value.getJSONObject("geoPointValue")
        typed("geopoint")
            .put("latitude", geo.optDouble("latitude", 0.0))
            .put("longitude", geo.optDouble("longitude", 0.0))
      }
      value.has("arrayValue") -> {
        val values = value.getJSONObject("arrayValue").optJSONArray("values") ?: JSONArray()
        JSONArray().also { arr ->
          for (i in 0 until values.length()) {
            arr.put(unwrap(values.getJSONObject(i), projectId))
          }
        }
      }
      value.has("mapValue") -> {
        val inner = value.getJSONObject("mapValue").optJSONObject("fields") ?: JSONObject()
        firestoreToPlain(inner, projectId)
      }
      else -> value
    }
  }

  // 同じプロジェクトの中を指すリファレンスは、ドキュメントのパスだけにする。
  // 別のプロジェクト・データベースを指すものは、元の名前のまま出す
  private fun referencePath(name: String, projectId: String): String =
      name.removePrefix(documentResourceName(projectId, ""))

  private fun referenceName(path: String, projectId: String): String {
    val t = path.trim().trim('/')
    if (t.isEmpty()) {
      throw IllegalArgumentException("reference の path が空です")
    }
    return if (FULL_REFERENCE.containsMatchIn(t)) t else documentResourceName(projectId, t)
  }

  private fun plainToFirestore(plain: JSONObject, projectId: String): JSONObject {
    val fields = JSONObject()
    val keys = plain.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      fields.put(key, wrap(plain.get(key), projectId))
    }
    return fields
  }

  // 検索条件の値（真偽値・数値・文字列）
  private fun wrapScalar(value: Any): JSONObject = wrap(value, "")

  private fun wrap(value: Any?, projectId: String): JSONObject {
    val out = JSONObject()
    when (value) {
      null, JSONObject.NULL -> out.put("nullValue", "NULL_VALUE")
      is Boolean -> out.put("booleanValue", value)
      is Int -> out.put("integerValue", value.toString())
      is Long -> out.put("integerValue", value.toString())
      is Double -> out.put("doubleValue", value)
      is JSONArray -> {
        val values = JSONArray()
        for (i in 0 until value.length()) {
          values.put(wrap(value.get(i), projectId))
        }
        out.put("arrayValue", JSONObject().put("values", values))
      }
      is JSONObject ->
          if (value.has(TYPE_KEY)) {
            return wrapTyped(value, projectId)
          } else {
            out.put("mapValue", JSONObject().put("fields", plainToFirestore(value, projectId)))
          }
      else -> out.put("stringValue", value.toString())
    }
    return out
  }

  // 型の名前を添えた値。書き間違いは、保存せずに止める
  private fun wrapTyped(value: JSONObject, projectId: String): JSONObject {
    val out = JSONObject()
    when (val type = value.opt(TYPE_KEY)) {
      "timestamp" -> {
        val iso = (value.opt("iso") as? String)?.trim() ?: ""
        if (!TIMESTAMP.matches(iso)) {
          throw IllegalArgumentException(
              "timestamp の iso は 2026-10-12T00:00:00Z の形で書いてください: $iso")
        }
        out.put("timestampValue", iso)
      }
      "geopoint" -> {
        val latitude = value.opt("latitude") as? Number
        val longitude = value.opt("longitude") as? Number
        if (latitude == null || longitude == null) {
          throw IllegalArgumentException("geopoint の latitude / longitude は数値で書いてください")
        }
        out.put(
            "geoPointValue",
            JSONObject()
                .put("latitude", latitude.toDouble())
                .put("longitude", longitude.toDouble()),
        )
      }
      "reference" -> {
        val path = value.opt("path") as? String
            ?: throw IllegalArgumentException("reference の path は文字列で書いてください")
        out.put("referenceValue", referenceName(path, projectId))
      }
      "bytes" -> {
        val base64 = value.opt("base64") as? String
            ?: throw IllegalArgumentException("bytes の base64 は文字列で書いてください")
        out.put("bytesValue", base64)
      }
      "double" -> {
        val special = value.opt("value") as? String
        if (special != "NaN" && special != "Infinity" && special != "-Infinity") {
          throw IllegalArgumentException("double の value は NaN / Infinity / -Infinity のどれかです")
        }
        out.put("doubleValue", special)
      }
      else -> throw IllegalArgumentException("__firemint_type が不明です: $type")
    }
    return out
  }

  // 編集欄と同じ形のフィールドを、Firestore の型付きの値にする（JSON のインポート。002_007 json）
  fun plainFieldsToFirestore(projectId: String, plain: JSONObject): JSONObject =
      plainToFirestore(plain, projectId)

  // JSON Lines の 1 行（002_007 json）。{"path": フルパス, "data": 編集欄と同じ形のフィールド}
  fun documentJsonLine(projectId: String, path: String, fields: JSONObject): String =
      compactJson(JSONObject().put("path", path).put("data", firestoreToPlain(fields, projectId)))

  // 編集欄に出す JSON。org.json の toString は 1.0 を 1 と書く（整数と区別できなくなる）ので、
  // 小数は必ず小数点を付けて書く。文字列は quoteJson で書く（/ をエスケープしない）
  private fun prettyJson(value: Any?, indent: String = ""): String {
    val inner = "$indent  "
    return when (value) {
      null, JSONObject.NULL -> "null"
      is JSONObject -> {
        if (value.length() == 0) {
          return "{}"
        }
        val parts = ArrayList<String>()
        val keys = value.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          parts.add("$inner${quoteJson(key)}: ${prettyJson(value.get(key), inner)}")
        }
        "{\n${parts.joinToString(",\n")}\n$indent}"
      }
      is JSONArray -> {
        if (value.length() == 0) {
          return "[]"
        }
        val parts = ArrayList<String>()
        for (i in 0 until value.length()) {
          parts.add("$inner${prettyJson(value.get(i), inner)}")
        }
        "[\n${parts.joinToString(",\n")}\n$indent]"
      }
      is String -> quoteJson(value)
      // Kotlin の Double.toString は、必ず小数点か指数が付く（1.0 / 1.5 / 1.0E10）
      is Double -> value.toString()
      else -> value.toString()
    }
  }

  companion object {
    // 1 行に書く JSON（JSON Lines の行）。小数は必ず小数点を付けて書く（prettyJson と同じ）。
    // org.json の quote は / を \/ にするので、文字列は自前で書く
    fun compactJson(value: Any?): String =
        when (value) {
          null, JSONObject.NULL -> "null"
          is JSONObject -> {
            val parts = ArrayList<String>()
            val keys = value.keys()
            while (keys.hasNext()) {
              val key = keys.next()
              parts.add("${quoteJson(key)}:${compactJson(value.get(key))}")
            }
            "{${parts.joinToString(",")}}"
          }
          is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { compactJson(value.get(it)) }
          is String -> quoteJson(value)
          is Double -> value.toString()
          else -> value.toString()
        }

    private fun quoteJson(s: String): String {
      val sb = StringBuilder(s.length + 2)
      sb.append('"')
      for (c in s) {
        when {
          c == '"' -> sb.append("\\\"")
          c == '\\' -> sb.append("\\\\")
          c == '\n' -> sb.append("\\n")
          c == '\r' -> sb.append("\\r")
          c == '\t' -> sb.append("\\t")
          c < ' ' -> sb.append(String.format("\\u%04x", c.code))
          else -> sb.append(c)
        }
      }
      sb.append('"')
      return sb.toString()
    }

    private const val TYPE_KEY = "__firemint_type"
    private const val SCAN_PAGE_SIZE = 500
    private const val GROUP_PAGE_SIZE = 300
    // 検索の「値」の型（src/features/query/shared/query.ts の QueryValueType と同じ）
    private const val TYPE_AUTO = "auto"
    private const val TYPE_STRING = "string"
    private const val TYPE_NUMBER = "number"
    private const val TYPE_BOOLEAN = "boolean"
    private const val TYPE_TIMESTAMP = "timestamp"
    // RFC 3339（秒の小数は9桁まで。末尾は Z か +09:00 の形）
    private val TIMESTAMP =
        Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})""")
    // google.rpc.Code の ALREADY_EXISTS
    private const val CODE_ALREADY_EXISTS = 6
    private val SIMPLE_FIELD = Regex("""[A-Za-z_][A-Za-z_0-9]*""")
    private val FULL_REFERENCE = Regex("""^projects/[^/]+/databases/[^/]+/documents/""")
  }
}
