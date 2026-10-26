package com.firemint.data_transfer

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.firemint.shared.FirestoreClient
import java.io.File
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.json.JSONArray
import org.json.JSONObject

class DumpExport(
    private val context: Context,
    private val firestore: FirestoreClient,
) {

  private sealed class ExportTarget {
    abstract val displayPath: String

    abstract fun outputStream(): OutputStream

    abstract fun finish()

    // 途中で止まった・中身が無かった時に、書きかけのファイルを消す
    abstract fun discard()

    class MediaStoreTarget(
        private val resolver: ContentResolver,
        private val uri: Uri,
        override val displayPath: String,
    ) : ExportTarget() {

      override fun outputStream(): OutputStream =
          resolver.openOutputStream(uri) ?: throw IllegalStateException("保存先を開けませんでした")

      override fun finish() {
        val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
        resolver.update(uri, values, null, null)
      }

      override fun discard() {
        resolver.delete(uri, null, null)
      }
    }

    // 利用者が選んだ保存先（ACTION_CREATE_DOCUMENT で作られたファイル）
    class UriTarget(
        private val resolver: ContentResolver,
        private val uri: Uri,
        override val displayPath: String,
    ) : ExportTarget() {

      override fun outputStream(): OutputStream =
          resolver.openOutputStream(uri, "wt") ?: throw IllegalStateException("保存先を開けませんでした")

      override fun finish() {}

      override fun discard() {
        try {
          DocumentsContract.deleteDocument(resolver, uri)
        } catch (_: Exception) {}
      }
    }

    class FileTarget(private val file: File) : ExportTarget() {
      override val displayPath: String = file.absolutePath

      override fun outputStream(): OutputStream = file.outputStream()

      override fun finish() {}

      override fun discard() {
        file.delete()
      }
    }
  }

  data class ExportResult(val displayPath: String)

  // エクスポートの範囲（001_008_todo 項目 6）
  sealed class Scope {
    // 選んだルートコレクション。サブコレクションは常に含む
    data class Project(val roots: List<String>) : Scope()

    data class Collection(val path: String, val includeSubcollections: Boolean) : Scope()

    // コレクショングループ。サブコレクションは含まない
    data class Group(val collectionId: String) : Scope()
  }

  // 1 ページ読むたびに、ファイルへ書き足す（全体をメモリに載せない。001_008_todo 項目 4）。
  // 途中で止まった・中止した・中身が無かった時は、書きかけのファイルを消す。
  // dest: 利用者が選んだ保存先。選んでいない時は null で、Documents/FireMint に書く（項目 5）
  // json: 公式ダンプ（zip）ではなく、JSON Lines（.jsonl）で書く（002_007 json）
  // isCancelled: 中止が押されたか。1 ページごとに見る（項目 6）
  fun export(
      projectId: String,
      scope: Scope,
      dest: Pair<Uri, String>?,
      json: Boolean,
      isCancelled: () -> Boolean,
      onProgress: ((Int) -> Unit)? = null,
  ): ExportResult {
    val app = "s~$projectId"
    val stamp = stamp()
    val (kindFolder, baseName) =
        when (scope) {
          is Scope.Project -> "all_kinds" to "export-project-${safeName(projectId)}-$stamp"
          is Scope.Collection -> {
            val id = safeName(scope.path.trim('/').substringAfterLast('/'))
            "kind_$id" to "export-collection-$id-$stamp"
          }
          is Scope.Group -> {
            val id = safeName(scope.collectionId.trim())
            "kind_$id" to "export-group-$id-$stamp"
          }
        }
    val target =
        if (dest == null) {
          if (json) resolveTarget("$baseName.jsonl", JSONL_MIME) else resolveTarget("$baseName.zip", ZIP_MIME)
        } else {
          ExportTarget.UriTarget(context.contentResolver, dest.first, dest.second)
        }
    var count = 0
    val onPage: () -> Unit = {
      if (isCancelled()) {
        throw TransferCancelledException()
      }
      onProgress?.invoke(count)
    }
    try {
      target.outputStream().use { stream ->
        if (json) {
          stream.bufferedWriter(Charsets.UTF_8).let { out ->
            out.write(FirestoreClient.compactJson(jsonHeader(projectId, scope)))
            out.write("\n")
            forEachDocument(projectId, scope, onPage) { path, fields ->
              out.write(firestore.documentJsonLine(projectId, path, fields))
              out.write("\n")
              count++
            }
            out.flush()
          }
        } else {
          ZipOutputStream(stream).use { zip ->
            zip.putNextEntry(ZipEntry("$stamp.overall_export_metadata"))
            zip.closeEntry()
            zip.putNextEntry(ZipEntry("all_namespaces/$kindFolder/all_namespaces_$kindFolder.export_metadata"))
            zip.closeEntry()
            zip.putNextEntry(ZipEntry("all_namespaces/$kindFolder/output-0"))
            val writer = LeveldbLogWriter(zip)
            forEachDocument(projectId, scope, onPage) { path, fields ->
              writer.add(EntityEncoder.encode(path, fields, app))
              count++
            }
            zip.closeEntry()
          }
        }
      }
      if (count == 0) {
        throw IllegalStateException("エクスポートするドキュメントがありません")
      }
    } catch (e: Exception) {
      target.discard()
      throw e
    }
    target.finish()
    return ExportResult(target.displayPath)
  }

  // 範囲の中のドキュメントを、1 ページずつ読んで write に渡す
  private fun forEachDocument(
      projectId: String,
      scope: Scope,
      onPage: () -> Unit,
      write: (String, JSONObject) -> Unit,
  ) {
    when (scope) {
      is Scope.Project -> {
        if (scope.roots.isEmpty()) {
          throw IllegalArgumentException("エクスポートするコレクションを選んでください")
        }
        scope.roots.forEach { id -> walk(projectId, id, true, write, onPage) }
      }
      is Scope.Collection ->
          walk(projectId, scope.path.trim().trim('/'), scope.includeSubcollections, write, onPage)
      is Scope.Group -> {
        var after = ""
        do {
          val page = firestore.listGroupDumpPage(projectId, scope.collectionId.trim(), after)
          page.docs.forEach { (path, fields) -> write(path, fields) }
          onPage()
          after = page.lastName
        } while (after.isNotEmpty())
      }
    }
  }

  // JSON Lines の 1 行目（見出し）
  private fun jsonHeader(projectId: String, scope: Scope): JSONObject {
    val scopeJson =
        when (scope) {
          is Scope.Project ->
              JSONObject().put("kind", "project").put("roots", JSONArray(scope.roots))
          is Scope.Collection ->
              JSONObject()
                  .put("kind", "collection")
                  .put("path", scope.path.trim().trim('/'))
                  .put("includeSubcollections", scope.includeSubcollections)
          is Scope.Group ->
              JSONObject().put("kind", "group").put("collectionId", scope.collectionId.trim())
        }
    val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    iso.timeZone = TimeZone.getTimeZone("UTC")
    return JSONObject()
        .put("kind", JSONL_KIND)
        .put("version", JSONL_VERSION)
        .put("projectId", projectId)
        .put("scope", scopeJson)
        .put("createdAt", iso.format(Date()))
  }

  private fun resolveTarget(fileName: String, mimeType: String): ExportTarget {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val values =
          ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                "${Environment.DIRECTORY_DOCUMENTS}/$EXPORT_DIR_NAME",
            )
            put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
      val uri =
          resolver.insert(MediaStore.Files.getContentUri("external"), values)
              ?: throw IllegalStateException("保存先を作れませんでした")
      val root = Environment.getExternalStorageDirectory().absolutePath
      val displayPath = "$root/${Environment.DIRECTORY_DOCUMENTS}/$EXPORT_DIR_NAME/$fileName"
      return ExportTarget.MediaStoreTarget(resolver, uri, displayPath)
    }
    val dir =
        File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), EXPORT_DIR_NAME)
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return ExportTarget.FileTarget(File(dir, fileName))
  }

  // コレクション（includeSubcollections の時は、その下のサブコレクションも）を、1 ページずつ読んで write に渡す
  private fun walk(
      projectId: String,
      collectionPath: String,
      includeSubcollections: Boolean,
      write: (String, JSONObject) -> Unit,
      onPage: () -> Unit,
  ) {
    val queue = ArrayDeque<String>()
    queue.add(collectionPath)
    while (queue.isNotEmpty()) {
      val col = queue.removeFirst()
      var token = ""
      do {
        val page = firestore.listDumpPage(projectId, col, token)
        for ((path, fields) in page.docs) {
          write(path, fields)
          if (includeSubcollections) {
            firestore.listCollections(projectId, path).forEach { sub ->
              queue.add("$path/$sub")
            }
          }
        }
        onPage()
        token = page.nextPageToken
      } while (token.isNotBlank())
    }
  }

  private fun stamp(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH_mm_ss_SSS", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt.format(Date())
  }

  private fun safeName(raw: String): String {
    val t = raw.replace(Regex("[^A-Za-z0-9._-]"), "_")
    return t.ifBlank { "kind" }
  }

  companion object {
    const val EXPORT_DIR_NAME = "FireMint"
    const val ZIP_MIME = "application/zip"
    // application/json などにすると、保存の時に拡張子 .json が足されることがある
    const val JSONL_MIME = "application/octet-stream"
    // JSON Lines の見出し（002_007 json）
    const val JSONL_KIND = "firemint-docs"
    const val JSONL_VERSION = 1
  }
}
