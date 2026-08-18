import { readFile } from 'fs/promises'
import {
  connectFirestore,
  connectFirestoreWithGoogle,
  logFirestoreState
} from '@shared/firestore/client'
import type { FirestoreConnectionInfo } from '@shared/firestore/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import { loadGoogleOAuthConfig } from './google_oauth_config'
import { loadGoogleRefreshToken } from './google_token_store'

/**
 * 繋ぎ方の実行。名簿（workspace）はここを呼ぶだけで、token も JSON も読まない。
 * Emulator を足すときは、この関数の分岐に 3 本目を置く。
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
