import { writeFile } from 'fs/promises'
import { BrowserWindow, dialog } from 'electron'
import type { UpdateRequest, UserRecord } from 'firebase-admin/auth'
import { getAuth, isFirestoreConnected } from '@shared/firestore/client'
import { logError, logInfo } from '@shared/logging/logger'
import { ensureWritable } from '@features/workspace/main/guard'
import type {
  AuthUser,
  AuthUsersMutationSummary,
  AuthUsersResult,
  DeleteAuthUsersInput,
  ExportAuthUsersInput,
  ExportAuthUsersResult,
  ListAuthUsersInput,
  ListAuthUsersResult,
  SetAuthUsersDisabledInput,
  UpdateAuthUserInput
} from '@features/auth_users/shared/types'

const DEFAULT_PAGE_SIZE = 100
const DELETE_CHUNK = 1000

function toAuthUser(record: UserRecord): AuthUser {
  return {
    uid: record.uid,
    email: record.email ?? null,
    displayName: record.displayName ?? null,
    phoneNumber: record.phoneNumber ?? null,
    disabled: record.disabled,
    emailVerified: record.emailVerified,
    customClaims: (record.customClaims ?? {}) as Record<string, unknown>,
    creationTime: record.metadata.creationTime ?? null,
    lastSignInTime: record.metadata.lastSignInTime ?? null,
    providerIds: record.providerData.map((provider) => provider.providerId)
  }
}

function toError<T>(error: unknown): AuthUsersResult<T> {
  logError('auth_users', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Auth users operation failed'
  }
}

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`プロジェクトに接続されていません: ${projectId}`)
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || 'auth-users'
}

export async function listUsers(
  input: ListAuthUsersInput
): Promise<AuthUsersResult<ListAuthUsersResult>> {
  try {
    ensureConnected(input.projectId)
    const maxResults = Math.min(Math.max(input.maxResults ?? DEFAULT_PAGE_SIZE, 1), 1000)
    logInfo(
      'auth_users',
      `listUsers start projectId=${input.projectId} maxResults=${maxResults} pageToken=${input.pageToken ? 'yes' : 'no'}`
    )
    const auth = getAuth(input.projectId)
    const listed = await auth.listUsers(maxResults, input.pageToken)
    logInfo(
      'auth_users',
      `listUsers done projectId=${input.projectId} count=${listed.users.length} nextPage=${listed.pageToken ? 'yes' : 'no'}`
    )

    return {
      ok: true,
      data: {
        users: listed.users.map(toAuthUser),
        pageToken: listed.pageToken ?? null
      }
    }
  } catch (error) {
    return toError(error)
  }
}

export async function getUser(
  projectId: string,
  uid: string
): Promise<AuthUsersResult<AuthUser>> {
  try {
    ensureConnected(projectId)
    const record = await getAuth(projectId).getUser(uid)
    return { ok: true, data: toAuthUser(record) }
  } catch (error) {
    return toError(error)
  }
}

export async function updateUser(
  input: UpdateAuthUserInput
): Promise<AuthUsersResult<AuthUser>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const auth = getAuth(input.projectId)
    const patch: UpdateRequest = {}

    if (input.email !== undefined && input.email !== null && input.email !== '') {
      patch.email = input.email
    }
    if (input.password !== undefined && input.password.length > 0) {
      patch.password = input.password
    }
    if (input.phoneNumber !== undefined) {
      patch.phoneNumber =
        input.phoneNumber === null || input.phoneNumber === '' ? null : input.phoneNumber
    }
    if (input.displayName !== undefined) {
      patch.displayName =
        input.displayName === null || input.displayName === '' ? null : input.displayName
    }
    if (input.emailVerified !== undefined) {
      patch.emailVerified = input.emailVerified
    }
    if (input.disabled !== undefined) {
      patch.disabled = input.disabled
    }

    if (Object.keys(patch).length > 0) {
      await auth.updateUser(input.uid, patch)
    }

    if (input.customClaims !== undefined) {
      await auth.setCustomUserClaims(
        input.uid,
        input.customClaims === null ? null : input.customClaims
      )
    }

    const updated = await auth.getUser(input.uid)
    logInfo('auth_users', `updateUser projectId=${input.projectId} uid=${input.uid}`)
    return { ok: true, data: toAuthUser(updated) }
  } catch (error) {
    return toError(error)
  }
}

