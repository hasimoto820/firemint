package com.firemint.auth_users

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.firemint.connection.GoogleSessionStore
import com.firemint.shared.DocPathResolver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class AuthUsersModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val store = GoogleSessionStore(reactContext.applicationContext)
  private val client =
      IdentityToolkitClient({ store.authUsersAccessToken() }, { store.clearAuthUsersAccessToken() })
  private val serviceUsage =
      ServiceUsageClient(
          { store.serviceManagementAccessToken() }, { store.clearServiceManagementAccessToken() })
  private var pickExportDestPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    reactContext.removeActivityEventListener(this)
    scope.cancel()
  }

  @ReactMethod
  fun listUsers(projectId: String, pageToken: String, promise: Promise) {
    scope.launch {
      try {
        val page = client.listAccounts(projectId, pageToken.ifBlank { null }, 100)
        val arr = Arguments.createArray()
        page.users.forEach { arr.pushMap(toMap(it)) }
        val out = Arguments.createMap()
        out.putArray("users", arr)
        out.putString("nextPageToken", page.nextPageToken ?: "")
        promise.resolve(out)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun getUser(projectId: String, uid: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(toMap(client.getAccount(projectId, uid)))
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun updateUser(
      projectId: String,
      uid: String,
      email: String,
      displayName: String,
      phoneNumber: String,
      password: String,
      emailVerified: Boolean,
      customAttributesJson: String,
      promise: Promise,
  ) {
    scope.launch {
      try {
        val updated =
            client.updateAccount(
                projectId,
                uid,
                email,
                displayName,
                phoneNumber,
                password,
                emailVerified,
                customAttributesJson,
            )
        promise.resolve(toMap(updated))
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun setDisabled(projectId: String, uid: String, disabled: Boolean, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(toMap(client.setDisabled(projectId, uid, disabled)))
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun deleteUser(projectId: String, uid: String, promise: Promise) {
    scope.launch {
      try {
        client.deleteAccount(projectId, uid)
        promise.resolve(null)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun enableIdentityToolkit(projectId: String, promise: Promise) {
    scope.launch {
      try {
        serviceUsage.enableService(projectId, "identitytoolkit.googleapis.com")
        promise.resolve(null)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  @ReactMethod
  fun pickExportLocation(suggestedName: String, promise: Promise) {
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
          type = "application/octet-stream"
          putExtra(Intent.EXTRA_TITLE, suggestedName)
        }
    pickExportDestPromise = promise
    try {
      activity.startActivityForResult(intent, REQ_PICK_EXPORT_DEST)
    } catch (e: Exception) {
      pickExportDestPromise = null
      promise.reject("PICK_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun writeExport(destUri: String, content: String, promise: Promise) {
    scope.launch {
      try {
        val resolver = reactContext.contentResolver
        resolver.openOutputStream(Uri.parse(destUri))?.use { output ->
          output.write(content.toByteArray(Charsets.UTF_8))
        } ?: throw IllegalStateException("保存先を開けませんでした")
        promise.resolve(null)
      } catch (e: Exception) {
        reject(promise, e)
      }
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_PICK_EXPORT_DEST) {
      return
    }
    val promise = pickExportDestPromise ?: return
    pickExportDestPromise = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.reject("CANCELLED", "cancelled")
      return
    }
    val name =
        DocPathResolver.queryDisplayName(reactContext.contentResolver, uri) ?: uri.lastPathSegment
            ?: "auth-users"
    val out = Arguments.createMap()
    out.putString("uri", uri.toString())
    out.putString("name", name)
    out.putString("path", DocPathResolver.readableDocPath(reactContext, uri) ?: name)
    promise.resolve(out)
  }

  override fun onNewIntent(intent: Intent) {}

  private fun toMap(user: IdentityToolkitClient.AuthUser): WritableMap {
    val map = Arguments.createMap()
    map.putString("uid", user.uid)
    map.putString("email", user.email)
    map.putString("displayName", user.displayName)
    map.putString("phoneNumber", user.phoneNumber)
    map.putBoolean("disabled", user.disabled)
    map.putBoolean("emailVerified", user.emailVerified)
    map.putString("customAttributes", user.customAttributes ?: "{}")
    map.putString("createdAt", user.createdAt)
    map.putString("lastLoginAt", user.lastLoginAt)
    val providers = Arguments.createArray()
    user.providerIds.forEach { providers.pushString(it) }
    map.putArray("providerIds", providers)
    return map
  }

  private fun reject(promise: Promise, e: Exception) {
    when (e) {
      is NeedAuthUsersTokenException -> promise.reject("NEED_TOKEN", "Auth ユーザーの権限がありません")
      is AuthApiDisabledException ->
          promise.reject(
              "API_DISABLED",
              "このプロジェクトではIdentity Toolkit API(Auth管理用のAPI)がまだ有効になっていません。" +
                  "Firebase Authentication自体は使っていても、OAuth経由の直接アクセスは別途有効化が必要です。\n\n" +
                  "${e.message}",
          )
      is IllegalArgumentException -> promise.reject("NOT_FOUND", e.message, e)
      is IllegalStateException -> promise.reject("AUTH_USERS_FAILED", e.message, e)
      is IdentityToolkitException -> promise.reject("IDENTITYTOOLKIT", e.message ?: "HTTP ${e.status}", e)
      else -> promise.reject("AUTH_USERS_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  companion object {
    const val NAME = "AuthUsers"
    private const val REQ_PICK_EXPORT_DEST = 4301
  }
}
