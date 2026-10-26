package com.firemint.account

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * 003_account/003_003_misc.txt・003_004_構築.txt の functions/src/account, billing
 * の各 Cloud Functions(callable) を呼び出す口。
 * FirebaseFunctionsは現在サインイン中のFirebase Auth IDトークンを自動的に付与するため、
 * ここでは認証トークンの受け渡しを意識する必要はない。
 */
class AccountFunctionsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val functions: FirebaseFunctions by lazy {
    FirebaseFunctions.getInstance(FUNCTIONS_REGION)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    scope.cancel()
  }

  @ReactMethod
  fun createAccount(promise: Promise) {
    callFunction("createAccount", null, promise)
  }

  // 端末を登録する（003_011_device.txt）。deviceId: この端末の Android ID
  @ReactMethod
  fun registerDevice(deviceId: String, promise: Promise) {
    callFunction("registerDevice", mapOf("deviceId" to deviceId), promise)
  }

  @ReactMethod
  fun joinAccount(promise: Promise) {
    callFunction("joinAccount", null, promise)
  }

  @ReactMethod
  fun respondToInvite(accept: Boolean, promise: Promise) {
    callFunction("respondToInvite", mapOf("accept" to accept), promise)
  }

  @ReactMethod
  fun addMember(email: String, promise: Promise) {
    callFunction("addMember", mapOf("email" to email), promise)
  }

  @ReactMethod
  fun removeMember(uid: String, promise: Promise) {
    callFunction("removeMember", mapOf("uid" to uid), promise)
  }

  @ReactMethod
  fun deleteAccount(promise: Promise) {
    callFunction("deleteAccount", null, promise)
  }

  @ReactMethod
  fun deleteMyData(promise: Promise) {
    callFunction("deleteMyData", null, promise)
  }

  @ReactMethod
  fun verifyAndroidPurchase(purchaseToken: String, productId: String, promise: Promise) {
    callFunction(
        "verifyAndroidPurchase",
        mapOf("purchaseToken" to purchaseToken, "productId" to productId),
        promise,
    )
  }

  private fun callFunction(name: String, data: Map<String, Any?>?, promise: Promise) {
    scope.launch {
      try {
        val result = functions.getHttpsCallable(name).call(data).await()
        promise.resolve(toWritable(result.getData()))
      } catch (e: FirebaseFunctionsException) {
        promise.reject(e.code.name, e.message ?: e.code.name, e)
      } catch (e: Exception) {
        promise.reject("FUNCTIONS_CALL_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /** HttpsCallableResult.data（Map/List/プリミティブの入れ子）をWritableMap/Arrayへ変換する。 */
  private fun toWritable(value: Any?): Any? {
    return when (value) {
      null -> null
      is Map<*, *> -> {
        val map = Arguments.createMap()
        for ((k, v) in value) {
          putWritable(map, k.toString(), v)
        }
        map
      }
      is List<*> -> {
        val array = Arguments.createArray()
        for (v in value) {
          when (val converted = toWritable(v)) {
            null -> array.pushNull()
            is WritableMap -> array.pushMap(converted)
            is String -> array.pushString(converted)
            is Double -> array.pushDouble(converted)
            is Boolean -> array.pushBoolean(converted)
            else -> array.pushString(converted.toString())
          }
        }
        array
      }
      else -> value
    }
  }

  private fun putWritable(map: WritableMap, key: String, value: Any?) {
    when (val converted = toWritable(value)) {
      null -> map.putNull(key)
      is WritableMap -> map.putMap(key, converted)
      is com.facebook.react.bridge.WritableArray -> map.putArray(key, converted)
      is String -> map.putString(key, converted)
      is Boolean -> map.putBoolean(key, converted)
      is Double -> map.putDouble(key, converted)
      is Long -> map.putDouble(key, converted.toDouble())
      is Int -> map.putInt(key, converted)
      else -> map.putString(key, converted.toString())
    }
  }

  companion object {
    const val NAME = "AccountFunctions"
    private const val FUNCTIONS_REGION = "asia-northeast1"
  }
}
