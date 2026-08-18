import {
  disconnectFirestore,
  getConnectionInfo,
  isFirestoreConnected,
  listConnectedProjectIds
} from '@shared/firestore/client'
import { getFocusedProjectId, setFocusedProjectId } from '@shared/firestore/focused'
import { logError } from '@shared/logging/logger'
import {
  connectEmulator,
  connectGoogleProject,
  connectServiceAccountFile,
  connectWorkspaceEntry
} from '@features/connection/main/connect_entry'
import { emulatorEntryId, parseEmulatorHost, resolveEmulatorProjectId } from '@features/connection/shared/emulator'
import {
  forgetGoogleToken,
  loadGoogleAccountProfile,
  rememberGoogleProjectProfile,
  saveGoogleAccountProfile
} from '@features/connection/main/google_account'
import { loadWorkspaceStore, saveWorkspaceStore } from './store'
import type {
  AddEmulatorWorkspaceEntryInput,
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
  focusedProjectId: null,
  loadedProjectIds: []
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
  store.loadedProjectIds = listConnectedProjectIds()
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

async function ensureConnected(entry: WorkspaceEntry): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    await connectWorkspaceEntry(entry)
    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
}

export async function initializeWorkspace(): Promise<void> {
  store = await loadWorkspaceStore()

  const restoreIds = [
    ...new Set(
      [
        ...store.loadedProjectIds,
        ...(store.focusedProjectId ? [store.focusedProjectId] : [])
      ].filter((projectId) => getWorkspaceEntry(projectId))
    )
  ]

  if (store.focusedProjectId && !getWorkspaceEntry(store.focusedProjectId)) {
    store.focusedProjectId = null
  }

  syncFocusedFromStore()

  for (const projectId of restoreIds) {
    const entry = getWorkspaceEntry(projectId)

    if (!entry) {
      continue
    }

    const result = await ensureConnected(entry)

    if (!result.ok) {
      logError('workspace', `auto reconnect failed project_id=${entry.id}`, result.error)
    }
  }

  if (store.focusedProjectId && !isFirestoreConnected(store.focusedProjectId)) {
    store.focusedProjectId = listConnectedProjectIds()[0] ?? null
    syncFocusedFromStore()
  }

  await persistStore()
}

export async function addEntryAndLoad(
  input: AddWorkspaceEntryInput
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const info = await connectServiceAccountFile(input.serviceAccountPath)
    const existing = getWorkspaceEntry(info.projectId)
    const entry: WorkspaceEntry = {
      id: info.projectId,
      label: input.label?.trim() || existing?.label || info.projectId,
      color: input.color ?? existing?.color ?? DEFAULT_ENTRY_COLOR,
      authType: 'serviceAccount',
      serviceAccountPath: input.serviceAccountPath,
      readOnly: input.readOnly ?? existing?.readOnly ?? false
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
    await connectGoogleProject({
      projectId: input.projectId,
      accountKey: input.accountKey,
      accountEmail: input.accountEmail
    })

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

    await rememberGoogleProjectProfile(input.accountKey, input.accountEmail, entry.id, {
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

export async function addEmulatorEntryAndLoad(
  input: AddEmulatorWorkspaceEntryInput
): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const emulatorProjectId = resolveEmulatorProjectId(input.projectId)
    const host = parseEmulatorHost(input.host)
    const id = emulatorEntryId(emulatorProjectId)
    const existing = getWorkspaceEntry(id)

    await connectEmulator({
      poolId: id,
      projectId: emulatorProjectId,
      host
    })

    const entry: WorkspaceEntry = {
      id,
      label: input.label?.trim() || existing?.label || `${emulatorProjectId} emulator`,
      color: input.color ?? existing?.color ?? DEFAULT_ENTRY_COLOR,
      authType: 'emulator',
      serviceAccountPath: '',
      emulatorHost: host,
      emulatorProjectId,
      readOnly: input.readOnly ?? existing?.readOnly ?? false
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

export async function loadProject(projectId: string): Promise<WorkspaceResult<WorkspaceEntry>> {
  const entry = getWorkspaceEntry(projectId)

  if (!entry) {
    return { ok: false, error: 'プロジェクトが登録されていません' }
  }

  if (isFirestoreConnected(projectId)) {
    return { ok: true, data: entry }
  }

  const result = await ensureConnected(entry)

  if (!result.ok) {
    return result
  }

  await persistStore()
  return { ok: true, data: entry }
}

function refocusAfterUnload(unloadedProjectId: string): void {
  if (store.focusedProjectId !== unloadedProjectId) {
    return
  }

  store.focusedProjectId = listConnectedProjectIds()[0] ?? null
  syncFocusedFromStore()
}

export async function unloadProject(projectId: string): Promise<WorkspaceResult<null>> {
  try {
    await disconnectFirestore(projectId)
    refocusAfterUnload(projectId)
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

    // 同じアカウントの古い取扱い分はいったん外す（プロファイルは import で上書き復元）
    // 接続そのものは loadProject → connection.connectWorkspaceEntry に任せる。
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
        await rememberGoogleProjectProfile(input.accountKey, input.accountEmail, candidateId, {
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
    refocusAfterUnload(projectId)
    await persistStore()

    if (entry?.authType === 'google' && entry.googleAccountKey) {
      const stillUsed = store.entries.some(
        (item) => item.authType === 'google' && item.googleAccountKey === entry.googleAccountKey
      )

      if (!stillUsed) {
        await forgetGoogleToken(entry.googleAccountKey)
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
    await rememberGoogleProjectProfile(
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
    await rememberGoogleProjectProfile(
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
