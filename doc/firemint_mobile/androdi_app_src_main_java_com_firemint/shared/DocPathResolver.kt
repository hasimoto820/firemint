package com.firemint.shared

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import android.provider.OpenableColumns

object DocPathResolver {

  fun queryDisplayName(resolver: ContentResolver, uri: Uri): String? {
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (idx >= 0) {
          return cursor.getString(idx)
        }
      }
    }
    return uri.lastPathSegment
  }

  fun readableDocPath(context: Context, uri: Uri): String? {
    if (uri.authority != "com.android.externalstorage.documents") {
      // 他のプロバイダ（別アプリのファイラーなど）はドキュメントIDが実パスと
      // 対応する保証がない。誤ったパスを自信ありげに出すより諦める。
      return null
    }
    val docId =
        try {
          DocumentsContract.getDocumentId(uri)
        } catch (_: Exception) {
          return null
        }
    val volume = docId.substringBefore(':', missingDelimiterValue = "")
    val relative = docId.substringAfter(':', missingDelimiterValue = docId)
    return when {
      volume == "primary" -> "${Environment.getExternalStorageDirectory().absolutePath}/$relative"
      volume == "raw" -> relative
      volume.isNotEmpty() -> volumeRoot(context, volume)?.let { "$it/$relative" } ?: docId
      else -> docId
    }
  }

  private fun volumeRoot(context: Context, volumeId: String): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return null
    }
    val manager =
        context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager ?: return null
    return manager.storageVolumes
        .firstOrNull { it.uuid == volumeId }
        ?.directory
        ?.absolutePath
  }
}