export async function setUsersDisabled(
  input: SetAuthUsersDisabledInput
): Promise<AuthUsersResult<AuthUsersMutationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const auth = getAuth(input.projectId)
    const errors: AuthUsersMutationSummary['errors'] = []
    let successCount = 0

    for (const uid of input.uids) {
      try {
        await auth.updateUser(uid, { disabled: input.disabled })
        successCount += 1
      } catch (error) {
        errors.push({
          uid,
          error: error instanceof Error ? error.message : 'update failed'
        })
      }
    }

    logInfo(
      'auth_users',
      `setUsersDisabled projectId=${input.projectId} disabled=${input.disabled} ok=${successCount} fail=${errors.length}`
    )

    return {
      ok: true,
      data: {
        successCount,
        failureCount: errors.length,
        errors
      }
    }
  } catch (error) {
    return toError(error)
  }
}

export async function deleteUsers(
  input: DeleteAuthUsersInput
): Promise<AuthUsersResult<AuthUsersMutationSummary>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const auth = getAuth(input.projectId)
    const errors: AuthUsersMutationSummary['errors'] = []
    let successCount = 0

    for (let index = 0; index < input.uids.length; index += DELETE_CHUNK) {
      const chunk = input.uids.slice(index, index + DELETE_CHUNK)
      const result = await auth.deleteUsers(chunk)
      successCount += result.successCount

      for (const failure of result.errors) {
        errors.push({
          uid: chunk[failure.index] ?? String(failure.index),
          error: failure.error.message
        })
      }
    }

    logInfo(
      'auth_users',
      `deleteUsers projectId=${input.projectId} ok=${successCount} fail=${errors.length}`
    )

    return {
      ok: true,
      data: {
        successCount,
        failureCount: errors.length,
        errors
      }
    }
  } catch (error) {
    return toError(error)
  }
}

async function collectUsersForExport(
  projectId: string,
  uids?: string[]
): Promise<AuthUser[]> {
  const auth = getAuth(projectId)

  if (uids && uids.length > 0) {
    const users: AuthUser[] = []
    for (const uid of uids) {
      const record = await auth.getUser(uid)
      users.push(toAuthUser(record))
    }
    return users
  }

  const users: AuthUser[] = []
  let pageToken: string | undefined

  do {
    const listed = await auth.listUsers(1000, pageToken)
    users.push(...listed.users.map(toAuthUser))
    pageToken = listed.pageToken
  } while (pageToken)

  return users
}

function usersToCsv(users: AuthUser[]): string {
  const header = [
    'uid',
    'email',
    'displayName',
    'phoneNumber',
    'disabled',
    'emailVerified',
    'customClaims',
    'creationTime',
    'lastSignInTime',
    'providerIds'
  ]

  const escape = (value: string): string => {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const rows = users.map((user) =>
    [
      user.uid,
      user.email ?? '',
      user.displayName ?? '',
      user.phoneNumber ?? '',
      String(user.disabled),
      String(user.emailVerified),
      JSON.stringify(user.customClaims),
      user.creationTime ?? '',
      user.lastSignInTime ?? '',
      user.providerIds.join('|')
    ]
      .map(escape)
      .join(',')
  )

  return [header.join(','), ...rows].join('\n')
}

export async function exportUsers(
  input: ExportAuthUsersInput,
  window: BrowserWindow | null
): Promise<AuthUsersResult<ExportAuthUsersResult>> {
  try {
    ensureConnected(input.projectId)
    const users = await collectUsersForExport(input.projectId, input.uids)

    if (users.length === 0) {
      throw new Error('エクスポート対象のユーザーがありません')
    }

    const content =
      input.format === 'json' ? `${JSON.stringify(users, null, 2)}\n` : usersToCsv(users)
    const defaultPath = `${sanitizeFileName(input.projectId)}-auth-users.${input.format}`
    const filters =
      input.format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }]

    const result = window
      ? await dialog.showSaveDialog(window, {
          title: 'Auth ユーザーのエクスポート先',
          defaultPath,
          filters
        })
      : await dialog.showSaveDialog({
          title: 'Auth ユーザーのエクスポート先',
          defaultPath,
          filters
        })

    if (result.canceled || !result.filePath) {
      return { ok: false, error: 'canceled' }
    }

    await writeFile(result.filePath, content, 'utf8')
    logInfo(
      'auth_users',
      `exportUsers projectId=${input.projectId} format=${input.format} count=${users.length}`
    )

    return {
      ok: true,
      data: {
        filePath: result.filePath,
        exportedCount: users.length
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'canceled') {
      return { ok: false, error: 'canceled' }
    }
    return toError(error)
  }
}
