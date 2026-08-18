import admin from 'firebase-admin'
import type { Credential } from 'firebase-admin/app'
import { initializeFirestore, type Firestore } from 'firebase-admin/firestore'
import { Firestore as GoogleCloudFirestore } from '@google-cloud/firestore'
import { PassThroughClient } from 'google-auth-library'
import { getFocusedProjectId, requireFocusedProjectId, setFocusedProjectId } from './focused'
import { logInfo } from '@shared/logging/logger'
import type { FirestoreConnectionInfo, GoogleAuthorizedUserJson, ServiceAccountJson } from './types'

/** ADC を使わない。process-wide の FIRESTORE_EMULATOR_HOST も置かない。 */
const EMULATOR_ADMIN_CREDENTIAL: Credential = {
  async getAccessToken() {
    return { access_token: 'owner', expires_in: 3600 }
  }
}

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
    clientEmail: serviceAccount.client_email,
    authType: 'serviceAccount'
  }

  connections.set(projectId, { app, firestore, info })
  logInfo('firestore', `firestore client initialized project_id=${projectId}`)

  return info
}

export async function connectFirestoreWithGoogle(input: {
  projectId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  accountEmail: string
}): Promise<FirestoreConnectionInfo> {
  const projectId = input.projectId.trim()

  if (!projectId) {
    throw new Error('projectId を指定してください')
  }

  logInfo('firestore', `connect with google account project_id=${projectId} email=${input.accountEmail}`)

  await deleteExistingApp(projectId)

  const refreshTokenJson: GoogleAuthorizedUserJson = {
    type: 'authorized_user',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken
  }

  // firebase-admin の initializeFirestore は RefreshTokenCredential を拒否する
  // （cert / ADC のみ可）。Google ユーザー OAuth は @google-cloud/firestore に
  // authorized_user を直接渡して初期化する。
  logInfo('firestore', `initialize firestore client via google user creds preferRest=true project_id=${projectId}`)
  const firestore = new GoogleCloudFirestore({
    projectId,
    preferRest: true,
    // GoogleAuth は authorized_user を解釈できる（型定義は SA 向けのみ）
    credentials: refreshTokenJson as unknown as { client_email?: string; private_key?: string }
  }) as unknown as Firestore

  const app = admin.initializeApp(
    {
      credential: admin.credential.refreshToken(refreshTokenJson),
      projectId
    },
    projectId
  )

  const info: FirestoreConnectionInfo = {
    projectId,
    clientEmail: input.accountEmail,
    authType: 'google'
  }

  connections.set(projectId, { app, firestore, info })
  logInfo('firestore', `firestore client initialized via google project_id=${projectId}`)

  return info
}

export async function connectFirestoreWithEmulator(input: {
  poolId: string
  projectId: string
  host: string
}): Promise<FirestoreConnectionInfo> {
  const poolId = input.poolId.trim()
  const projectId = input.projectId.trim()
  const host = input.host.trim()

  if (!poolId || !projectId || !host) {
    throw new Error('Emulator の host と projectId を指定してください')
  }

  logInfo('firestore', `connect emulator pool_id=${poolId} project_id=${projectId} host=${host}`)
  await deleteExistingApp(poolId)

  const firestore = new GoogleCloudFirestore({
    projectId,
    host,
    ssl: false,
    preferRest: true,
    authClient: new PassThroughClient()
  } as ConstructorParameters<typeof GoogleCloudFirestore>[0]) as unknown as Firestore

  const app = admin.initializeApp(
    {
      projectId,
      credential: EMULATOR_ADMIN_CREDENTIAL
    },
    poolId
  )

  const info: FirestoreConnectionInfo = {
    projectId: poolId,
    clientEmail: host,
    authType: 'emulator'
  }

  connections.set(poolId, { app, firestore, info })
  logInfo('firestore', `firestore client initialized via emulator pool_id=${poolId} host=${host}`)

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

/** 接続プール上の app から Admin Auth を返す（Auth ユーザー管理用） */
export function getAuth(projectId?: string): admin.auth.Auth {
  const resolvedProjectId = resolveProjectId(projectId)
  const entry = connections.get(resolvedProjectId)

  if (!entry) {
    throw new Error(`Firestore is not connected: ${resolvedProjectId}`)
  }

  return admin.auth(entry.app)
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
