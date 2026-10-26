package com.firemint.account

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * 端末のローカルキャッシュ（003_011_device.txt「端末の SQLite」）。
 * 端末につき1レコード（id = 1固定）のみを保持する。
 *   uid          … いまログインしている uid の写し
 *   firstUseDate … この端末の日付（devices/{deviceIdHash}.firstUseDate）の写し
 *   accountId    … users/{uid}.accountId の写し
 */
class AccountDb(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE cached_user (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          uid TEXT NOT NULL,
          firstUseDate INTEGER NOT NULL,
          accountId TEXT
        )
        """.trimIndent(),
    )
  }

  // 写しは捨てて作り直す。次の起動で、端末を登録し直す（サーバーの値が正）。
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    db.execSQL("DROP TABLE IF EXISTS cached_user")
    onCreate(db)
  }

  data class CachedUser(
      val uid: String,
      val firstUseDate: Long,
      val accountId: String?,
  )

  fun get(): CachedUser? {
    readableDatabase
        .rawQuery(
            "SELECT uid, firstUseDate, accountId FROM cached_user WHERE id = 1",
            null,
        )
        .use { c ->
          if (c.moveToFirst()) {
            return CachedUser(
                uid = c.getString(0),
                firstUseDate = c.getLong(1),
                accountId = c.getString(2),
            )
          }
        }
    return null
  }

  fun put(uid: String, firstUseDate: Long, accountId: String?) {
    writableDatabase.insertWithOnConflict(
        "cached_user",
        null,
        ContentValues().apply {
          put("id", 1)
          put("uid", uid)
          put("firstUseDate", firstUseDate)
          put("accountId", accountId)
        },
        SQLiteDatabase.CONFLICT_REPLACE,
    )
  }

  fun updateAccountId(accountId: String?) {
    writableDatabase.execSQL(
        "UPDATE cached_user SET accountId = ? WHERE id = 1",
        arrayOf(accountId),
    )
  }

  fun clear() {
    writableDatabase.execSQL("DELETE FROM cached_user WHERE id = 1")
  }

  companion object {
    const val DB_NAME = "firemint_account.db"
    private const val DB_VERSION = 2
  }
}
