package com.firemint.settings

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class SettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val db = SettingsDb(reactContext)

  override fun getName(): String = NAME

  @ReactMethod
  fun getTheme(promise: Promise) {
    try {
      val map = Arguments.createMap()
      map.putString("color1", db.get(SettingsDb.KEY_COLOR1, SettingsDb.DEFAULT_COLOR1))
      map.putString("color2", db.get(SettingsDb.KEY_COLOR2, SettingsDb.DEFAULT_COLOR2))
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("GET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun setTheme(color1: String, color2: String, promise: Promise) {
    try {
      db.put(SettingsDb.KEY_COLOR1, color1)
      db.put(SettingsDb.KEY_COLOR2, color2)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun getLanguage(promise: Promise) {
    try {
      promise.resolve(db.get(SettingsDb.KEY_LANGUAGE, ""))
    } catch (e: Exception) {
      promise.reject("GET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun setLanguage(language: String, promise: Promise) {
    try {
      db.put(SettingsDb.KEY_LANGUAGE, language)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  // 文字の倍率（"1.15" のような文字列）。未設定なら空文字
  @ReactMethod
  fun getTextScale(promise: Promise) {
    try {
      promise.resolve(db.get(SettingsDb.KEY_TEXT_SCALE, ""))
    } catch (e: Exception) {
      promise.reject("GET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun setTextScale(scale: String, promise: Promise) {
    try {
      db.put(SettingsDb.KEY_TEXT_SCALE, scale)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun getDeviceLocale(promise: Promise) {
    try {
      promise.resolve(Locale.getDefault().toLanguageTag())
    } catch (e: Exception) {
      promise.reject("GET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  @ReactMethod
  fun getAppVersion(promise: Promise) {
    try {
      val packageManager = reactApplicationContext.packageManager
      val packageName = reactApplicationContext.packageName
      val info = packageManager.getPackageInfo(packageName, 0)
      val map = Arguments.createMap()
      map.putString("versionName", info.versionName ?: "")
      val versionCode =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
          info.longVersionCode.toInt()
        } else {
          @Suppress("DEPRECATION")
          info.versionCode
        }
      map.putInt("versionCode", versionCode)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("GET_FAILED", e.message ?: e.javaClass.simpleName, e)
    }
  }

  companion object {
    const val NAME = "Settings"
  }
}
