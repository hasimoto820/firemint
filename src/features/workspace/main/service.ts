import { readFile } from 'fs/promises'
import {
  connectFirestore,
  connectFirestoreWithGoogle,
  disconnectFirestore,
  getConnectionInfo,
  isFirestoreConnected,
  listConnectedProjectIds,
  logFirestoreState
} from '@shared/firestore/client'
import { getFocusedProjectId, setFocusedProjectId } from '@shared/firestore/focused'
import { logError } from '@shared/logging/logger'
import { loadGoogleOAuthConfig } from '@features/connection/main/google_oauth_config'
import {
  loadGoogleAccountProfile,
  patchGoogleProjectProfile,
  saveGoogleAccountProfile
} from '@features/connection/main/google_profile_store'
import {
  loadGoogleRefreshToken,
  removeGoogleRefreshToken
} from '@features/connection/main/google_token_store'
import { loadWorkspaceStore, saveWorkspaceStore } from './store'
import type {
  AddGoogleWorkspaceEntryInput,
  AddWorkspaceEntryInput,
  SetFocusedProjectOptions,
  UpdateWorkspaceEntryInput,
  WorkspaceEntry,
  WorkspaceResult,
  WorkspaceState,
  WorkspaceStore
} from '@features/workspace/shared/types'

const DEFAULT_ENTRY_COLOR = '#607D8B'

let store: WorkspaceStore = {
  version: 1,
  entries: [],
  focusedProjectId: null
}

function toWorkspaceError<T>(error: unknown): WorkspaceResult<T> {
  logError('workspace', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Workspace operation failed'
  }
}

function syncFocusedFromStore(): void {
  setFocusedProjectId(store.focusedProjectId)
}

async function persistStore(): Promise<void> {
  await saveWorkspaceStore(store)
}

export function getWorkspaceEntry(projectId: string): WorkspaceEntry | null {
  return store.entries.find((entry) => entry.id === projectId) ?? null
}

export function getWorkspaceState(): WorkspaceState {
  return {
    entries: store.entries.map((entry) => ({ ...entry })),
    focusedProjectId: store.focusedProjectId,
    loadedProjectIds: listConnectedProjectIds()
  }
}

function upsertEntry(entry: WorkspaceEntry): void {
  store.entries = store.entries.filter((item) => item.id !== entry.id)
  store.entries.push(entry)
}

