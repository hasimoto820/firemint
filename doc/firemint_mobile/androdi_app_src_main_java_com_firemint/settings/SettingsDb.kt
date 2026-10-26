package com.firemint.settings

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class SettingsDb(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
        """.trimIndent(),
    )
    db.insert(
        "kv",
        null,
        ContentValues().apply {
          put("key", KEY_COLOR1)
          put("value", DEFAULT_COLOR1)
        },
    )
    db.insert(
        "kv",
        null,
        ContentValues().apply {
          put("key", KEY_COLOR2)
          put("value", DEFAULT_COLOR2)
        },
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  fun get(key: String, fallback: String): String {
    readableDatabase.rawQuery("SELECT value FROM kv WHERE key = ?", arrayOf(key)).use { c ->
      if (c.moveToFirst()) {
        return c.getString(0) ?: fallback
      }
    }
    return fallback
  }

  fun put(key: String, value: String) {
    writableDatabase.insertWithOnConflict(
        "kv",
        null,
        ContentValues().apply {
          put("key", key)
          put("value", value)
        },
        SQLiteDatabase.CONFLICT_REPLACE,
    )
  }

  companion object {
    const val DB_NAME = "firemint_settings.db"
    private const val DB_VERSION = 1
    const val KEY_COLOR1 = "color1"
    const val KEY_COLOR2 = "color2"
    const val KEY_LANGUAGE = "language"
    const val KEY_TEXT_SCALE = "text_scale"
    const val DEFAULT_COLOR1 = "white"
    const val DEFAULT_COLOR2 = "orange"
  }
}
