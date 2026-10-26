package com.firemint.auth_users

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

class NeedAuthUsersTokenException : Exception("NEED_TOKEN")

class AuthApiDisabledException(rawMessage: String) : Exception(rawMessage)

class IdentityToolkitException(val status: Int, detail: String) : Exception(detail)

// onUnauthorized: サーバーが権限エラー（401）を返した時に呼ぶ（保存したトークンを捨てる）
class IdentityToolkitClient(
    private val tokenProvider: () -> String?,
    private val onUnauthorized: () -> Unit = {},
) {

  data class AuthUser(
      val uid: String,
      val email: String?,
      val displayName: String?,
      val phoneNumber: String?,
      val disabled: Boolean,
      val emailVerified: Boolean,
      val customAttributes: String?,
      val createdAt: String?,
      val lastLoginAt: String?,
      val providerIds: List<String>,
  )

  data class ListPage(val users: List<AuthUser>, val nextPageToken: String?)

  fun listAccounts(projectId: String, pageToken: String?, maxResults: Int): ListPage {
    val qs = ArrayList<String>()
    qs.add("maxResults=$maxResults")
    if (!pageToken.isNullOrBlank()) {
      qs.add("nextPageToken=${android.net.Uri.encode(pageToken)}")
    }
    val url = "${accountsUrl(projectId, "batchGet")}?${qs.joinToString("&")}"
    val json = request("GET", url, null)
    val usersJson = json.optJSONArray("users") ?: JSONArray()
    val users = (0 until usersJson.length()).map { toUser(usersJson.getJSONObject(it)) }
    val next = json.optString("nextPageToken")
    return ListPage(users, next.ifBlank { null })
  }

  fun getAccount(projectId: String, uid: String): AuthUser {
    val body = JSONObject().put("localId", JSONArray().put(uid))
    val json = request("POST", accountsUrl(projectId, "lookup"), body.toString())
    val usersJson = json.optJSONArray("users") ?: JSONArray()
    if (usersJson.length() == 0) {
      throw IllegalArgumentException("ユーザーが見つかりません")
    }
    return toUser(usersJson.getJSONObject(0))
  }

  fun updateAccount(
      projectId: String,
      uid: String,
      email: String,
      displayName: String,
      phoneNumber: String,
      password: String,
      emailVerified: Boolean,
      customAttributesJson: String,
  ): AuthUser {
    val body =
        JSONObject()
            .put("localId", uid)
            .put("emailVerified", emailVerified)
            .put("customAttributes", customAttributesJson)
    // 空にした項目は、空の値を送っても消えない（API は「変更なし」と扱う）。
    // 消すには、専用の指定（deleteAttribute / deleteProvider）を送る。
    // もともと空の項目に送っても、害は無い。
    // email は、消す手段が無い。空なら送らない（画面が、空にする保存を先に止める）。
    if (email.isNotBlank()) {
      body.put("email", email)
    }
    if (displayName.isNotBlank()) {
      body.put("displayName", displayName)
    } else {
      body.put("deleteAttribute", JSONArray().put("DISPLAY_NAME"))
    }
    if (phoneNumber.isNotBlank()) {
      body.put("phoneNumber", phoneNumber)
    } else {
      body.put("deleteProvider", JSONArray().put("phone"))
    }
    if (password.isNotBlank()) {
      body.put("password", password)
    }
    request("POST", accountsUrl(projectId, "update"), body.toString())
    return getAccount(projectId, uid)
  }

  fun setDisabled(projectId: String, uid: String, disabled: Boolean): AuthUser {
    val body = JSONObject().put("localId", uid).put("disableUser", disabled)
    request("POST", accountsUrl(projectId, "update"), body.toString())
    return getAccount(projectId, uid)
  }

  fun deleteAccount(projectId: String, uid: String) {
    val body = JSONObject().put("localId", uid)
    request("POST", accountsUrl(projectId, "delete"), body.toString())
  }

  private fun toUser(obj: JSONObject): AuthUser {
    val providers = ArrayList<String>()
    val providerInfo = obj.optJSONArray("providerUserInfo")
    if (providerInfo != null) {
      for (i in 0 until providerInfo.length()) {
        val id = providerInfo.getJSONObject(i).optString("providerId")
        if (id.isNotBlank()) {
          providers.add(id)
        }
      }
    }
    return AuthUser(
        uid = obj.optString("localId"),
        email = obj.optString("email").ifBlank { null },
        displayName = obj.optString("displayName").ifBlank { null },
        phoneNumber = obj.optString("phoneNumber").ifBlank { null },
        disabled = obj.optBoolean("disabled", false),
        emailVerified = obj.optBoolean("emailVerified", false),
        customAttributes = obj.optString("customAttributes").ifBlank { null },
        createdAt = toIsoUtc(obj.optString("createdAt")),
        lastLoginAt = toIsoUtc(obj.optString("lastLoginAt")),
        providerIds = providers,
    )
  }

  // API は、日時をミリ秒の数字の文字列で返す（例 "1757473965000"）。
  // ISO 8601 の UTC（例 "2026-09-10T03:12:45Z"）に直す。書き出しには、この形のまま出す。
  // 数字として読めない値は、捨てずにそのまま通す。
  private fun toIsoUtc(raw: String): String? {
    if (raw.isBlank()) {
      return null
    }
    val millis = raw.toLongOrNull() ?: return raw
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt.format(Date(millis))
  }

  private fun accountsUrl(projectId: String, method: String) =
      "https://identitytoolkit.googleapis.com/v1/projects/$projectId/accounts:$method"

  private fun request(method: String, url: String, body: String?): JSONObject {
    val text = requestText(method, url, body)
    return if (text.isBlank()) JSONObject() else JSONObject(text)
  }

  private fun requestText(method: String, url: String, body: String?): String {
    val token = tokenProvider() ?: throw NeedAuthUsersTokenException()
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
        throw NeedAuthUsersTokenException()
      }
      if (code !in 200..299) {
        val errorObj =
            try {
              JSONObject(text).optJSONObject("error")
            } catch (_: Exception) {
              null
            }
        val msg = errorObj?.optString("message")?.ifBlank { null } ?: text.ifBlank { "HTTP $code" }
        if (isServiceDisabled(errorObj)) {
          throw AuthApiDisabledException(msg)
        }
        throw IdentityToolkitException(code, msg)
      }
      return text
    } finally {
      conn.disconnect()
    }
  }

  private fun isServiceDisabled(errorObj: JSONObject?): Boolean {
    val details = errorObj?.optJSONArray("details") ?: return false
    for (i in 0 until details.length()) {
      val reason = details.optJSONObject(i)?.optString("reason")
      if (reason == "SERVICE_DISABLED") {
        return true
      }
    }
    return false
  }
}
