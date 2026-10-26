package com.firemint.data_transfer

import android.util.Base64
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

object EntityEncoder {
  private const val MEANING_GD_WHEN = 7L
  private const val MEANING_GEORSS_POINT = 9L
  private const val MEANING_BLOB = 14L
  private const val MEANING_ENTITY_PROTO = 19L

  fun encode(path: String, fields: JSONObject, app: String): ByteArray {
    val pathBody = encodePath(path)
    return ProtoWire.concat(
        listOf(
            ProtoWire.encodeMessageField(13, encodeReference(app, path)),
            encodeProperties(fields, app),
            ProtoWire.encodeMessageField(16, pathBody),
        ),
    )
  }

  private fun encodePath(path: String): ByteArray {
    val segments = path.split('/').filter { it.isNotEmpty() }
    val groups = ArrayList<ByteArray>()
    var index = 0
    while (index + 1 < segments.size) {
      groups.add(
          ProtoWire.encodeGroupField(
              1,
              ProtoWire.concat(
                  listOf(
                      ProtoWire.encodeUtf8Field(2, segments[index]),
                      ProtoWire.encodeUtf8Field(4, segments[index + 1]),
                  ),
              ),
          ),
      )
      index += 2
    }
    return ProtoWire.concat(groups)
  }

  private fun encodeReference(app: String, path: String): ByteArray =
      ProtoWire.concat(
          listOf(ProtoWire.encodeUtf8Field(13, app), ProtoWire.encodeMessageField(14, encodePath(path))),
      )

  private fun encodeProperties(fields: JSONObject, app: String): ByteArray {
    val parts = ArrayList<ByteArray>()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val name = keys.next()
      val value = fields.optJSONObject(name) ?: continue
      parts.addAll(encodeProperty(name, value, app, isArray(value)))
    }
    return ProtoWire.concat(parts)
  }

  private fun isArray(value: JSONObject) = value.has("arrayValue")

  private fun encodeProperty(
      name: String,
      value: JSONObject,
      app: String,
      multiple: Boolean,
  ): List<ByteArray> {
    if (value.has("arrayValue")) {
      val values = value.getJSONObject("arrayValue").optJSONArray("values") ?: JSONArray()
      val out = ArrayList<ByteArray>()
      for (i in 0 until values.length()) {
        val item = values.optJSONObject(i) ?: continue
        out.addAll(encodeProperty(name, item, app, true))
      }
      return out
    }
    val encoded = encodeValue(value, app) ?: return emptyList()
    return listOf(
        ProtoWire.encodeMessageField(
            14,
            ProtoWire.concat(
                listOf(
                    ProtoWire.encodeVarintField(1, encoded.first),
                    ProtoWire.encodeUtf8Field(3, name),
                    ProtoWire.encodeVarintField(4, if (multiple) 1L else 0L),
                    ProtoWire.encodeMessageField(5, encoded.second),
                ),
            ),
        ),
    )
  }

  private fun encodeValue(value: JSONObject, app: String): Pair<Long, ByteArray>? {
    when {
      // null は、中身の無い値として書く（フィールドごと落とさない。EntityDecoder は空の値を null に戻す）
      value.has("nullValue") -> return 0L to ByteArray(0)
      value.has("booleanValue") ->
          return 0L to ProtoWire.encodeVarintField(2, if (value.getBoolean("booleanValue")) 1L else 0L)
      value.has("integerValue") -> {
        val n = value.optString("integerValue").toLongOrNull() ?: return null
        return 0L to ProtoWire.encodeVarintField(1, n)
      }
      value.has("doubleValue") -> return 0L to ProtoWire.encodeDoubleField(4, value.getDouble("doubleValue"))
      value.has("stringValue") ->
          return 0L to ProtoWire.encodeBytesField(3, value.getString("stringValue").toByteArray(Charsets.UTF_8))
      value.has("timestampValue") -> {
        val micros = parseIsoMicros(value.getString("timestampValue")) ?: return null
        return MEANING_GD_WHEN to ProtoWire.encodeVarintField(1, micros)
      }
      value.has("bytesValue") -> {
        val raw =
            try {
              Base64.decode(value.getString("bytesValue"), Base64.DEFAULT)
            } catch (_: Exception) {
              return null
            }
        return MEANING_BLOB to ProtoWire.encodeBytesField(3, raw)
      }
      value.has("referenceValue") -> {
        val ref = value.getString("referenceValue")
        val path = ref.substringAfter("/documents/", "")
        if (path.isBlank()) {
          return null
        }
        return 0L to ProtoWire.encodeGroupField(12, encodeReference(app, path))
      }
      value.has("geoPointValue") -> {
        val geo = value.getJSONObject("geoPointValue")
        return MEANING_GEORSS_POINT to
            ProtoWire.encodeGroupField(
                5,
                ProtoWire.concat(
                    listOf(
                        ProtoWire.encodeDoubleField(6, geo.optDouble("latitude", 0.0)),
                        ProtoWire.encodeDoubleField(7, geo.optDouble("longitude", 0.0)),
                    ),
                ),
            )
      }
      value.has("mapValue") -> {
        val inner = value.getJSONObject("mapValue").optJSONObject("fields") ?: JSONObject()
        return MEANING_ENTITY_PROTO to ProtoWire.encodeBytesField(3, encodeProperties(inner, app))
      }
      else -> return null
    }
  }

  private fun parseIsoMicros(iso: String): Long? {
    val trimmed = iso.trim().removeSuffix("Z")
    val dot = trimmed.indexOf('.')
    val main = if (dot >= 0) trimmed.substring(0, dot) else trimmed
    val fracRaw = if (dot >= 0) trimmed.substring(dot + 1) else ""
    val fracMicros = fracRaw.padEnd(6, '0').take(6).toLongOrNull() ?: 0L
    return try {
      val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
      fmt.timeZone = TimeZone.getTimeZone("UTC")
      val seconds = (fmt.parse(main)?.time ?: return null) / 1000L
      seconds * 1_000_000L + fracMicros
    } catch (_: Exception) {
      null
    }
  }
}
