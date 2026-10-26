package com.firemint.query

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * simple の「値」に入れる日時を、Android 標準のカレンダーと時計で選ぶ。
 * 返すのは「2026-01-01 12:00」の形。選んだ数字をそのまま返し、時間帯の調整はしない
 * （FirestoreClient が、世界標準時（UTC）の日時として、そのまま検索に使う）。
 */
class DateTimePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  /** initial: 最初に開く日時（「値」に入っているもの）。読めなければ、いまの日時（UTC）。キャンセルは null。 */
  @ReactMethod
  fun pick(initial: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    val cal = Calendar.getInstance(UTC)
    parse(initial)?.let { cal.time = it }
    var settled = false
    fun finish(value: String?) {
      if (!settled) {
        settled = true
        promise.resolve(value)
      }
    }
    activity.runOnUiThread {
      val date =
          DatePickerDialog(
              activity,
              { _, year, month, day ->
                val time =
                    TimePickerDialog(
                        activity,
                        { _, hour, minute ->
                          finish(
                              String.format(
                                  Locale.US,
                                  "%04d-%02d-%02d %02d:%02d",
                                  year,
                                  month + 1,
                                  day,
                                  hour,
                                  minute,
                              ))
                        },
                        cal.get(Calendar.HOUR_OF_DAY),
                        cal.get(Calendar.MINUTE),
                        true,
                    )
                time.setOnCancelListener { finish(null) }
                time.show()
              },
              cal.get(Calendar.YEAR),
              cal.get(Calendar.MONTH),
              cal.get(Calendar.DAY_OF_MONTH),
          )
      date.setOnCancelListener { finish(null) }
      date.show()
    }
  }

  private fun parse(text: String): java.util.Date? {
    val t = text.trim()
    for (pattern in listOf("yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd")) {
      val format = SimpleDateFormat(pattern, Locale.US)
      format.isLenient = false
      format.timeZone = UTC
      val pos = ParsePosition(0)
      val date = format.parse(t, pos)
      if (date != null && pos.index == t.length) {
        return date
      }
    }
    return null
  }

  companion object {
    const val NAME = "DateTimePicker"
    private val UTC = TimeZone.getTimeZone("UTC")
  }
}
