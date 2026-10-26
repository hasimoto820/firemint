package com.firemint.data_transfer

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.firemint.connection.GoogleSessionStore
import com.firemint.shared.DocPathResolver
import com.firemint.shared.FirestoreClient
import com.firemint.shared.FirestoreHttpException
import com.firemint.shared.NeedTokenException
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class TransferModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val store = GoogleSessionStore(reactContext.applicationContext)
  private val firestore = FirestoreClient({ store.accessToken() }, { store.clearAccessToken() })
  private val dumpExport = DumpExport(reactContext.applicationContext, firestore)
  private val dumpVerify = DumpVerify(firestore)
  private val dumpImport = DumpImport(firestore)
  private val jsonlImport = JsonlImport(firestore)
  private var pickImportPromise: Promise? = null
  private var pickExportDestPromise: Promise? = null

  @Volatile private var progressDone = 0
  @Volatile private var progressTotal = -1
  // 中止が押されたか。エクスポート・インポートを始める時に戻す（001_008_todo 項目 6）
  @Volatile private var cancelRequested = false

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    reactContext.removeActivityEventListener(this)
    scope.cancel()
  }

  private fun resetProgress() {
    progressDone = 0
    progressTotal = -1
  }

  @ReactMethod
  fun getProgress(promise: Promise) {
    val out = Arguments.createMap()
    out.putInt("done", progressDone)
    out.putInt("total", progressTotal)
    promise.resolve(out)
  }

  @ReactMethod
  fun cancelTransfer(promise: Promise) {
    cancelRequested = true
    promise.resolve(null)
  }

  // kind: "project"（roots を出す）/ "collection"（target はコレクションのパス）/
  //       "group"（target はコレクション ID）
  @ReactMethod
  fun exportDump(
      projectId: String,
      kind: String,
      target: String,
      roots: ReadableArray,
      includeSubcollections: Boolean,
      destUri: String,
      json: Boolean,
      promise: Promise,
  ) {
    resetProgress()
    cancelRequested = false
    scope.launch {
      try {
        val exportScope =
            when (kind) {
              "project" ->
                  DumpExport.Scope.Project((0 until roots.size()).mapNotNull { roots.getString(it) })
              "collection" -> DumpExport.Scope.Collection(target, includeSubcollections)
              "group" -> DumpExport.Scope.Group(target)
              else -> throw IllegalArgumentException("範囲が不明です: $kind")
            }
        // 保存先を選んだ時は、最初からその場所に書く（コピーしない。001_008_todo 項目 5）
        val dest =
            if (destUri.isBlank()) {
              null
            } else {
              val uri = Uri.parse(destUri)
              uri to (DocPathResolver.queryDisplayName(reactContext.contentResolver, uri) ?: destUri)
            }
        val result =
            dumpExport.export(projectId, exportScope, dest, json, { cancelRequested }) { done ->
              progressDone = done
            }
        val path = result.displayPath
        val out = Arguments.createMap()
        out.putString("path", path)
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun verifyDumpQuick(projectId: String, zipPath: String, promise: Promise) {
    scope.launch {
      try {
        val rows = dumpVerify.verifyQuick(projectId, verifySource(projectId, zipPath))
        val arr = Arguments.createArray()
        rows.forEach { row ->
          val map = Arguments.createMap()
          map.putString("collectionId", row.collectionId)
          putCount(map, "cloud", row.cloud)
          putCount(map, "file", row.file)
          arr.pushMap(map)
        }
        promise.resolve(arr)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun verifyDumpDetailed(projectId: String, zipPath: String, promise: Promise) {
    resetProgress()
    scope.launch {
      try {
        val rows =
            dumpVerify.verifyDetailed(projectId, verifySource(projectId, zipPath)) { done ->
              progressDone = done
            }
        val arr = Arguments.createArray()
        rows.forEach { row ->
          val map = Arguments.createMap()
          map.putString("collectionId", row.collectionId)
          putSide(map, "cloud", row.cloud)
          putSide(map, "file", row.file)
          arr.pushMap(map)
        }
        promise.resolve(arr)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  // インポートするファイルのエクスポート元のプロジェクト。分からなければ空
  //   公式ダンプ: エンティティのキー / JSON: 見出しの projectId
  @ReactMethod
  fun importSourceProject(zipPath: String, promise: Promise) {
    scope.launch {
      try {
        val open = opener(zipPath)
        promise.resolve(
            if (ImportFormat.isZip(open)) DumpReader.sourceProjectId(open)
            else JsonlReader.header(open).projectId)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  // 検証するファイル。形式は中身で決める（002_007 json）
  private fun verifySource(projectId: String, zipPath: String): DumpVerify.Source {
    val open = opener(zipPath)
    return if (ImportFormat.isZip(open)) dumpVerify.dumpSource(projectId, open)
    else dumpVerify.jsonlSource(projectId, open)
  }

  @ReactMethod
  fun importDump(projectId: String, zipPath: String, overwrite: Boolean, promise: Promise) {
    resetProgress()
    cancelRequested = false
    scope.launch {
      try {
        val open = opener(zipPath)
        val onProgress: (Int, Int) -> Unit = { done, total ->
          progressDone = done
          progressTotal = total
        }
        // 形式は中身で決める（002_007 json）
        val result =
            if (ImportFormat.isZip(open)) {
              dumpImport.import(projectId, open, overwrite, { cancelRequested }, onProgress)
            } else {
              jsonlImport.import(projectId, open, overwrite, { cancelRequested }, onProgress)
            }
        val out = Arguments.createMap()
        out.putInt("total", result.total)
        out.putInt("imported", result.imported)
        out.putInt("skipped", result.skipped)
        out.putInt("failed", result.failed)
        val samples = Arguments.createArray()
        result.existingSamples.forEach { samples.pushString(it) }
        out.putArray("existingSamples", samples)
        // 途中で止まった時は、そこまでの件数と一緒に、止まった理由を返す
        val stopped = result.stoppedError
        out.putBoolean("cancelled", stopped is TransferCancelledException)
        if (stopped == null) {
          out.putNull("stoppedError")
        } else {
          out.putString(
              "stoppedError",
              if (stopped is NeedTokenException) "Cloud の権限がありません"
              else stopped.message ?: stopped.javaClass.simpleName,
          )
        }
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  private fun putSide(map: WritableMap, key: String, side: DumpVerify.Side?) {
    if (side == null) {
      map.putNull(key)
      return
    }
    val sideMap = Arguments.createMap()
    sideMap.putInt("total", side.total)
    sideMap.putInt("only", side.only)
    map.putMap(key, sideMap)
  }

  private fun putCount(map: WritableMap, key: String, value: Long?) {
    if (value == null) {
      map.putNull(key)
    } else {
      map.putDouble(key, value.toDouble())
    }
  }

  @ReactMethod
  fun pickImportFile(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    if (pickImportPromise != null) {
      promise.reject("BUSY", "選択中です")
      return
    }
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          // .jsonl は、保存先によって種類の付き方が違う
          putExtra(
              Intent.EXTRA_MIME_TYPES,
              arrayOf(
                  "application/zip",
                  "application/octet-stream",
                  "application/json",
                  "application/jsonl",
                  "application/x-ndjson",
                  "text/plain",
              ),
          )
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, exportDirUri())
          }
        }
    pickImportPromise = promise
    try {
      activity.startActivityForResult(intent, REQ_PICK_IMPORT)
    } catch (e: Exception) {
      pickImportPromise = null
      promise.reject("PICK_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  // json: JSON Lines（.jsonl）を保存する時。ファイルの種類の指定が変わる
  fun pickExportLocation(suggestedName: String, json: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    if (pickExportDestPromise != null) {
      promise.reject("BUSY", "選択中です")
      return
    }
    val intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = if (json) DumpExport.JSONL_MIME else DumpExport.ZIP_MIME
          putExtra(Intent.EXTRA_TITLE, suggestedName)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, exportDirUri())
          }
        }
    pickExportDestPromise = promise
    try {
      activity.startActivityForResult(intent, REQ_PICK_EXPORT_DEST)
    } catch (e: Exception) {
      pickExportDestPromise = null
      promise.reject("PICK_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQ_PICK_IMPORT -> onImportPicked(resultCode, data)
      REQ_PICK_EXPORT_DEST -> onExportDestPicked(resultCode, data)
    }
  }

  private fun onImportPicked(resultCode: Int, data: Intent?) {
    val promise = pickImportPromise ?: return
    pickImportPromise = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.reject("CANCELLED", "cancelled")
      return
    }
    scope.launch {
      try {
        // 以前の版が作っていた、インポート用のコピーの残りを消す
        File(reactContext.cacheDir, "import").deleteRecursively()
        val resolver = reactContext.contentResolver
        val name = DocPathResolver.queryDisplayName(resolver, uri) ?: uri.lastPathSegment ?: "import.zip"
        // コピーは作らず、選んだファイルを直接読む（001_008_todo 項目 5）。path はその URI
        val out = Arguments.createMap()
        out.putString("path", uri.toString())
        out.putString("name", name)
        out.putString("displayPath", DocPathResolver.readableDocPath(reactContext, uri) ?: name)
        promise.resolve(out)
      } catch (e: Exception) {
        promise.reject("PICK_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  private fun onExportDestPicked(resultCode: Int, data: Intent?) {
    val promise = pickExportDestPromise ?: return
    pickExportDestPromise = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.reject("CANCELLED", "cancelled")
      return
    }
    val name = DocPathResolver.queryDisplayName(reactContext.contentResolver, uri) ?: uri.lastPathSegment ?: "export.zip"
    val out = Arguments.createMap()
    out.putString("uri", uri.toString())
    out.putString("name", name)
    out.putString("path", DocPathResolver.readableDocPath(reactContext, uri) ?: name)
    // 既にあるファイルを選んだか（新しく作られたファイルは 0）。分からない時は -1
    val size =
        try {
          reactContext.contentResolver
              .query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)
              ?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null }
        } catch (_: Exception) {
          null
        }
    out.putDouble("size", (size ?: -1L).toDouble())
    promise.resolve(out)
  }

  override fun onNewIntent(intent: Intent) {}

  // 選んだインポート元のファイルを開く（読むたびに開き直す）
  private fun opener(zipUri: String): () -> InputStream = {
    try {
      reactContext.contentResolver.openInputStream(Uri.parse(zipUri))
    } catch (_: FileNotFoundException) {
      null
    } ?: throw IllegalArgumentException("ファイルが見つかりません")
  }

  // 保存先を選んだだけで、エクスポートしなかった時の空のファイルを消す（001_008_todo 項目 5）。
  // 中身がある（エクスポート済み）・大きさが分からない時は、消さない
  @ReactMethod
  fun discardExportLocation(destUri: String, promise: Promise) {
    scope.launch {
      try {
        val resolver = reactContext.contentResolver
        val uri = Uri.parse(destUri)
        val size =
            resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
              if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null
            }
        if (size == 0L) {
          DocumentsContract.deleteDocument(resolver, uri)
        }
      } catch (_: Exception) {}
      promise.resolve(null)
    }
  }

  private fun exportDirUri(): Uri =
      DocumentsContract.buildDocumentUri(
          "com.android.externalstorage.documents",
          "primary:${android.os.Environment.DIRECTORY_DOCUMENTS}/${DumpExport.EXPORT_DIR_NAME}",
      )

  private fun reject(promise: Promise, e: Exception) {
    when (e) {
      is NeedTokenException -> promise.reject("NEED_TOKEN", "Cloud の権限がありません")
      is IllegalArgumentException -> promise.reject("BAD_PATH", e.message, e)
      is DumpCorruptException -> promise.reject("CORRUPT", e.message, e)
      is TransferCancelledException -> promise.reject("CANCELLED", e.message, e)
      is IllegalStateException -> promise.reject("TRANSFER_FAILED", e.message, e)
      is FirestoreHttpException -> promise.reject("FIRESTORE", e.message ?: "HTTP ${e.status}", e)
      else -> promise.reject("TRANSFER_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  companion object {
    const val NAME = "Transfer"
    private const val REQ_PICK_IMPORT = 4291
    private const val REQ_PICK_EXPORT_DEST = 4292
  }
}
