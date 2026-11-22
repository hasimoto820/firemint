import { tr } from '@shared/i18n/shared/current'
import { logInfo, logWarn } from '@shared/logging/logger'

const PROBE_TIMEOUT_MS = 10_000

export function formatUnavailableFirestoreMessage(message: string): string | null {
  if (message.includes('Datastore Mode') || message.includes('Firestore in Datastore Mode')) {
    return tr('ui.native_datastore')
  }

  if (
    message.includes('does not exist for project') ||
    message.includes('Database not found') ||
    message.includes('datastore/setup')
  ) {
    return tr('ui.native_missing')
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
      return tr('ui.native_missing')
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
      return tr('ui.native_datastore')
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
