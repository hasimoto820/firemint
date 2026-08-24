import {
  getConnectionInfo,
  getFirestore,
  getWriteBlockedReason,
  logFirestoreState
} from '@shared/firestore/client'
import { formatUnavailableFirestoreMessage } from '@shared/firestore/native_check'
import { logError, logInfo, logWarn } from '@shared/logging/logger'
import { detectEnvironment } from '@shared/safety/environment'
import {
  addEmulatorEntryAndLoad,
  addEntryAndLoad,
  addGoogleEntryAndLoad,
  getFocusedConnectionInfo,
  getWorkspaceEntry,
  importGoogleAccountProjects,
  unloadProject
} from '@features/workspace/main/service'
import { getFocusedProjectId } from '@shared/firestore/focused'
import type {
  ConnectResult,
  ConnectionStatus,
  EmulatorConnectInput,
  GoogleConnectAccountInput,
  GoogleConnectProjectInput,
  GoogleSignInResult
} from '@features/connection/shared/types'
import { loadGoogleOAuthConfig } from './google_oauth_config'
import {
  cancelGoogleOAuthLogin,
  GOOGLE_OAUTH_CANCELED_MESSAGE,
  listGoogleCloudProjects,
  runGoogleOAuthLogin
} from './google_oauth'
import { saveGoogleRefreshToken } from './google_token_store'

const CONNECT_TIMEOUT_MS = 30_000

function formatConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Connection failed'
  const unavailable = formatUnavailableFirestoreMessage(message)

  if (unavailable) {
    return unavailable
  }

  if (message.includes('unable to verify') || message.includes('UNABLE_TO_VERIFY')) {
    return 'SSL 証明書の検証に失敗しました。社内プロキシ環境の場合は config/extra_ca.pem に CA 証明書を置いてください。'
  }

  if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT')) {
    return 'ネットワークエラー。インターネット接続を確認してください。'
  }

  // API 未有効は gRPC code 7 / HTTP 403 扱いになることがあるので、汎用「権限なし」より先に判定する
  if (
    message.includes('Cloud Firestore API has not been used') ||
    message.includes('Firestore API has not been used') ||
    (message.includes('firestore.googleapis.com') && message.includes('disabled'))
  ) {
    return 'このプロジェクトで Cloud Firestore API が有効になっていません。'
  }

  // プロジェクト ID に含まれる "403"（例: colorpanda-19403）に誤反応しない
  if (
    message.includes('PERMISSION_DENIED') ||
    /\b403\b/.test(message) ||
    message.includes('Forbidden')
  ) {
    return '権限がありません。アカウントまたはサービスアカウントの権限を確認してください。'
  }

  if (message.includes('INVALID_ARGUMENT') || message.includes('Invalid service account')) {
    return 'JSON の形式が正しくありません。サービスアカウントキーか確認してください。'
  }

  if (message.includes('NOT_FOUND')) {
    return 'このプロジェクトに Firestore データベースがありません。'
  }

  if (message.includes('タイムアウト')) {
    return message
  }

  return message
}

function formatEmulatorError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('HOST:PORT') ||
    message.includes('host と projectId') ||
    message.includes('projectId を指定') ||
    message.includes('接続情報が不足')
  ) {
    return message
  }

  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ECONNRESET') ||
    message.includes('ENOTFOUND') ||
    message.includes('UNAVAILABLE') ||
    message.includes('タイムアウト') ||
    /timeout/i.test(message)
  ) {
    return 'Emulator に接続できません。HOST:PORT と起動状態を確認してください。'
  }

  return message
}

async function listRootCollectionsWithTimeout(projectId: string): Promise<string[]> {
  const unavailable = getWriteBlockedReason(projectId)

  if (unavailable) {
    logInfo('connection', `listCollections skipped: ${unavailable} projectId=${projectId}`)
    return []
  }
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
      rootCollections,
      authType: 'serviceAccount'
    }
  } catch (error) {
    logError('connection', `connect failed in ${Date.now() - startedAt}ms`, error)
    return {
      ok: false,
      error: formatConnectionError(error)
    }
  }
}

export function cancelGoogleSignIn(): void {
  cancelGoogleOAuthLogin()
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    const config = await loadGoogleOAuthConfig()
    const tokens = await runGoogleOAuthLogin(config)
    const accountKey = await saveGoogleRefreshToken(tokens.email, tokens.refreshToken)
    const projects = await listGoogleCloudProjects(tokens.accessToken)

    return {
      ok: true,
      accountKey,
      email: tokens.email,
      projects
    }
  } catch (error) {
    const message = formatConnectionError(error)
    if (error instanceof Error && error.message === GOOGLE_OAUTH_CANCELED_MESSAGE) {
      logInfo('connection', 'google sign-in canceled')
    } else {
      logError('connection', 'google sign-in failed', error)
    }
    return {
      ok: false,
      error: message
    }
  }
}

