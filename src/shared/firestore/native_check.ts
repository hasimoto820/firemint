import { logInfo, logWarn } from '@shared/logging/logger'

const PROBE_TIMEOUT_MS = 10_000

export const NATIVE_FIRESTORE_DATASTORE_MESSAGE =
  'このプロジェクトの Firestore は Datastore モードです。Native Firestore ではないため使えません。'

export const NATIVE_FIRESTORE_MISSING_MESSAGE =
  'このプロジェクトに Firestore データベースがありません。'

export function formatUnavailableFirestoreMessage(message: string): string | null {
  if (
    message.includes('Datastore Mode') ||
    message.includes('Firestore in Datastore Mode')
  ) {
    return NATIVE_FIRESTORE_DATASTORE_MESSAGE
  }

  if (
    message.includes('does not exist for project') ||
    message.includes('Database not found') ||
    message.includes('datastore/setup')
  ) {
    return NATIVE_FIRESTORE_MISSING_MESSAGE
  }

  return null
}

type DatabaseResource = {
  type?: string
}

/**
 * (default) が Native Firestore か見る。権限不足や通信失敗では止めない。
 */
export async function probeWriteBlockedReason(input: {
  projectId: string
  getAccessToken: () => Promise<string | null>
}): Promise<string | null> {
  let accessToken: string | null

  try {
    accessToken = await input.getAccessToken()
  } catch (error) {
    logWarn('firestore', `native probe token failed project_id=${input.projectId}`, error)
    return null
  }

  if (!accessToken || accessToken === 'owner') {
    return null
  }

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(input.projectId)}/databases/${encodeURIComponent('(default)')}`

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })

    if (response.status === 404) {
      logInfo('firestore', `native probe: database missing project_id=${input.projectId}`)
      return NATIVE_FIRESTORE_MISSING_MESSAGE
    }

    if (response.status === 401 || response.status === 403) {
      logWarn(
        'firestore',
        `native probe: permission denied status=${response.status} project_id=${input.projectId}`
      )
      return null
    }

    if (!response.ok) {
      logWarn(
        'firestore',
        `native probe: unexpected status=${response.status} project_id=${input.projectId}`
      )
      return null
    }

    const body = (await response.json()) as DatabaseResource

    if (body.type === 'DATASTORE_MODE') {
      logInfo('firestore', `native probe: DATASTORE_MODE project_id=${input.projectId}`)
      return NATIVE_FIRESTORE_DATASTORE_MESSAGE
    }

    logInfo(
      'firestore',
      `native probe: type=${body.type ?? 'unknown'} project_id=${input.projectId}`
    )
    return null
  } catch (error) {
    logWarn('firestore', `native probe failed project_id=${input.projectId}`, error)
    return null
  }
}
