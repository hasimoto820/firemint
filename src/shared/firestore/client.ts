import admin from 'firebase-admin'
import { initializeFirestore, type Firestore } from 'firebase-admin/firestore'
import { logInfo } from '@shared/logging/logger'
import type { FirestoreConnectionInfo, ServiceAccountJson } from './types'

let app: admin.app.App | null = null
let firestore: Firestore | null = null
let connectionInfo: FirestoreConnectionInfo | null = null

function parseServiceAccount(json: string): ServiceAccountJson {
  const parsed = JSON.parse(json) as Partial<ServiceAccountJson>

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON')
  }

  return parsed as ServiceAccountJson
}

export async function connectFirestore(json: string): Promise<FirestoreConnectionInfo> {
  logInfo('firestore', 'parse service account JSON')
  const serviceAccount = parseServiceAccount(json)
  logInfo('firestore', `service account parsed: project_id=${serviceAccount.project_id}`)

  if (app) {
    logInfo('firestore', 'delete existing firebase app')
    await app.delete()
    app = null
    firestore = null
    connectionInfo = null
  }

  logInfo('firestore', 'initialize firebase admin app')
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  })
  logInfo('firestore', 'firebase admin app initialized')

  logInfo('firestore', 'initialize firestore client preferRest=true')
  firestore = initializeFirestore(app, { preferRest: true })
  logInfo('firestore', 'firestore client initialized')

  connectionInfo = {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email
  }

  return connectionInfo
}

export async function disconnectFirestore(): Promise<void> {
  if (app) {
    logInfo('firestore', 'disconnect firebase app')
    await app.delete()
    app = null
    firestore = null
    connectionInfo = null
  }
}

export function getFirestore(): Firestore {
  if (!firestore) {
    throw new Error('Firestore is not connected')
  }

  return firestore
}

export function getConnectionInfo(): FirestoreConnectionInfo | null {
  return connectionInfo
}

export function isFirestoreConnected(): boolean {
  return app !== null && firestore !== null
}

export function logFirestoreState(context: string): void {
  logInfo('firestore', `${context}: connected=${isFirestoreConnected()} project_id=${connectionInfo?.projectId ?? 'none'}`)
}