export async function connectWithGoogleProject(
  input: GoogleConnectProjectInput
): Promise<ConnectResult> {
  const startedAt = Date.now()
  logInfo(
    'connection',
    `google connect start project=${input.projectId} account=${input.accountEmail}`
  )

  try {
    const addResult = await addGoogleEntryAndLoad({
      projectId: input.projectId,
      accountKey: input.accountKey,
      accountEmail: input.accountEmail,
      setFocused: true
    })

    if (!addResult.ok) {
      return { ok: false, error: addResult.error }
    }

    const entry = addResult.data
    const rootCollections = await listRootCollectionsWithTimeout(entry.id)
    const environment = detectEnvironment(entry.id)
    const info = getConnectionInfo(entry.id)

    logInfo(
      'connection',
      `google connect success in ${Date.now() - startedAt}ms project_id=${entry.id}`
    )

    return {
      ok: true,
      projectId: entry.id,
      clientEmail: info?.clientEmail ?? input.accountEmail,
      environment,
      rootCollections,
      authType: 'google'
    }
  } catch (error) {
    logError('connection', `google connect failed in ${Date.now() - startedAt}ms`, error)
    return {
      ok: false,
      error: formatConnectionError(error)
    }
  }
}

export async function connectWithGoogleAccount(
  input: GoogleConnectAccountInput
): Promise<ConnectResult> {
  const startedAt = Date.now()
  logInfo(
    'connection',
    `google account import start account=${input.accountEmail} projects=${input.projects.length}`
  )

  try {
    const importResult = await importGoogleAccountProjects({
      accountKey: input.accountKey,
      accountEmail: input.accountEmail,
      projects: input.projects
    })

    if (!importResult.ok) {
      return { ok: false, error: importResult.error }
    }

    const focusedProjectId = importResult.data.focusedProjectId

    if (!focusedProjectId) {
      logInfo(
        'connection',
        `google account import registered=${importResult.data.count} but no project could be focused`
      )
      return {
        ok: false,
        error:
          'プロジェクトは一覧に登録しましたが、Firestore に接続できるものがありません。Firestore が有効なプロジェクトを一覧から選んでください。'
      }
    }

    const rootCollections = await listRootCollectionsWithTimeout(focusedProjectId)
    const environment = detectEnvironment(focusedProjectId)
    const info = getConnectionInfo(focusedProjectId)

    logInfo(
      'connection',
      `google account import success in ${Date.now() - startedAt}ms count=${importResult.data.count} focused=${focusedProjectId}`
    )

    return {
      ok: true,
      projectId: focusedProjectId,
      clientEmail: info?.clientEmail ?? input.accountEmail,
      environment,
      rootCollections,
      authType: 'google'
    }
  } catch (error) {
    logError('connection', `google account import failed in ${Date.now() - startedAt}ms`, error)
    return {
      ok: false,
      error: formatConnectionError(error)
    }
  }
}

export async function connectWithEmulator(input: EmulatorConnectInput): Promise<ConnectResult> {
  const startedAt = Date.now()
  logInfo('connection', `emulator connect start host=${input.host} project=${input.projectId}`)

  try {
    const addResult = await addEmulatorEntryAndLoad({
      projectId: input.projectId,
      host: input.host,
      setFocused: true
    })

    if (!addResult.ok) {
      return { ok: false, error: formatEmulatorError(new Error(addResult.error)) }
    }

    const entry = addResult.data
    const rootCollections = await listRootCollectionsWithTimeout(entry.id)
    const info = getConnectionInfo(entry.id)

    logInfo(
      'connection',
      `emulator connect success in ${Date.now() - startedAt}ms pool_id=${entry.id}`
    )

    return {
      ok: true,
      projectId: entry.id,
      clientEmail: info?.clientEmail ?? entry.emulatorHost ?? '',
      environment: 'development',
      rootCollections,
      authType: 'emulator'
    }
  } catch (error) {
    logError('connection', `emulator connect failed in ${Date.now() - startedAt}ms`, error)
    return {
      ok: false,
      error: formatEmulatorError(error)
    }
  }
}

export async function disconnectFromFirestore(): Promise<void> {
  const projectId = getFocusedProjectId()
  const focused = projectId ? getWorkspaceEntry(projectId) : null
  logInfo(
    'connection',
    `disconnect start projectId=${projectId ?? 'none'} authType=${focused?.authType ?? 'none'}`
  )

  if (!projectId) {
    logInfo('connection', 'disconnect skipped: no focused project')
    return
  }

  const unloadResult = await unloadProject(projectId)

  if (!unloadResult.ok) {
    throw new Error(unloadResult.error)
  }

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
    environment:
      focused.entry?.authType === 'emulator' || focused.info.authType === 'emulator'
        ? 'development'
        : detectEnvironment(focused.projectId),
    readOnly: focused.entry?.readOnly ?? false,
    authType: focused.info.authType ?? focused.entry?.authType,
    writeBlockedReason: getWriteBlockedReason(focused.projectId)
  }
}
