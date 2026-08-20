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
import { emulatorEntryId, parseEmulatorHost, resolveEmulatorProjectId, EMPTY_EMULATOR_PROJECT_ID } from '@features/connection/shared/emulator'
import {
  forgetGoogleToken,
  loadGoogleAccountProfile,
  rememberGoogleProjectProfile,
  saveGoogleAccountProfile
} from '@features/connection/main/google_account'
import { loadWorkspaceStore, saveWorkspaceStore } from './store'
import {
  defaultWorkspaceEntryColor,
  type AddEmulatorWorkspaceEntryInput,
  type AddGoogleWorkspaceEntryInput,
  type AddWorkspaceEntryInput,
  type SetFocusedProjectOptions,
  type UpdateWorkspaceEntryInput,
  type WorkspaceEntry,
  type WorkspaceResult,
  type WorkspaceState,
  type WorkspaceStore
} from '@features/workspace/shared/types'

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
  const index = store.entries.findIndex((item) => item.id === entry.id)

  if (index >= 0) {
    store.entries = store.entries.map((item) => (item.id === entry.id ? entry : item))
    return
  }

  store.entries.push(entry)
}

function emptyEmulatorOnHost(host: string): WorkspaceEntry | null {
  const emptyId = emulatorEntryId(EMPTY_EMULATOR_PROJECT_ID)
  const empty = getWorkspaceEntry(emptyId)

  if (!empty || empty.authType !== 'emulator') {
    return null
  }

  if (!empty.emulatorHost) {
    return empty
  }

  try {
    return parseEmulatorHost(empty.emulatorHost) === host ? empty : null
  } catch {
    return null
  }
}

/** 同じホストの空の入れ物を、今回の projectId の行にする。別行は足さない。 */
async function adoptEmptyEmulatorContainer(
  host: string,
  next: {
    id: string
    emulatorProjectId: string
    label?: string
    color?: string
    readOnly?: boolean
  }
): Promise<WorkspaceEntry | null> {
  const empty = emptyEmulatorOnHost(host)

  if (!empty) {
    return null
  }

  if (empty.id === next.id) {
    return empty
  }

  const taken = getWorkspaceEntry(next.id)

  if (isFirestoreConnected(empty.id)) {
    await disconnectFirestore(empty.id)
  }

  if (taken) {
    store.entries = store.entries.filter((item) => item.id !== empty.id)

    if (store.focusedProjectId === empty.id) {
      store.focusedProjectId = taken.id
      syncFocusedFromStore()
    }

    return taken
  }

  const adopted: WorkspaceEntry = {
    ...empty,
    id: next.id,
    emulatorHost: host,
    emulatorProjectId: next.emulatorProjectId,
    label: next.label?.trim() || `${next.emulatorProjectId} emulator`,
    color: defaultWorkspaceEntryColor('emulator', {
      existing: empty.color,
      override: next.color
    }),
    readOnly: next.readOnly ?? empty.readOnly
  }

  store.entries = store.entries.map((item) => (item.id === empty.id ? adopted : item))

  if (store.focusedProjectId === empty.id) {
    store.focusedProjectId = adopted.id
    syncFocusedFromStore()
  }

  return adopted
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
      color: defaultWorkspaceEntryColor('serviceAccount', {
        existing: existing?.color,
        override: input.color
      }),
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
      color: defaultWorkspaceEntryColor('google', {
        existing: existing?.color,
        override: input.color
      }),
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

    if (emulatorProjectId !== EMPTY_EMULATOR_PROJECT_ID) {
      await adoptEmptyEmulatorContainer(host, {
        id,
        emulatorProjectId,
        label: input.label,
        color: input.color,
        readOnly: input.readOnly
      })
    }

    const existing = getWorkspaceEntry(id)

    await connectEmulator({
      poolId: id,
      projectId: emulatorProjectId,
      host
    })

    const entry: WorkspaceEntry = {
      id,
      label:
        input.label?.trim() ||
        existing?.label ||
        (emulatorProjectId === EMPTY_EMULATOR_PROJECT_ID ? 'emulator' : `${emulatorProjectId} emulator`),
      color: defaultWorkspaceEntryColor('emulator', {
        existing: existing?.color,
        override: input.color
      }),
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
        color: defaultWorkspaceEntryColor('google', { existing: pref?.color }),
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
