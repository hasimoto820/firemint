import admin from 'firebase-admin'
import { getFirestore } from './client'

export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof admin.firestore.Timestamp) {
    return {
      __firemint_type: 'timestamp',
      iso: value.toDate().toISOString()
    }
  }

  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __firemint_type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude
    }
  }

  if (value instanceof admin.firestore.DocumentReference) {
    return {
      __firemint_type: 'reference',
      path: value.path
    }
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue)
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(record)) {
      result[key] = serializeFirestoreValue(nestedValue)
    }

    return result
  }

  return value
}

export function deserializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deserializeFirestoreValue)
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const typeMarker = record.__firemint_type

    if (typeMarker === 'timestamp' && typeof record.iso === 'string') {
      return admin.firestore.Timestamp.fromDate(new Date(record.iso))
    }

    if (
      typeMarker === 'geopoint' &&
      typeof record.latitude === 'number' &&
      typeof record.longitude === 'number'
    ) {
      return new admin.firestore.GeoPoint(record.latitude, record.longitude)
    }

    if (typeMarker === 'reference' && typeof record.path === 'string') {
      return getFirestore().doc(record.path)
    }

    const result: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(record)) {
      result[key] = deserializeFirestoreValue(nestedValue)
    }

    return result
  }

  return value
}

export function deserializeDocumentData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    result[key] = deserializeFirestoreValue(value)
  }

  return result
}
