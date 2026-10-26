package com.firemint.workspace

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

// 名簿は、firestoreアカウント（外部Firestoreへの接続に使うGoogleアカウント）ごとに持つ。
// account は、そのメールアドレス（小文字）。同じ project_id を、アカウントごとに登録できる。
// サインアウト・アカウント切り替えでは、行を消さない（同じアカウントに戻れば、また並ぶ）。
class WorkspaceDb(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  data class Project(val projectId: String, val label: String, val readOnly: Boolean)

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE projects (
          account TEXT NOT NULL,
          project_id TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          read_only INTEGER NOT NULL DEFAULT 0,
          sort INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (account, project_id)
        )
        """.trimIndent(),
    )
  }

  // 1 → 2: account 列を足した。アカウントの分からない行は引き継がず、作り直す（決定）。
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    db.execSQL("DROP TABLE IF EXISTS $TABLE")
    onCreate(db)
  }

  fun list(account: String): List<Project> {
    readableDatabase
        .rawQuery(
            "SELECT project_id, label, read_only FROM projects WHERE account = ? " +
                "ORDER BY sort ASC, project_id ASC",
            arrayOf(key(account)),
        )
        .use { c ->
          val out = ArrayList<Project>()
          while (c.moveToNext()) {
            out.add(Project(c.getString(0), c.getString(1) ?: "", c.getInt(2) != 0))
          }
          return out
        }
  }

  fun add(account: String, projectId: String, label: String, readOnly: Boolean): Project {
    val id = projectId.trim()
    if (id.isEmpty()) {
      throw IllegalArgumentException("project_id が空です")
    }
    val name = label.trim()
    val values =
        ContentValues().apply {
          put(COL_ACCOUNT, key(account))
          put(COL_ID, id)
          put(COL_LABEL, name)
          put(COL_READ_ONLY, if (readOnly) 1 else 0)
          put(COL_SORT, list(account).size)
        }
    try {
      writableDatabase.insertOrThrow(TABLE, null, values)
    } catch (_: SQLiteConstraintException) {
      throw IllegalStateException("すでにあります")
    }
    return Project(id, name, readOnly)
  }

  // nextProjectId: 直した後のプロジェクトID（打ち間違いの修正用）。変えない時は、projectId と同じ値
  fun update(
      account: String,
      projectId: String,
      nextProjectId: String,
      label: String,
      readOnly: Boolean,
  ): Project {
    val id = projectId.trim()
    val nextId = nextProjectId.trim()
    if (id.isEmpty() || nextId.isEmpty()) {
      throw IllegalArgumentException("project_id が空です")
    }
    val name = label.trim()
    val values =
        ContentValues().apply {
          put(COL_ID, nextId)
          put(COL_LABEL, name)
          put(COL_READ_ONLY, if (readOnly) 1 else 0)
        }
    val n =
        try {
          writableDatabase.update(TABLE, values, WHERE_ROW, arrayOf(key(account), id))
        } catch (_: SQLiteConstraintException) {
          throw IllegalStateException("すでにあります")
        }
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
    return Project(nextId, name, readOnly)
  }

  fun remove(account: String, projectId: String) {
    val id = projectId.trim()
    if (id.isEmpty()) {
      throw IllegalArgumentException("project_id が空です")
    }
    val n = writableDatabase.delete(TABLE, WHERE_ROW, arrayOf(key(account), id))
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
  }

  private fun key(account: String): String = account.trim().lowercase()

  companion object {
    const val DB_NAME = "firemint_workspace.db"
    private const val DB_VERSION = 2
    private const val TABLE = "projects"
    private const val COL_ACCOUNT = "account"
    private const val COL_ID = "project_id"
    private const val COL_LABEL = "label"
    private const val COL_READ_ONLY = "read_only"
    private const val COL_SORT = "sort"
    private const val WHERE_ROW = "$COL_ACCOUNT = ? AND $COL_ID = ?"
  }
}
