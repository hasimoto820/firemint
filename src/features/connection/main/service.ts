import { getConnectionInfo, getFirestore, logFirestoreState } from '@shared/firestore/client'
import { logError, logInfo, logWarn } from '@shared/logging/logger'
import { detectEnvironment } from '@shared/safety/environment'
import {
  addEntryAndLoad,
  getFocusedConnectionInfo,
  unloadProject
} from '@features/workspace/main/service'
import { getFocusedProjectId } from '@shared/firestore/focused'
import type { ConnectResult, ConnectionStatus } from '@features/connection/shared/types'

const CONNECT_TIMEOUT_MS = 30_000

function formatConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Connection failed'

  if (message.includes('unable to verify') || message.includes('UNABLE_TO_VERIFY')) {
    return 'SSL 証明書の検証に失敗しました。社内プロキシ環境の場合は config/extra_ca.pem に CA 証明書を置いてください。'
  }

  if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT')) {
    return 'ネットワークエラー。インターネット接続を確認してください。'
  }

  if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
    return '権限がありません。サービスアカウントに Firestore 読み取り権限があるか確認してください。'
  }

  if (message.includes('INVALID_ARGUMENT') || message.includes('Invalid service account')) {
    return 'JSON の形式が正しくありません。サービスアカウントキーか確認してください。'
  }

  if (message.includes('NOT_FOUND') || message.includes('Firestore API has not been used')) {
    return 'Firestore が有効化されていない可能性があります。Firebase Console で Firestore を作成してください。'
  }

  if (message.includes('タイムアウト')) {
    return message
  }

  return message
}

async function listRootCollectionsWithTimeout(projectId: string): Promise<string[]> {
  logInfo('connection', `listCollections start projectId=${projectId} timeout=${CONNECT_TIMEOUT_MS}ms`)
  const startedAt = Date.now()

  const collectionsPromise = getFirestore(projectId)
    .listCollections()
    .then((collections) => {
      const names = collections.map((collection) => collection.id)
      logInfo(
        'connection',
        `listCollections success in ${Date.now() - startedAt}ms count=${names.length}`,
        names
      )
      return names
    })
    .catch((error: unknown) => {
      logError('connection', `listCollections failed in ${Date.now() - startedAt}ms`, error)
      throw error
    })

  const timeoutPromise = new Promise<string[]>((_, reject) => {
    setTimeout(() => {
      logWarn(
        'connection',
        `listCollections timeout after ${CONNECT_TIMEOUT_MS}ms (elapsed=${Date.now() - startedAt}ms)`
      )
      reject(new Error('接続がタイムアウトしました。Firestore の有効化とネットワークを確認してください。'))
    }, CONNECT_TIMEOUT_MS)
  })

  return Promise.race([collectionsPromise, timeoutPromise])
}

export async function connectWithServiceAccountFile(filePath: string): Promise<ConnectResult> {
  const startedAt = Date.now()
  logInfo('connection', `connect start file=${filePath}`)

  try {
    const addResult = await addEntryAndLoad({
      serviceAccountPath: filePath,
      setFocused: true
    })

    if (!addResult.ok) {
      return { ok: false, error: addResult.error }
    }

    const entry = addResult.data
    logFirestoreState('after initializeApp')

    const rootCollections = await listRootCollectionsWithTimeout(entry.id)
    const environment = detectEnvironment(entry.id)

    logInfo(
      'connection',
      `connect success in ${Date.now() - startedAt}ms project_id=${entry.id} collections=${rootCollections.length}`
    )

    const info = getConnectionInfo(entry.id)

    return {
      ok: true,
      projectId: entry.id,
      clientEmail: info?.clientEmail ?? '',
      environment,
      rootCollections
    }
  } catch (error) {
    logError('connection', `connect failed in ${Date.now() - startedAt}ms`, error)
    return {
      ok: false,
      error: formatConnectionError(error)
    }
  }
}

export async function disconnectFromFirestore(): Promise<void> {
  const projectId = getFocusedProjectId()
  logInfo('connection', `disconnect start projectId=${projectId ?? 'none'}`)

  if (!projectId) {
    return
  }

  await unloadProject(projectId)
  logInfo('connection', 'disconnect done')
}

export function getConnectionStatus(): ConnectionStatus | null {
  const focused = getFocusedConnectionInfo()

  if (!focused?.info) {
    return null
  }

  return {
    projectId: focused.projectId,
    clientEmail: focused.info.clientEmail,
    environment: detectEnvironment(focused.projectId),
    readOnly: focused.entry?.readOnly ?? false
  }
}
