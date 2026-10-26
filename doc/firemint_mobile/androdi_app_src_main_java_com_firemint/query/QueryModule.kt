package com.firemint.query

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

class QueryModule(reactContext: ReactApplicationContext) :
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
  fun runQuery(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      field: String,
      operator: String,
      value: String,
      operator2: String,
      value2: String,
      valueType: String,
      fetchAll: Boolean,
      promise: Promise,
  ) {
    scope.launch {
      try {
        val result =
            firestore.queryDocuments(
                projectId,
                collectionPath,
                collectionGroup,
                field,
                operator,
                value,
                operator2,
                value2,
                valueType,
                500,
                fetchAll,
            )
        val arr = Arguments.createArray()
        result.docs.forEach { doc ->
          val map = Arguments.createMap()
          map.putString("id", doc.id)
          map.putString("path", doc.path)
          map.putString("fieldsJson", doc.fieldsJson)
          arr.pushMap(map)
        }
        val out = Arguments.createMap()
        out.putArray("documents", arr)
        out.putDouble("totalCount", result.totalCount.toDouble())
        out.putBoolean("partial", result.partial)
        out.putDouble("sourceCount", result.sourceCount.toDouble())
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
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
      promise: Promise,
  ) {
    scope.launch {
      try {
        val count =
            firestore.countQuery(
                projectId,
                collectionPath,
                collectionGroup,
                field,
                operator,
                value,
                operator2,
                value2,
                valueType,
            )
        promise.resolve(count.toDouble())
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  // コレクションと、その下のサブコレクション（どの深さも）にあるドキュメントの合計
  @ReactMethod
  fun countWithDescendants(projectId: String, collectionPath: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(firestore.countWithDescendants(projectId, collectionPath).toDouble())
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  // ---- query モードの JS ----

  @ReactMethod
  fun jsQuery(
      projectId: String,
      collectionPath: String,
      collectionGroup: Boolean,
      specJson: String,
      transaction: String,
      promise: Promise,
  ) {
    scope.launch {
      try {
        val result = firestore.jsQuery(projectId, collectionPath, collectionGroup, specJson, transaction)
        val arr = Arguments.createArray()
        result.docs.forEach { arr.pushMap(docMap(it)) }
        val out = Arguments.createMap()
        out.putArray("documents", arr)
        out.putBoolean("partial", result.partial)
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  // 無い時は null
  @ReactMethod
  fun jsGet(projectId: String, documentPath: String, transaction: String, promise: Promise) {
    scope.launch {
      try {
        val doc = firestore.jsGet(projectId, documentPath, transaction)
        promise.resolve(doc?.let { docMap(it) })
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun jsCommit(projectId: String, writesJson: String, transaction: String, promise: Promise) {
    scope.launch {
      try {
        firestore.jsCommit(projectId, writesJson, transaction)
        promise.resolve(null)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun jsBeginTransaction(projectId: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(firestore.jsBeginTransaction(projectId))
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun jsRollback(projectId: String, transaction: String, promise: Promise) {
    scope.launch {
      try {
        firestore.jsRollback(projectId, transaction)
        promise.resolve(null)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  private fun docMap(doc: FirestoreClient.QueryDoc) =
      Arguments.createMap().apply {
        putString("id", doc.id)
        putString("path", doc.path)
        putString("fieldsJson", doc.fieldsJson)
      }

  private fun reject(promise: Promise, e: Exception) {
    when (e) {
      is NeedTokenException -> promise.reject("NEED_TOKEN", "Cloud の権限がありません")
      is IllegalArgumentException -> promise.reject("BAD_PATH", e.message, e)
      // トランザクションの競合（ABORTED）。JS 側でやり直す
      is FirestoreHttpException ->
          promise.reject(if (e.reason == "ABORTED") "ABORTED" else "FIRESTORE", e.message ?: "HTTP ${e.status}", e)
      else -> promise.reject("QUERY_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  companion object {
    const val NAME = "Query"
  }
}
