package com.firemint.snippet

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class SnippetDb(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  data class Group(val id: Long, val name: String)
  data class Snippet(val id: Long, val groupId: Long?, val name: String, val body: String)

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE snippet_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sort INTEGER NOT NULL DEFAULT 0
        )
        """.trimIndent(),
    )
    db.execSQL(
        """
        CREATE TABLE snippets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER,
          name TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL,
          sort INTEGER NOT NULL DEFAULT 0
        )
        """.trimIndent(),
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  fun listGroups(): List<Group> {
    readableDatabase
        .rawQuery("SELECT id, name FROM snippet_groups ORDER BY sort ASC, id ASC", null)
        .use { c ->
          val out = ArrayList<Group>()
          while (c.moveToNext()) {
            out.add(Group(c.getLong(0), c.getString(1) ?: ""))
          }
          return out
        }
  }

  fun listSnippets(): List<Snippet> {
    readableDatabase
        .rawQuery(
            "SELECT id, group_id, name, body FROM snippets ORDER BY sort ASC, id ASC",
            null,
        )
        .use { c ->
          val out = ArrayList<Snippet>()
          while (c.moveToNext()) {
            val groupId = if (c.isNull(1)) null else c.getLong(1)
            out.add(Snippet(c.getLong(0), groupId, c.getString(2) ?: "", c.getString(3) ?: ""))
          }
          return out
        }
  }

  fun addGroup(name: String): Group {
    val label = name.trim()
    if (label.isEmpty()) {
      throw IllegalArgumentException("グループ名が空です")
    }
    val id =
        writableDatabase.insertOrThrow(
            "snippet_groups",
            null,
            ContentValues().apply {
              put("name", label)
              put("sort", listGroups().size)
            },
        )
    return Group(id, label)
  }

  fun updateGroup(id: Long, name: String): Group {
    val label = name.trim()
    if (label.isEmpty()) {
      throw IllegalArgumentException("グループ名が空です")
    }
    val n =
        writableDatabase.update(
            "snippet_groups",
            ContentValues().apply { put("name", label) },
            "id = ?",
            arrayOf(id.toString()),
        )
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
    return Group(id, label)
  }

  fun removeGroup(id: Long) {
    writableDatabase.update(
        "snippets",
        ContentValues().apply { putNull("group_id") },
        "group_id = ?",
        arrayOf(id.toString()),
    )
    val n = writableDatabase.delete("snippet_groups", "id = ?", arrayOf(id.toString()))
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
  }

  fun addSnippet(groupId: Long?, name: String, body: String): Snippet {
    val text = body
    if (text.isEmpty()) {
      throw IllegalArgumentException("本文が空です")
    }
    val id =
        writableDatabase.insertOrThrow(
            "snippets",
            null,
            ContentValues().apply {
              if (groupId == null) {
                putNull("group_id")
              } else {
                put("group_id", groupId)
              }
              put("name", name.trim())
              put("body", text)
              put("sort", listSnippets().size)
            },
        )
    return Snippet(id, groupId, name.trim(), text)
  }

  fun updateSnippet(id: Long, groupId: Long?, name: String, body: String): Snippet {
    val text = body
    if (text.isEmpty()) {
      throw IllegalArgumentException("本文が空です")
    }
    val values =
        ContentValues().apply {
          if (groupId == null) {
            putNull("group_id")
          } else {
            put("group_id", groupId)
          }
          put("name", name.trim())
          put("body", text)
        }
    val n = writableDatabase.update("snippets", values, "id = ?", arrayOf(id.toString()))
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
    return Snippet(id, groupId, name.trim(), text)
  }

  fun removeSnippet(id: Long) {
    val n = writableDatabase.delete("snippets", "id = ?", arrayOf(id.toString()))
    if (n == 0) {
      throw IllegalStateException("見つかりません")
    }
  }

  fun getSnippet(id: Long): Snippet {
    readableDatabase
        .rawQuery(
            "SELECT id, group_id, name, body FROM snippets WHERE id = ?",
            arrayOf(id.toString()),
        )
        .use { c ->
          if (!c.moveToFirst()) {
            throw IllegalStateException("見つかりません")
          }
          val groupId = if (c.isNull(1)) null else c.getLong(1)
          return Snippet(c.getLong(0), groupId, c.getString(2) ?: "", c.getString(3) ?: "")
        }
  }

  companion object {
    const val DB_NAME = "firemint_snippets.db"
    private const val DB_VERSION = 1
  }
}
