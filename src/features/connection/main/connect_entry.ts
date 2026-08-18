import { readFile } from 'fs/promises'
import {
  connectFirestore,
  connectFirestoreWithEmulator,
  connectFirestoreWithGoogle,
  logFirestoreState
} from '@shared/firestore/client'
import type { FirestoreConnectionInfo } from '@shared/firestore/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import { parseEmulatorHost } from '@features/connection/shared/emulator'
import { loadGoogleOAuthConfig } from './google_oauth_config'
import { loadGoogleRefreshToken } from './google_token_store'

/**
 * 繋ぎ方の実行。名簿（workspace）はここを呼ぶだけで、token も JSON もホストも読まない。
 * Emulator は authType === 'emulator' の分岐。
 */
export async function connectWorkspaceEntry(
  entry: WorkspaceEntry
): Promise<FirestoreConnectionInfo> {
  if (entry.authType === 'google') {
    if (!entry.googleAccountKey || !entry.googleAccountEmail) {
      throw new Error('Google 接続情報が不足しています。再サインインしてください。')
    }

    return connectGoogleProject({
      projectId: entry.id,
      accountKey: entry.googleAccountKey,
      accountEmail: entry.googleAccountEmail
    })
  }

  if (entry.authType === 'emulator') {
    if (!entry.emulatorHost || !entry.emulatorProjectId) {
      throw new Error('Emulator 接続情報が不足しています')
    }

    return connectEmulator({
      poolId: entry.id,
      projectId: entry.emulatorProjectId,
      host: entry.emulatorHost
    })
  }

  if (!entry.serviceAccountPath) {
    throw new Error('サービスアカウント path がありません')
  }

  return connectServiceAccountFile(entry.serviceAccountPath)
}

export async function connectServiceAccountFile(
  serviceAccountPath: string
): Promise<FirestoreConnectionInfo> {
  const json = await readFile(serviceAccountPath, 'utf-8')
  const info = await connectFirestore(json)
  logFirestoreState('after connectServiceAccountFile')
  return info
}

export async function connectGoogleProject(input: {
  projectId: string
  accountKey: string
  accountEmail: string
}): Promise<FirestoreConnectionInfo> {
  const refreshToken = await loadGoogleRefreshToken(input.accountKey)

  if (!refreshToken) {
    throw new Error('保存済みの Google トークンがありません。再サインインしてください。')
  }

  const oauth = await loadGoogleOAuthConfig()
  const info = await connectFirestoreWithGoogle({
    projectId: input.projectId,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    refreshToken,
    accountEmail: input.accountEmail
  })
  logFirestoreState('after connectGoogleProject')
  return info
}

export async function connectEmulator(input: {
  poolId: string
  projectId: string
  host: string
}): Promise<FirestoreConnectionInfo> {
  const host = parseEmulatorHost(input.host)
  const info = await connectFirestoreWithEmulator({
    poolId: input.poolId,
    projectId: input.projectId,
    host
  })
  logFirestoreState('after connectEmulator')
  return info
}
