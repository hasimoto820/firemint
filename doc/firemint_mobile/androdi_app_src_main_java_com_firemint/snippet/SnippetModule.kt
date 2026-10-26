package com.firemint.snippet

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class SnippetModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val db = SnippetDb(reactContext)

  override fun getName(): String = NAME

  @ReactMethod
  fun list(promise: Promise) {
    try {
      val groups = Arguments.createArray()
      db.listGroups().forEach { groups.pushMap(groupMap(it)) }
      val snippets = Arguments.createArray()
      db.listSnippets().forEach { snippets.pushMap(snippetMap(it)) }
      val out = Arguments.createMap()
      out.putArray("groups", groups)
      out.putArray("snippets", snippets)
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("LIST_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun addGroup(name: String, promise: Promise) {
    try {
      promise.resolve(groupMap(db.addGroup(name)))
    } catch (e: Exception) {
      promise.reject("ADD_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun updateGroup(id: Double, name: String, promise: Promise) {
    try {
      promise.resolve(groupMap(db.updateGroup(id.toLong(), name)))
    } catch (e: Exception) {
      promise.reject("UPDATE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun removeGroup(id: Double, promise: Promise) {
    try {
      db.removeGroup(id.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("REMOVE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun addSnippet(groupId: Double, name: String, body: String, promise: Promise) {
    try {
      val gid = if (groupId <= 0) null else groupId.toLong()
      promise.resolve(snippetMap(db.addSnippet(gid, name, body)))
    } catch (e: Exception) {
      promise.reject("ADD_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun updateSnippet(id: Double, groupId: Double, name: String, body: String, promise: Promise) {
    try {
      val gid = if (groupId <= 0) null else groupId.toLong()
      promise.resolve(snippetMap(db.updateSnippet(id.toLong(), gid, name, body)))
    } catch (e: Exception) {
      promise.reject("UPDATE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun removeSnippet(id: Double, promise: Promise) {
    try {
      db.removeSnippet(id.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("REMOVE_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun copyBody(id: Double, promise: Promise) {
    try {
      val snippet = db.getSnippet(id.toLong())
      val clipboard =
          reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("snippet", snippet.body))
      val map = Arguments.createMap()
      map.putString("body", snippet.body)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("COPY_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  private fun groupMap(g: SnippetDb.Group): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("id", g.id.toDouble())
    map.putString("name", g.name)
    return map
  }

  private fun snippetMap(s: SnippetDb.Snippet): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("id", s.id.toDouble())
    if (s.groupId == null) {
      map.putNull("groupId")
    } else {
      map.putDouble("groupId", s.groupId.toDouble())
    }
    map.putString("name", s.name)
    map.putString("body", s.body)
    return map
  }

  companion object {
    const val NAME = "Snippet"
  }
}
