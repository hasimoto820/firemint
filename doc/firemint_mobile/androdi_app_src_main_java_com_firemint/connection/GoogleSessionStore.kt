package com.firemint.connection

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

class GoogleSessionStore(context: Context) {
  private val prefs: SharedPreferences =
      EncryptedSharedPreferences.create(
          PREF_FILE,
          MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
          context,
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
      )

  fun save(email: String, displayName: String) {
    prefs
        .edit()
        .putString(KEY_EMAIL, email)
        .putString(KEY_DISPLAY_NAME, displayName)
        .apply()
  }

  fun saveAccessToken(token: String, expiresAtMs: Long) {
    prefs
        .edit()
        .putString(KEY_ACCESS_TOKEN, token)
        .putLong(KEY_ACCESS_EXPIRES, expiresAtMs)
        .putString(KEY_ACCESS_SCOPE, SCOPE_DATASTORE)
        .apply()
  }

  fun saveAuthUsersAccessToken(token: String, expiresAtMs: Long) {
    prefs
        .edit()
        .putString(KEY_AUTH_ACCESS_TOKEN, token)
        .putLong(KEY_AUTH_ACCESS_EXPIRES, expiresAtMs)
        .putString(KEY_AUTH_ACCESS_SCOPE, SCOPE_IDENTITYTOOLKIT)
        .apply()
  }

  fun saveServiceManagementAccessToken(token: String, expiresAtMs: Long) {
    prefs
        .edit()
        .putString(KEY_SVCMGMT_ACCESS_TOKEN, token)
        .putLong(KEY_SVCMGMT_ACCESS_EXPIRES, expiresAtMs)
        .putString(KEY_SVCMGMT_ACCESS_SCOPE, SCOPE_SERVICE_MANAGEMENT)
        .apply()
  }

  // サーバーが権限エラー（401）を返した時に、保存したトークンを捨てる。
  // 保存した期限より先に、Google 側で期限が切れていることがあるため（使い回しのトークン）。
  // 捨てておけば、次の ensure… が新しいトークンを取りに行く
  fun clearAccessToken() {
    prefs.edit().remove(KEY_ACCESS_TOKEN).remove(KEY_ACCESS_EXPIRES).apply()
  }

  fun clearAuthUsersAccessToken() {
    prefs.edit().remove(KEY_AUTH_ACCESS_TOKEN).remove(KEY_AUTH_ACCESS_EXPIRES).apply()
  }

  fun clearServiceManagementAccessToken() {
    prefs.edit().remove(KEY_SVCMGMT_ACCESS_TOKEN).remove(KEY_SVCMGMT_ACCESS_EXPIRES).apply()
  }

  fun email(): String? = prefs.getString(KEY_EMAIL, null)?.takeIf { it.isNotBlank() }

  fun displayName(): String = prefs.getString(KEY_DISPLAY_NAME, "") ?: ""

  fun accessToken(): String? {
    val token = prefs.getString(KEY_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
    if (prefs.getString(KEY_ACCESS_SCOPE, "") != SCOPE_DATASTORE) {
      return null
    }
    val expires = prefs.getLong(KEY_ACCESS_EXPIRES, 0L)
    if (expires != 0L && expires <= System.currentTimeMillis()) {
      return null
    }
    return token
  }

  fun authUsersAccessToken(): String? {
    val token =
        prefs.getString(KEY_AUTH_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
    if (prefs.getString(KEY_AUTH_ACCESS_SCOPE, "") != SCOPE_IDENTITYTOOLKIT) {
      return null
    }
    val expires = prefs.getLong(KEY_AUTH_ACCESS_EXPIRES, 0L)
    if (expires != 0L && expires <= System.currentTimeMillis()) {
      return null
    }
    return token
  }

  fun serviceManagementAccessToken(): String? {
    val token =
        prefs.getString(KEY_SVCMGMT_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
    if (prefs.getString(KEY_SVCMGMT_ACCESS_SCOPE, "") != SCOPE_SERVICE_MANAGEMENT) {
      return null
    }
    val expires = prefs.getLong(KEY_SVCMGMT_ACCESS_EXPIRES, 0L)
    if (expires != 0L && expires <= System.currentTimeMillis()) {
      return null
    }
    return token
  }

  fun clear() {
    prefs.edit().clear().apply()
  }

  companion object {
    private const val PREF_FILE = "firemint_google_session"
    private const val KEY_EMAIL = "email"
    private const val KEY_DISPLAY_NAME = "display_name"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_ACCESS_EXPIRES = "access_expires"
    private const val KEY_ACCESS_SCOPE = "access_scope"
    private const val SCOPE_DATASTORE = "datastore"
    private const val KEY_AUTH_ACCESS_TOKEN = "auth_access_token"
    private const val KEY_AUTH_ACCESS_EXPIRES = "auth_access_expires"
    private const val KEY_AUTH_ACCESS_SCOPE = "auth_access_scope"
    private const val SCOPE_IDENTITYTOOLKIT = "identitytoolkit"
    private const val KEY_SVCMGMT_ACCESS_TOKEN = "svcmgmt_access_token"
    private const val KEY_SVCMGMT_ACCESS_EXPIRES = "svcmgmt_access_expires"
    private const val KEY_SVCMGMT_ACCESS_SCOPE = "svcmgmt_access_scope"
    private const val SCOPE_SERVICE_MANAGEMENT = "service.management"
  }
}
