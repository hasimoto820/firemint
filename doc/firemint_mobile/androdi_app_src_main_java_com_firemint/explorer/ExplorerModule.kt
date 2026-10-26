package com.firemint.explorer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.firemint.connection.GoogleSessionStore
import com.firemint.shared.FirestoreClient
import com.firemint.shared.FirestoreHttpException
import com.firemint.shared.NeedTokenException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ExplorerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val store = GoogleSessionStore(reactContext.applicationContext)
  private val firestore = FirestoreClient({ store.accessToken() }, { store.clearAccessToken() })

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    scope.cancel()
  }

  @ReactMethod
  fun listCollections(projectId: String, parentPath: String, promise: Promise) {
    scope.launch { run(promise) { firestore.listCollections(projectId, parentPath) } }
  }

  @ReactMethod
  fun listDocuments(
      projectId: String,
      collectionPath: String,
      pageToken: String?,
      promise: Promise,
  ) {
    scope.launch {
      try {
        val page = firestore.listDocuments(projectId, collectionPath, pageToken.orEmpty())
        val arr = Arguments.createArray()
        page.docs.forEach { (id, path) ->
          val map = Arguments.createMap()
          map.putString("id", id)
          map.putString("path", path)
          arr.pushMap(map)
        }
        val out = Arguments.createMap()
        out.putArray("documents", arr)
        out.putString("nextPageToken", page.nextPageToken)
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun getDocument(projectId: String, documentPath: String, promise: Promise) {
    scope.launch { run(promise) { firestore.getFieldsJson(projectId, documentPath) } }
  }

  @ReactMethod
  fun saveDocument(projectId: String, documentPath: String, fieldsJson: String, promise: Promise) {
    scope.launch {
      run(promise) {
        firestore.saveFieldsJson(projectId, documentPath, fieldsJson)
        null
      }
    }
  }

  @ReactMethod
  fun createDocument(
      projectId: String,
      collectionPath: String,
      documentId: String,
      fieldsJson: String,
      promise: Promise,
  ) {
    scope.launch {
      run(promise) {
        firestore.createFieldsJson(projectId, collectionPath, documentId, fieldsJson)
        null
      }
    }
  }

  @ReactMethod
  fun deleteDocument(projectId: String, documentPath: String, promise: Promise) {
    scope.launch {
      run(promise) {
        firestore.deleteDocument(projectId, documentPath)
        null
      }
    }
  }

  private fun run(promise: Promise, block: () -> Any?) {
    try {
      when (val value = block()) {
        null -> promise.resolve(null)
        is String -> promise.resolve(value)
        is List<*> -> {
          val arr = Arguments.createArray()
          value.forEach { item ->
            when (item) {
              is String -> arr.pushString(item)
              else -> arr.pushString(item.toString())
            }
          }
          promise.resolve(arr)
        }
        else -> promise.resolve(value.toString())
      }
    } catch (e: Exception) {
      reject(promise, e)
    }
  }

  private fun reject(promise: Promise, e: Exception) {
    when (e) {
      is NeedTokenException -> promise.reject("NEED_TOKEN", "Cloud の権限がありません")
      is IllegalArgumentException -> promise.reject("BAD_PATH", e.message, e)
      is FirestoreHttpException -> promise.reject("FIRESTORE", e.message ?: "HTTP ${e.status}", e)
      else -> promise.reject("EXPLORER_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  companion object {
    const val NAME = "Explorer"
  }
}
