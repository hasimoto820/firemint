package com.firemint.connection

import android.accounts.Account
import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.firemint.app.BuildConfig
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.SecureRandom
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class GoogleAuthModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val store = GoogleSessionStore(reactContext.applicationContext)
  private val pendingScopePromises = HashMap<Int, Promise>()

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
  fun getSession(promise: Promise) {
    val email = store.email()
    if (email == null) {
      promise.resolve(null)
      return
    }
    promise.resolve(sessionMap(email, store.displayName()))
  }

  @ReactMethod
  fun signIn(promise: Promise) {
    val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
    if (webClientId.isEmpty() || webClientId.startsWith("ここに")) {
      promise.reject("NO_CLIENT_ID", "config/google_oauth.json に web_client_id を入れてください")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    val existing = store.email()
    if (existing != null) {
      promise.resolve(sessionMap(existing, store.displayName()))
      return
    }
    scope.launch {
      try {
        val credential = requestCredential(activity, webClientId)
        if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          promise.reject("BAD_CREDENTIAL", credential.type)
          return@launch
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        val email = google.id
        if (email.isBlank()) {
          promise.reject("NO_EMAIL", "メールが取れませんでした")
          return@launch
        }
        val displayName = google.displayName ?: ""
        store.save(email, displayName)
        promise.resolve(sessionMap(email, displayName))
      } catch (e: GetCredentialCancellationException) {
        promise.reject("CANCELLED", "cancelled", e)
      } catch (e: Exception) {
        promise.reject("SIGN_IN_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  // アカウント切り替え。Googleの画面でアカウントを選び直す。
  // 選び終えるまで、今のセッションは変えない（キャンセルしたら、今のアカウントのまま）。
  // 選んだら、前のアカウントのトークンを捨てて、入れ替える。名簿（WorkspaceDb）は消さない。
  @ReactMethod
  fun switchAccount(promise: Promise) {
    val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
    if (webClientId.isEmpty() || webClientId.startsWith("ここに")) {
      promise.reject("NO_CLIENT_ID", "config/google_oauth.json に web_client_id を入れてください")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    scope.launch {
      try {
        val credential = requestCredential(activity, webClientId)
        if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          promise.reject("BAD_CREDENTIAL", credential.type)
          return@launch
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        val email = google.id
        if (email.isBlank()) {
          promise.reject("NO_EMAIL", "メールが取れませんでした")
          return@launch
        }
        val displayName = google.displayName ?: ""
        store.clear()
        store.save(email, displayName)
        promise.resolve(sessionMap(email, displayName))
      } catch (e: GetCredentialCancellationException) {
        promise.reject("CANCELLED", "cancelled", e)
      } catch (e: Exception) {
        promise.reject("SIGN_IN_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  @ReactMethod
  fun signOut(promise: Promise) {
    val activity = reactContext.currentActivity
    scope.launch {
      try {
        if (activity != null) {
          CredentialManager.create(activity)
              .clearCredentialState(ClearCredentialStateRequest())
        }
      } catch (_: Exception) {
      }
      store.clear()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun ensureCloudAccess(promise: Promise) {
    ensureScopeAccess(
        promise,
        "https://www.googleapis.com/auth/datastore",
        REQ_CLOUD,
        store::accessToken,
        store::saveAccessToken,
    )
  }

  @ReactMethod
  fun ensureAuthUsersAccess(promise: Promise) {
    ensureScopeAccess(
        promise,
        "https://www.googleapis.com/auth/identitytoolkit",
        REQ_AUTH_USERS,
        store::authUsersAccessToken,
        store::saveAuthUsersAccessToken,
    )
  }

  @ReactMethod
  fun ensureServiceManagementAccess(promise: Promise) {
    ensureScopeAccess(
        promise,
        "https://www.googleapis.com/auth/service.management",
        REQ_SVC_MGMT,
        store::serviceManagementAccessToken,
        store::saveServiceManagementAccessToken,
    )
  }

  private fun ensureScopeAccess(
      promise: Promise,
      scopeUrl: String,
      requestCode: Int,
      existingToken: () -> String?,
      saveToken: (String, Long) -> Unit,
  ) {
    if (existingToken() != null) {
      promise.resolve(null)
      return
    }
    val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
    if (webClientId.isEmpty() || webClientId.startsWith("ここに")) {
      promise.reject("NO_CLIENT_ID", "config/google_oauth.json に web_client_id を入れてください")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    val email = store.email()
    if (email == null) {
      promise.reject("NO_SESSION", "先に Google 認証してください")
      return
    }
    scope.launch {
      try {
        // サインイン中のアカウントを指定して、トークンを取る。指定しないと、端末に複数の
        // Googleアカウントがある時に、画面に出しているアカウントとは別のアカウントの
        // トークンが返り得る（アカウント切り替えの後は、前のアカウントのまま操作してしまう）。
        val request =
            AuthorizationRequest.builder()
                .setRequestedScopes(listOf(Scope(scopeUrl)))
                .setAccount(Account(email, GOOGLE_ACCOUNT_TYPE))
                .build()
        val result = Identity.getAuthorizationClient(activity).authorize(request).await()
        val token = result.accessToken
        if (!token.isNullOrBlank()) {
          saveToken(token, System.currentTimeMillis() + TOKEN_TTL_MS)
          promise.resolve(null)
          return@launch
        }
        if (result.hasResolution()) {
          val pending = result.pendingIntent
          if (pending == null) {
            promise.reject("NO_RESOLUTION", "同意画面を出せません")
            return@launch
          }
          pendingScopePromises[requestCode] = promise
          activity.startIntentSenderForResult(pending.intentSender, requestCode, null, 0, 0, 0)
          return@launch
        }
        promise.reject("NO_TOKEN", "トークンが取れませんでした")
      } catch (e: Exception) {
        promise.reject("CLOUD_AUTH_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQ_CLOUD -> onScopeResult(activity, requestCode, resultCode, data, store::saveAccessToken)
      REQ_AUTH_USERS ->
          onScopeResult(activity, requestCode, resultCode, data, store::saveAuthUsersAccessToken)
      REQ_SVC_MGMT ->
          onScopeResult(
              activity, requestCode, resultCode, data, store::saveServiceManagementAccessToken)
    }
  }

  private fun onScopeResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
      saveToken: (String, Long) -> Unit,
  ) {
    val promise = pendingScopePromises.remove(requestCode) ?: return
    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.reject("CANCELLED", "cancelled")
      return
    }
    try {
      val result = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
      val token = result.accessToken
      if (token.isNullOrBlank()) {
        promise.reject("NO_TOKEN", "トークンが取れませんでした")
        return
      }
      saveToken(token, System.currentTimeMillis() + TOKEN_TTL_MS)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CLOUD_AUTH_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  override fun onNewIntent(intent: Intent) {}

  private suspend fun requestCredential(activity: Activity, webClientId: String) =
      try {
        val googleId =
            GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(webClientId)
                .setAutoSelectEnabled(false)
                .setNonce(nonce())
                .build()
        getCredential(
            activity,
            GetCredentialRequest.Builder().addCredentialOption(googleId).build(),
        )
      } catch (_: NoCredentialException) {
        val button =
            GetSignInWithGoogleOption.Builder(webClientId).setNonce(nonce()).build()
        getCredential(
            activity,
            GetCredentialRequest.Builder().addCredentialOption(button).build(),
        )
      }

  private suspend fun getCredential(activity: Activity, request: GetCredentialRequest) =
      CredentialManager.create(activity).getCredential(activity, request).credential

  private fun sessionMap(email: String, displayName: String): WritableMap {
    val map = Arguments.createMap()
    map.putString("email", email)
    map.putString("displayName", displayName)
    return map
  }

  private fun nonce(): String {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    return Base64.encodeToString(
        bytes,
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )
  }

  companion object {
    const val NAME = "GoogleAuth"
    private const val REQ_CLOUD = 4281
    private const val REQ_AUTH_USERS = 4282
    private const val REQ_SVC_MGMT = 4283
    private const val TOKEN_TTL_MS = 50L * 60L * 1000L
    private const val GOOGLE_ACCOUNT_TYPE = "com.google"
  }
}
