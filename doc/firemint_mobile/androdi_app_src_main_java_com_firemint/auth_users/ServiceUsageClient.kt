package com.firemint.auth_users

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

// onUnauthorized: サーバーが権限エラー（401）を返した時に呼ぶ（保存したトークンを捨てる）
class ServiceUsageClient(
    private val tokenProvider: () -> String?,
    private val onUnauthorized: () -> Unit = {},
) {

  /** identitytoolkit.googleapis.com など、プロジェクトに紐づく Google API を有効化する。 */
  fun enableService(projectId: String, serviceName: String) {
    val url =
        "https://serviceusage.googleapis.com/v1/projects/$projectId/services/$serviceName:enable"
    requestText("POST", url, "{}")
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
        val msg =
            try {
              JSONObject(text).optJSONObject("error")?.optString("message") ?: text
            } catch (_: Exception) {
              text.ifBlank { "HTTP $code" }
            }
        throw IdentityToolkitException(code, msg)
      }
      return text
    } finally {
      conn.disconnect()
    }
  }
}
