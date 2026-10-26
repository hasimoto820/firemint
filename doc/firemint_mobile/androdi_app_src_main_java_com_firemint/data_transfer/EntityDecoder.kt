package com.firemint.data_transfer

import android.util.Base64
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

object EntityDecoder {

  // リファレンスのプロジェクトを、宛先プロジェクトに書き換えた写しを返す（002_007 json）。
  // 公式ダンプのリファレンスは、エクスポート元のプロジェクト名を持っている
  fun withReferenceProject(fields: JSONObject, projectId: String): JSONObject {
    val out = JSONObject()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      out.put(key, retargetValue(fields.getJSONObject(key), projectId))
    }
    return out
  }

  private fun retargetValue(value: JSONObject, projectId: String): JSONObject =
      when {
        value.has("referenceValue") -> {
          val name = value.getString("referenceValue")
          val rest = name.substringAfter("/documents/", "")
          if (name.startsWith("projects/") && rest.isNotEmpty()) {
            JSONObject().put("referenceValue", "projects/$projectId/databases/(default)/documents/$rest")
          } else {
            value
          }
        }
        value.has("mapValue") -> {
          val inner = value.getJSONObject("mapValue").optJSONObject("fields")
          if (inner == null) value
          else JSONObject().put("mapValue", JSONObject().put("fields", withReferenceProject(inner, projectId)))
        }
        value.has("arrayValue") -> {
          val values = value.getJSONObject("arrayValue").optJSONArray("values")
          if (values == null) {
            value
          } else {
            val next = JSONArray()
            for (i in 0 until values.length()) {
              next.put(retargetValue(values.getJSONObject(i), projectId))
            }
            JSONObject().put("arrayValue", JSONObject().put("values", next))
          }
        }
        else -> value
      }
  private const val MEANING_GD_WHEN = 7L
  private const val MEANING_BLOB = 14L
  private const val MEANING_ENTITY_PROTO = 19L

  // projectId: キーにある、エクスポート元のプロジェクト。無ければ空
  data class Entity(val path: String, val fields: JSONObject, val projectId: String)

  fun decode(record: ByteArray): Entity? {
    var path = ""
    var app = ""
    val propertyEntries = ArrayList<ByteArray>()
    for ((fieldId, _, value) in ProtoReader(record).readFields()) {
      when (fieldId) {
        13 -> decodeReferenceParts(value as ByteArray).let { (a, p) ->
          app = a
          path = p
        }
        14 -> propertyEntries.add(value as ByteArray)
      }
    }
    if (path.isBlank()) {
      return null
    }
    return Entity(path, assembleProperties(propertyEntries), app.removePrefix("s~"))
  }

  private fun assembleProperties(propertyEntries: List<ByteArray>): JSONObject {
    val out = JSONObject()
    val order = ArrayList<String>()
    val scalars = HashMap<String, JSONObject>()
    val arrays = HashMap<String, JSONArray>()
    for (raw in propertyEntries) {
      val (name, multiple, decoded) = decodeProperty(raw)
      if (name.isEmpty()) {
        continue
      }
      if (!order.contains(name)) {
        order.add(name)
      }
      if (multiple) {
        arrays.getOrPut(name) { JSONArray() }.put(decoded)
      } else {
        scalars[name] = decoded
      }
    }
    for (name in order) {
      val arr = arrays[name]
      out.put(name, if (arr != null) JSONObject().put("arrayValue", JSONObject().put("values", arr)) else scalars[name])
    }
    return out
  }

  private fun decodeProperty(raw: ByteArray): Triple<String, Boolean, JSONObject> {
    var meaning = 0L
    var name = ""
    var multiple = false
    var valueBytes: ByteArray? = null
    for ((fieldId, _, value) in ProtoReader(raw).readFields()) {
      when (fieldId) {
        1 -> meaning = value as Long
        3 -> name = String(value as ByteArray, Charsets.UTF_8)
        4 -> multiple = (value as Long) != 0L
        5 -> valueBytes = value as ByteArray
      }
    }
    val decoded = valueBytes?.let { decodeValue(meaning, it) } ?: JSONObject().put("nullValue", JSONObject.NULL)
    return Triple(name, multiple, decoded)
  }

  private fun decodeValue(meaning: Long, raw: ByteArray): JSONObject {
    val fields = ProtoReader(raw).readFields()
    if (fields.isEmpty()) {
      return JSONObject().put("nullValue", JSONObject.NULL)
    }
    val (fieldId, _, value) = fields[0]
    return when (fieldId) {
      1 -> {
        val n = value as Long
        if (meaning == MEANING_GD_WHEN) {
          JSONObject().put("timestampValue", formatIsoMicros(n))
        } else {
          JSONObject().put("integerValue", n.toString())
        }
      }
      2 -> JSONObject().put("booleanValue", (value as Long) != 0L)
      3 -> {
        val bytes = value as ByteArray
        when (meaning) {
          MEANING_BLOB -> JSONObject().put("bytesValue", Base64.encodeToString(bytes, Base64.NO_WRAP))
          MEANING_ENTITY_PROTO -> JSONObject().put("mapValue", JSONObject().put("fields", decodeMapFields(bytes)))
          else -> JSONObject().put("stringValue", String(bytes, Charsets.UTF_8))
        }
      }
      4 -> JSONObject().put("doubleValue", Double.fromBits(value as Long))
      5 -> {
        var lat = 0.0
        var lng = 0.0
        for ((gid, _, gvalue) in ProtoReader(value as ByteArray).readFields()) {
          when (gid) {
            6 -> lat = Double.fromBits(gvalue as Long)
            7 -> lng = Double.fromBits(gvalue as Long)
          }
        }
        JSONObject().put("geoPointValue", JSONObject().put("latitude", lat).put("longitude", lng))
      }
      12 -> {
        val (app, refPath) = decodeReferenceParts(value as ByteArray)
        val projectId = app.removePrefix("s~")
        val resource =
            if (projectId.isBlank() || refPath.isBlank()) {
              refPath
            } else {
              "projects/$projectId/databases/(default)/documents/$refPath"
            }
        JSONObject().put("referenceValue", resource)
      }
      else -> JSONObject().put("nullValue", JSONObject.NULL)
    }
  }

  private fun decodeMapFields(raw: ByteArray): JSONObject {
    val entries = ProtoReader(raw).readFields().filter { it.first == 14 }.map { it.third as ByteArray }
    return assembleProperties(entries)
  }

  private fun decodeReferenceParts(raw: ByteArray): Pair<String, String> {
    var app = ""
    var path = ""
    for ((fieldId, _, value) in ProtoReader(raw).readFields()) {
      when (fieldId) {
        13 -> app = String(value as ByteArray, Charsets.UTF_8)
        14 -> path = decodePath(value as ByteArray)
      }
    }
    return app to path
  }

  private fun decodePath(raw: ByteArray): String {
    val segments = ArrayList<String>()
    for ((fieldId, _, value) in ProtoReader(raw).readFields()) {
      if (fieldId != 1) {
        continue
      }
      var kind = ""
      var name = ""
      for ((gid, _, gvalue) in ProtoReader(value as ByteArray).readFields()) {
        when (gid) {
          2 -> kind = String(gvalue as ByteArray, Charsets.UTF_8)
          4 -> name = String(gvalue as ByteArray, Charsets.UTF_8)
        }
      }
      segments.add(kind)
      segments.add(name)
    }
    return segments.joinToString("/")
  }

  private fun formatIsoMicros(micros: Long): String {
    val seconds = Math.floorDiv(micros, 1_000_000L)
    val fracMicros = Math.floorMod(micros, 1_000_000L)
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    val base = fmt.format(Date(seconds * 1000L))
    return "$base.${fracMicros.toString().padStart(6, '0')}Z"
  }
}
