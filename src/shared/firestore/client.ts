import admin from 'firebase-admin'
import { initializeFirestore, type Firestore } from 'firebase-admin/firestore'
import { getFocusedProjectId, requireFocusedProjectId, setFocusedProjectId } from './focused'
import { logInfo } from '@shared/logging/logger'
import type { FirestoreConnectionInfo, ServiceAccountJson } from './types'

type ConnectionEntry = {
  app: admin.app.App
  firestore: Firestore
  info: FirestoreConnectionInfo
}

const connections = new Map<string, ConnectionEntry>()

function parseServiceAccount(json: string): ServiceAccountJson {
  const parsed = JSON.parse(json) as Partial<ServiceAccountJson>

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON')
  }

  return parsed as ServiceAccountJson
}

function resolveProjectId(projectId?: string): string {
  return projectId ?? requireFocusedProjectId()
}

async function deleteExistingApp(projectId: string): Promise<void> {
  const existing = connections.get(projectId)

  if (existing) {
    logInfo('firestore', `delete existing app project_id=${projectId}`)
    await existing.app.delete()
    connections.delete(projectId)
  }

  const namedApp = admin.apps.find((app) => app?.name === projectId)

  if (namedApp) {
    logInfo('firestore', `delete orphaned app project_id=${projectId}`)
    await namedApp.delete()
  }
}

export async function connectFirestore(json: string): Promise<FirestoreConnectionInfo> {
  logInfo('firestore', 'parse service account JSON')
  const serviceAccount = parseServiceAccount(json)
  const projectId = serviceAccount.project_id
  logInfo('firestore', `service account parsed: project_id=${projectId}`)

  await deleteExistingApp(projectId)

  logInfo('firestore', `initialize firebase admin app project_id=${projectId}`)
  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
    },
    projectId
  )

  logInfo('firestore', `initialize firestore client preferRest=true project_id=${projectId}`)
  const firestore = initializeFirestore(app, { preferRest: true })

  const info: FirestoreConnectionInfo = {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email
  }

  connections.set(projectId, { app, firestore, info })
  logInfo('firestore', `firestore client initialized project_id=${projectId}`)

  return info
}

export async function disconnectFirestore(projectId?: string): Promise<void> {
  const resolvedProjectId = projectId ?? getFocusedProjectId()

  if (!resolvedProjectId) {
    return
  }

  const entry = connections.get(resolvedProjectId)

  if (!entry) {
    return
  }

  logInfo('firestore', `disconnect firebase app project_id=${resolvedProjectId}`)
  await entry.app.delete()
  connections.delete(resolvedProjectId)

  if (getFocusedProjectId() === resolvedProjectId) {
    setFocusedProjectId(null)
  }
}

export function getFirestore(projectId?: string): Firestore {
  const resolvedProjectId = resolveProjectId(projectId)
  const entry = connections.get(resolvedProjectId)

  if (!entry) {
    throw new Error(`Firestore is not connected: ${resolvedProjectId}`)
  }

  return entry.firestore
}

export function getConnectionInfo(projectId?: string): FirestoreConnectionInfo | null {
  const resolvedProjectId = projectId ?? getFocusedProjectId()

  if (!resolvedProjectId) {
    return null
  }

  return connections.get(resolvedProjectId)?.info ?? null
}

export function isFirestoreConnected(projectId?: string): boolean {
  if (projectId) {
    return connections.has(projectId)
  }

  const focused = getFocusedProjectId()
  return focused ? connections.has(focused) : false
}

export function listConnectedProjectIds(): string[] {
  return Array.from(connections.keys())
}

export function logFirestoreState(context: string): void {
  const focused = getFocusedProjectId()
  logInfo(
    'firestore',
    `${context}: connected=${connections.size} focused=${focused ?? 'none'} loaded=[${listConnectedProjectIds().join(', ')}]`
  )
}
