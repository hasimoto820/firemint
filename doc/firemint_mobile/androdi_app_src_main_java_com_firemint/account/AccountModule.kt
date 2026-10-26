package com.firemint.account

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.provider.Settings
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.firemint.app.BuildConfig
import com.firemint.settings.SettingsDb
import com.firemint.snippet.SnippetDb
import com.firemint.workspace.WorkspaceDb
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.firestore.Query
import java.security.SecureRandom
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * 003_account/003_002_flow.txt の「初回起動」「匿名ユーザー→Google認証」に対応する
 * Firebase Auth 呼び出しと、ローカルSQLiteキャッシュ(users/{uid}相当)。
 * Cloud Functions(createAccount / registerDevice 等)の呼び出しはここでは扱わない。
 */
class AccountModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val db = AccountDb(reactContext.applicationContext)
  private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
  private val firestore: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }
  private val functions: FirebaseFunctions by lazy {
    FirebaseFunctions.getInstance("asia-northeast1")
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    scope.cancel()
  }

  /** ローカルSQLiteキャッシュの読み取り。ネットワーク不要。 */
  @ReactMethod
  fun getCachedUser(promise: Promise) {
    val cached = db.get()
    if (cached == null) {
      promise.resolve(null)
      return
    }
    promise.resolve(cachedUserMap(cached))
  }

  /** 端末を登録した直後に、uid・この端末の firstUseDate・accountId を、ローカルへ写す。 */
  @ReactMethod
  fun cacheUser(uid: String, firstUseDate: Double, accountId: String?, promise: Promise) {
    db.put(uid, firstUseDate.toLong(), accountId)
    promise.resolve(null)
  }

  /** accounts合流・脱退などで accountId のみ更新する。 */
  @ReactMethod
  fun updateCachedAccountId(accountId: String?, promise: Promise) {
    db.updateAccountId(accountId)
    promise.resolve(null)
  }

  @ReactMethod
  fun clearCachedUser(promise: Promise) {
    db.clear()
    promise.resolve(null)
  }

  /** 現在のFirebase Auth UIDを同期的に返す（無ければnull）。 */
  @ReactMethod
  fun getCurrentUid(promise: Promise) {
    promise.resolve(auth.currentUser?.uid)
  }

  /** 匿名認証。既にサインイン済みならそのuidをそのまま返す（べき等）。 */
  @ReactMethod
  fun signInAnonymously(promise: Promise) {
    val existing = auth.currentUser
    if (existing != null) {
      promise.resolve(authResultMap(existing.uid, isNewUser = false))
      return
    }
    scope.launch {
      try {
        val result = auth.signInAnonymously().await()
        val uid = result.user?.uid
        if (uid == null) {
          promise.reject("NO_UID", "匿名認証に失敗しました")
          return@launch
        }
        promise.resolve(authResultMap(uid, isNewUser = result.additionalUserInfo?.isNewUser ?: true))
      } catch (e: Exception) {
        promise.reject("ANONYMOUS_SIGN_IN_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * Googleアカウントでの認証。現在のユーザーが匿名なら既存uidへ紐付け(link)を試み、
   * 既に他のFirebaseユーザーにそのGoogleアカウントが紐付いている場合は
   * (FirebaseAuthUserCollisionException) そちらのuidへサインインし直す。
   * 003_002_flow.txt「匿名ユーザー→Google認証」の uid 引き継ぎに対応。
   */
  @ReactMethod
  fun linkWithGoogle(promise: Promise) {
    // 「パッケージ名+SHA-1」のAndroid OAuthクライアントは1つのGCPプロジェクトにしか置けないため、
    // connection機能と同じ firemint-m のウェブクライアントIDを使う。
    // Firebase Auth側には、このIDを Google プロバイダの「外部プロジェクトのクライアントID」として許可済み。
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
        val idToken = google.idToken
        val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)

        val currentUser = auth.currentUser
        var switched = false
        val authResult =
            try {
              if (currentUser != null) {
                currentUser.linkWithCredential(firebaseCredential).await()
              } else {
                auth.signInWithCredential(firebaseCredential).await()
              }
            } catch (e: FirebaseAuthUserCollisionException) {
              // 基本ルール3（合流）: 既に別uidにこのGoogleアカウントが紐付いている場合は、
              // 昇格ではなく、そちらのuidへ切り替える。用済みになる一時的な匿名ユーザーは
              // 切り替える前に（まだ自分のセッションのうちに）サーバーで削除してもらう。
              switched = true
              if (currentUser != null && currentUser.isAnonymous) {
                try {
                  functions.getHttpsCallable("discardAnonymous").call().await()
                } catch (_: Exception) {
                  // 掃除に失敗しても、ログイン自体は続ける（残骸が残るだけ）
                }
              }
              auth.signInWithCredential(firebaseCredential).await()
            }

        val user = authResult.user
        if (user == null) {
          promise.reject("NO_UID", "Google認証に失敗しました")
          return@launch
        }
        val map = Arguments.createMap()
        map.putString("uid", user.uid)
        map.putString("email", user.email ?: google.id)
        map.putBoolean("switched", switched)
        promise.resolve(map)
      } catch (e: GetCredentialCancellationException) {
        promise.reject("CANCELLED", "cancelled", e)
      } catch (e: Exception) {
        promise.reject("GOOGLE_LINK_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /** Firebase Authからサインアウトする（削除後に、端末側のセッションも捨てる）。 */
  @ReactMethod
  fun signOut(promise: Promise) {
    auth.signOut()
    promise.resolve(null)
  }

  /**
   * いまのFirebase Authセッションが有効かを確認する。
   * ユーザーがサーバー側で削除されていた場合（owner退会で、他memberのユーザーも消える等）や、
   * Authのセッションが無いのにキャッシュだけ残っている場合は、キャッシュも捨てて false を返す。
   * 通信エラー等で判断できない時は、端末を壊さないよう true を返す。
   */
  @ReactMethod
  fun validateSession(promise: Promise) {
    val user = auth.currentUser
    if (user == null) {
      db.clear()
      promise.resolve(false)
      return
    }
    scope.launch {
      try {
        user.reload().await()
        promise.resolve(true)
      } catch (e: FirebaseAuthInvalidUserException) {
        auth.signOut()
        db.clear()
        promise.resolve(false)
      } catch (e: Exception) {
        promise.resolve(true)
      }
    }
  }

  /**
   * 端末の中の作業データを消す。退会・データ削除で、完了の案内を出す前に呼ぶ
   * （案内でOKを押さずにアプリを閉じても、端末に残らないようにする）。
   * 消すのは、SQLite（名簿・スニペット・設定・ユーザーの写し）と、一時ファイル。
   * firestoreアカウントのセッションは、接続側の signOut が消す。
   * 開いたままのデータベースは、ファイルだけが消える。この後アプリは終了する前提。
   */
  @ReactMethod
  fun clearLocalData(promise: Promise) {
    try {
      listOf(AccountDb.DB_NAME, WorkspaceDb.DB_NAME, SnippetDb.DB_NAME, SettingsDb.DB_NAME)
          .forEach { reactContext.deleteDatabase(it) }
      reactContext.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CLEAR_LOCAL_DATA_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  /**
   * アプリのデータを丸ごと消して、終了する（端末の設定の「データを消去」と同じ）。
   * 退会・データ削除の最後に呼ぶ。SQLite（名簿・スニペット・設定・キャッシュ）、
   * firestoreアカウントのセッション、Firebase Authのセッション、一時ファイルが消える。
   * 成功するとプロセスが終わるので、結果は返らない。消せなかった時だけ false を返す。
   * Android ID はOSが持つ値なので、消えない（次の起動で、同じ devices に登録される）。
   */
  @ReactMethod
  fun clearAllAppData(promise: Promise) {
    val manager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    promise.resolve(manager.clearApplicationUserData())
  }

  /** Android ID（端末識別ID）を取得する。 */
  @ReactMethod
  fun getAndroidId(promise: Promise) {
    val id =
        Settings.Secure.getString(reactContext.contentResolver, Settings.Secure.ANDROID_ID)
    promise.resolve(id)
  }

  /**
   * Google連携後、users/{uid} の email/name を反映する（003_003_misc.txt #2は
   * Cloud Functions経由の合流照会だが、これは自分自身のプロフィール更新のみなのでClient直接）。
   */
  @ReactMethod
  fun updateUserProfile(promise: Promise) {
    val user = auth.currentUser
    if (user == null) {
      promise.reject("NOT_SIGNED_IN", "先に認証してください")
      return
    }
    scope.launch {
      try {
        val ref = firestore.collection("users").document(user.uid)
        ref.update(
                mapOf(
                    "email" to (user.email ?: ""),
                    "name" to (user.displayName ?: ""),
                ))
            .await()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("UPDATE_USER_PROFILE_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * users/{uid} をFirestoreから直接読み取る（自分自身のドキュメントのみ。Client直接）。
   * accountId と email の正は、ここ。
   */
  @ReactMethod
  fun fetchUserDocument(promise: Promise) {
    val user = auth.currentUser
    if (user == null) {
      promise.reject("NOT_SIGNED_IN", "先に認証してください")
      return
    }
    scope.launch {
      try {
        val snap = firestore.collection("users").document(user.uid).get().await()
        if (!snap.exists()) {
          promise.resolve(null)
          return@launch
        }
        val map = Arguments.createMap()
        map.putString("accountId", snap.getString("accountId"))
        map.putString("email", snap.getString("email"))
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("FETCH_USER_DOCUMENT_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * 003_002_flow.txt「利用状態の判定」の課金(subscribed)判定部分。
   * accountIdに紐づく最新のsubscriptionをexpiryTime降順で1件だけ取得する
   * （003_001_plan.txt「利用状態の基本ロジック」：statusフラグは持たず都度計算）。
   * Trial判定（この端末の firstUseDate + 60日）はローカルのcachedUser情報からJS側で計算する。
   */
  @ReactMethod
  fun fetchLatestSubscription(accountId: String, promise: Promise) {
    scope.launch {
      try {
        val snap =
            firestore
                .collection("subscriptions")
                .whereEqualTo("accountId", accountId)
                .orderBy("expiryTime", Query.Direction.DESCENDING)
                .limit(1)
                .get()
                .await()
        if (snap.isEmpty) {
          promise.resolve(null)
          return@launch
        }
        val doc = snap.documents[0]
        val map = Arguments.createMap()
        map.putDouble(
            "expiryTimeMillis",
            (doc.getTimestamp("expiryTime")?.toDate()?.time ?: 0L).toDouble(),
        )
        map.putString("provider", doc.getString("provider"))
        map.putString("lastNotificationType", doc.getString("lastNotificationType"))
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("FETCH_SUBSCRIPTION_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * accounts/{accountId} を読み取り、ownerUid を返す（Client直接。firestore.rulesで
   * 所属memberにread許可済み。003_004_構築.txt「accounts/{accountId}の読み取り」）。
   * 購入ボタンのowner限定表示に使う。
   */
  @ReactMethod
  fun fetchAccountOwnerUid(accountId: String, promise: Promise) {
    scope.launch {
      try {
        val snap = firestore.collection("accounts").document(accountId).get().await()
        promise.resolve(snap.getString("ownerUid"))
      } catch (e: Exception) {
        promise.reject("FETCH_ACCOUNT_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * accounts/{accountId}/members を読み取る（Client直接。所属memberにread許可済み。
   * 003_003_misc.txt #15）。メンバー一覧の表示に使う。
   * ドキュメントIDは、参加済みならuid、未ログインの招待中ならemailなので、
   * "@"を含むかどうかでpendingを判定する。
   */
  @ReactMethod
  fun fetchMembers(accountId: String, promise: Promise) {
    scope.launch {
      try {
        val snap =
            firestore.collection("accounts").document(accountId).collection("members").get().await()
        val array = Arguments.createArray()
        for (doc in snap.documents) {
          val map = Arguments.createMap()
          map.putString("id", doc.id)
          map.putString("email", doc.getString("email"))
          map.putBoolean("pending", doc.id.contains("@"))
          array.pushMap(map)
        }
        promise.resolve(array)
      } catch (e: Exception) {
        promise.reject("FETCH_MEMBERS_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

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
        val button = GetSignInWithGoogleOption.Builder(webClientId).setNonce(nonce()).build()
        getCredential(
            activity,
            GetCredentialRequest.Builder().addCredentialOption(button).build(),
        )
      }

  private suspend fun getCredential(activity: Activity, request: GetCredentialRequest) =
      CredentialManager.create(activity).getCredential(activity, request).credential

  private fun nonce(): String {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    return Base64.encodeToString(
        bytes,
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )
  }

  private fun authResultMap(uid: String, isNewUser: Boolean): WritableMap {
    val map = Arguments.createMap()
    map.putString("uid", uid)
    map.putBoolean("isNewUser", isNewUser)
    // 匿名認証でサインインしたままのユーザーか（Googleなどが紐づいていない）
    map.putBoolean("isAnonymous", auth.currentUser?.isAnonymous ?: false)
    return map
  }

  private fun cachedUserMap(cached: AccountDb.CachedUser): WritableMap {
    val map = Arguments.createMap()
    map.putString("uid", cached.uid)
    map.putDouble("firstUseDate", cached.firstUseDate.toDouble())
    map.putString("accountId", cached.accountId)
    return map
  }

  companion object {
    const val NAME = "Account"
  }
}