async function connectFromServiceAccountPath(
  serviceAccountPath: string,
  existing?: WorkspaceEntry | null
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const json = await readFile(serviceAccountPath, 'utf-8')
    const info = await connectFirestore(json)
    logFirestoreState('after connectFromServiceAccountPath')

    const entry: WorkspaceEntry = {
      id: info.projectId,
      label: existing?.label ?? info.projectId,
      color: existing?.color ?? DEFAULT_ENTRY_COLOR,
      authType: 'serviceAccount',
      serviceAccountPath,
      readOnly: existing?.readOnly ?? false
    }

    upsertEntry(entry)
    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

async function connectFromGoogleEntry(
  entry: WorkspaceEntry
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    if (!entry.googleAccountKey || !entry.googleAccountEmail) {
      throw new Error('Google 接続情報が不足しています。再サインインしてください。')
    }

    const refreshToken = await loadGoogleRefreshToken(entry.googleAccountKey)

    if (!refreshToken) {
      throw new Error('保存済みの Google トークンがありません。再サインインしてください。')
    }

    const oauth = await loadGoogleOAuthConfig()
    await connectFirestoreWithGoogle({
      projectId: entry.id,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      refreshToken,
      accountEmail: entry.googleAccountEmail
    })
    logFirestoreState('after connectFromGoogleEntry')

    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

async function connectWorkspaceEntry(entry: WorkspaceEntry): Promise<WorkspaceResult<WorkspaceEntry>> {
  if (entry.authType === 'google') {
    return connectFromGoogleEntry(entry)
  }

  if (!entry.serviceAccountPath) {
    return { ok: false, error: 'サービスアカウント path がありません' }
  }

  return connectFromServiceAccountPath(entry.serviceAccountPath, entry)
}

export async function initializeWorkspace(): Promise<void> {
  store = await loadWorkspaceStore()
  syncFocusedFromStore()

  if (!store.focusedProjectId) {
    return
  }

  const entry = getWorkspaceEntry(store.focusedProjectId)

  if (!entry) {
    store.focusedProjectId = null
    syncFocusedFromStore()
    await persistStore()
    return
  }

  const result = await connectWorkspaceEntry(entry)

  if (!result.ok) {
    logError('workspace', `auto reconnect failed project_id=${entry.id}`, result.error)
  }
}

export async function addEntryAndLoad(
  input: AddWorkspaceEntryInput
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const result = await connectFromServiceAccountPath(input.serviceAccountPath)

    if (!result.ok) {
      return result
    }

    const entry: WorkspaceEntry = {
      ...result.data,
      label: input.label?.trim() || result.data.label,
      color: input.color ?? result.data.color,
      readOnly: input.readOnly ?? result.data.readOnly
    }

    upsertEntry(entry)

    if (input.setFocused ?? true) {
      store.focusedProjectId = entry.id
      syncFocusedFromStore()
    }

    await persistStore()
    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

export async function addGoogleEntryAndLoad(
  input: AddGoogleWorkspaceEntryInput
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const existing = getWorkspaceEntry(input.projectId)
    const oauth = await loadGoogleOAuthConfig()
    const refreshToken = await loadGoogleRefreshToken(input.accountKey)

    if (!refreshToken) {
      throw new Error('Google トークンがありません。先にサインインしてください。')
    }

    await connectFirestoreWithGoogle({
      projectId: input.projectId,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      refreshToken,
      accountEmail: input.accountEmail
    })
    logFirestoreState('after addGoogleEntryAndLoad')

    const entry: WorkspaceEntry = {
      id: input.projectId,
      label: input.label?.trim() || existing?.label || input.projectId,
      color: input.color ?? existing?.color ?? DEFAULT_ENTRY_COLOR,
      authType: 'google',
      serviceAccountPath: '',
      googleAccountEmail: input.accountEmail,
      googleAccountKey: input.accountKey,
      readOnly: input.readOnly ?? existing?.readOnly ?? false
    }

    upsertEntry(entry)

    if (input.setFocused ?? true) {
      store.focusedProjectId = entry.id
      syncFocusedFromStore()
    }

    await persistStore()

    await patchGoogleProjectProfile(input.accountKey, input.accountEmail, entry.id, {
      label: entry.label,
      color: entry.color,
      readOnly: entry.readOnly,
      lastFocused: input.setFocused ?? true
    })

    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

export async function loadProject(projectId: string): Promise<WorkspaceResult<WorkspaceEntry>> {
  const entry = getWorkspaceEntry(projectId)

  if (!entry) {
    return { ok: false, error: 'プロジェクトが登録されていません' }
  }

  if (isFirestoreConnected(projectId)) {
    return { ok: true, data: entry }
  }

  const result = await connectWorkspaceEntry(entry)

  if (!result.ok) {
    return result
  }

  await persistStore()
  return { ok: true, data: entry }
}

export async function unloadProject(projectId: string): Promise<WorkspaceResult<null>> {
  try {
    await disconnectFirestore(projectId)

    if (store.focusedProjectId === projectId) {
      store.focusedProjectId = null
      syncFocusedFromStore()
    }

    await persistStore()
    return { ok: true, data: null }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

/**
 * Google アカウントの接続だけ切る（クラウド削除ではない）。
 * 名簿・token・プロファイルは残し、リストから再接続できる状態にする。
 */
export async function unloadGoogleAccountConnections(
  accountKey?: string
): Promise<WorkspaceResult<{ unloadedProjectIds: string[] }>> {
  try {
    const targets = store.entries.filter((entry) => {
      if (entry.authType !== 'google') {
        return false
      }

      if (!accountKey) {
        return true
      }

      return entry.googleAccountKey === accountKey
    })

    if (targets.length === 0) {
      return { ok: true, data: { unloadedProjectIds: [] } }
    }

    const byAccount = new Map<string, typeof targets>()

    for (const entry of targets) {
      const key = entry.googleAccountKey

      if (!key) {
        continue
      }

      const list = byAccount.get(key) ?? []
      list.push(entry)
      byAccount.set(key, list)
    }

    for (const [key, entries] of byAccount) {
      const projects: Record<string, { label: string; color: string; readOnly: boolean }> = {}

      for (const entry of entries) {
        projects[entry.id] = {
          label: entry.label,
          color: entry.color,
          readOnly: entry.readOnly
        }
      }

      await saveGoogleAccountProfile(key, {
        email: entries[0]?.googleAccountEmail ?? key,
        lastFocusedProjectId:
          store.focusedProjectId && projects[store.focusedProjectId]
            ? store.focusedProjectId
            : null,
        projects
      })
    }

    const unloadedProjectIds: string[] = []

    for (const entry of targets) {
      if (isFirestoreConnected(entry.id)) {
        await disconnectFirestore(entry.id)
        unloadedProjectIds.push(entry.id)
      }
    }

    const targetIds = new Set(targets.map((entry) => entry.id))

    if (store.focusedProjectId && targetIds.has(store.focusedProjectId)) {
      store.focusedProjectId = null
      syncFocusedFromStore()
    }

    await persistStore()

    return { ok: true, data: { unloadedProjectIds } }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

/**
 * Google アカウントのプロジェクトを一括で取扱い名簿へ載せ、接続もできるだけ開く。
 * 以前のプロファイル（label / color / readOnly / lastFocused）があれば復元する。
 */
export async function importGoogleAccountProjects(input: {
  accountKey: string
  accountEmail: string
  projects: Array<{ projectId: string; displayName: string }>
}): Promise<WorkspaceResult<{ focusedProjectId: string | null; count: number }>> {
  try {
    if (input.projects.length === 0) {
      return { ok: false, error: '取り込めるプロジェクトがありません' }
    }

    const profile = await loadGoogleAccountProfile(input.accountKey)
    const refreshToken = await loadGoogleRefreshToken(input.accountKey)

    if (!refreshToken) {
      throw new Error('Google トークンがありません。先にサインインしてください。')
    }

    // 同じアカウントの古い取扱い分はいったん外す（プロファイルは import で上書き復元）
    store.entries = store.entries.filter(
      (entry) =>
        !(entry.authType === 'google' && entry.googleAccountKey === input.accountKey)
    )

    for (const project of input.projects) {
      const pref = profile?.projects[project.projectId]
      const entry: WorkspaceEntry = {
        id: project.projectId,
        label: pref?.label?.trim() || project.displayName || project.projectId,
        color: pref?.color ?? DEFAULT_ENTRY_COLOR,
        authType: 'google',
        serviceAccountPath: '',
        googleAccountEmail: input.accountEmail,
        googleAccountKey: input.accountKey,
        readOnly: pref?.readOnly ?? false
      }
      upsertEntry(entry)
    }

    const preferredFocus =
      (profile?.lastFocusedProjectId &&
      input.projects.some((project) => project.projectId === profile.lastFocusedProjectId)
        ? profile.lastFocusedProjectId
        : null) ?? input.projects[0]?.projectId ?? null

    await persistStore()

    // 一括で開く: 権限のあるプロジェクトをできるだけ接続プールへ載せる
    for (const project of input.projects) {
      const loadResult = await loadProject(project.projectId)

      if (!loadResult.ok) {
        logError(
          'workspace',
          `google bulk load skipped project=${project.projectId}: ${loadResult.error}`
        )
      }
    }

    if (!preferredFocus) {
      return { ok: true, data: { focusedProjectId: null, count: input.projects.length } }
    }

    const focusCandidates = [
      preferredFocus,
      ...input.projects.map((project) => project.projectId).filter((id) => id !== preferredFocus)
    ]

    for (const candidateId of focusCandidates) {
      if (!isFirestoreConnected(candidateId)) {
        continue
      }

      const focusResult = await setFocusedProject(candidateId)

      if (focusResult.ok) {
        await patchGoogleProjectProfile(input.accountKey, input.accountEmail, candidateId, {
          lastFocused: true
        })
        return {
          ok: true,
          data: { focusedProjectId: candidateId, count: input.projects.length }
        }
      }
    }

    store.focusedProjectId = null
    syncFocusedFromStore()
    await persistStore()
    return {
      ok: true,
      data: { focusedProjectId: null, count: input.projects.length }
    }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

export async function removeEntry(projectId: string): Promise<WorkspaceResult<null>> {
  try {
    const entry = getWorkspaceEntry(projectId)

    if (isFirestoreConnected(projectId)) {
      await disconnectFirestore(projectId)
    }

    store.entries = store.entries.filter((item) => item.id !== projectId)

    if (store.focusedProjectId === projectId) {
      store.focusedProjectId = null
      syncFocusedFromStore()
    }

    await persistStore()

    if (entry?.authType === 'google' && entry.googleAccountKey) {
      const stillUsed = store.entries.some(
        (item) => item.authType === 'google' && item.googleAccountKey === entry.googleAccountKey
      )

      if (!stillUsed) {
        await removeGoogleRefreshToken(entry.googleAccountKey)
      }
    }

    return { ok: true, data: null }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

export async function updateEntry(
  projectId: string,
  input: UpdateWorkspaceEntryInput
): Promise<WorkspaceResult<WorkspaceEntry>> {
  const entry = getWorkspaceEntry(projectId)

  if (!entry) {
    return { ok: false, error: 'プロジェクトが登録されていません' }
  }

  const updated: WorkspaceEntry = {
    ...entry,
    label: input.label?.trim() || entry.label,
    color: input.color ?? entry.color,
    readOnly: input.readOnly ?? entry.readOnly
  }

  store.entries = store.entries.map((item) => (item.id === projectId ? updated : item))
  await persistStore()

  if (updated.authType === 'google' && updated.googleAccountKey) {
    await patchGoogleProjectProfile(
      updated.googleAccountKey,
      updated.googleAccountEmail ?? updated.googleAccountKey,
      updated.id,
      {
        label: updated.label,
        color: updated.color,
        readOnly: updated.readOnly
      }
    )
  }

  return { ok: true, data: updated }
}

export async function setFocusedProject(
  projectId: string,
  options?: SetFocusedProjectOptions
): Promise<WorkspaceResult<WorkspaceEntry>> {
  const entry = getWorkspaceEntry(projectId)

  if (!entry) {
    return { ok: false, error: 'プロジェクトが登録されていません' }
  }

  if (options?.exclusive) {
    for (const loadedId of listConnectedProjectIds()) {
      if (loadedId !== projectId) {
        await disconnectFirestore(loadedId)
      }
    }
  }

  if (!isFirestoreConnected(projectId)) {
    const loadResult = await loadProject(projectId)

    if (!loadResult.ok) {
      return loadResult
    }
  }

  store.focusedProjectId = projectId
  syncFocusedFromStore()
  await persistStore()

  if (entry.authType === 'google' && entry.googleAccountKey) {
    await patchGoogleProjectProfile(
      entry.googleAccountKey,
      entry.googleAccountEmail ?? entry.googleAccountKey,
      projectId,
      { lastFocused: true }
    )
  }

  return { ok: true, data: entry }
}

export function getFocusedConnectionInfo() {
  const projectId = getFocusedProjectId()

  if (!projectId || !isFirestoreConnected(projectId)) {
    return null
  }

  return {
    projectId,
    info: getConnectionInfo(projectId),
    entry: getWorkspaceEntry(projectId)
  }
}
