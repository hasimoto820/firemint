package com.firemint.workspace

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.firemint.connection.GoogleSessionStore

class WorkspaceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val db = WorkspaceDb(reactContext)
  // いまの firestoreアカウント。名簿は、このアカウントの分だけを扱う
  private val store = GoogleSessionStore(reactContext.applicationContext)

  override fun getName(): String = NAME

  @ReactMethod
  fun list(promise: Promise) {
    try {
      val arr = Arguments.createArray()
      // 未サインインの時は、どのアカウントの名簿でもないので、空で返す
      val account = store.email()
      if (account != null) {
        db.list(account).forEach { arr.pushMap(toMap(it)) }
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("LIST_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun add(projectId: String, label: String, readOnly: Boolean, promise: Promise) {
    val account = account(promise) ?: return
    try {
      promise.resolve(toMap(db.add(account, projectId, label, readOnly)))
    } catch (e: IllegalArgumentException) {
      promise.reject("BAD_PROJECT", e.message, e)
    } catch (e: IllegalStateException) {
      promise.reject("DUP_PROJECT", e.message, e)
    } catch (e: Exception) {
      promise.reject("ADD_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun update(
      projectId: String,
      nextProjectId: String,
      label: String,
      readOnly: Boolean,
      promise: Promise,
  ) {
    val account = account(promise) ?: return
    try {
      promise.resolve(toMap(db.update(account, projectId, nextProjectId, label, readOnly)))
    } catch (e: IllegalArgumentException) {
      promise.reject("BAD_PROJECT", e.message, e)
    } catch (e: IllegalStateException) {
      promise.reject("NOT_FOUND", e.message, e)
    } catch (e: Exception) {
      promise.reject("UPDATE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun remove(projectId: String, promise: Promise) {
    val account = account(promise) ?: return
    try {
      db.remove(account, projectId)
      promise.resolve(null)
    } catch (e: IllegalArgumentException) {
      promise.reject("BAD_PROJECT", e.message, e)
    } catch (e: IllegalStateException) {
      promise.reject("NOT_FOUND", e.message, e)
    } catch (e: Exception) {
      promise.reject("REMOVE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  private fun account(promise: Promise): String? {
    val account = store.email()
    if (account == null) {
      promise.reject("NO_SESSION", "先に Google 認証してください")
    }
    return account
  }

  private fun toMap(p: WorkspaceDb.Project): WritableMap {
    val map = Arguments.createMap()
    map.putString("projectId", p.projectId)
    map.putString("label", p.label)
    map.putBoolean("readOnly", p.readOnly)
    return map
  }

  companion object {
    const val NAME = "Workspace"
  }
}
