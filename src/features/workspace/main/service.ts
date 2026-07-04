import { readFile } from 'fs/promises'
import {
  connectFirestore,
  disconnectFirestore,
  getConnectionInfo,
  isFirestoreConnected,
  listConnectedProjectIds,
  logFirestoreState
} from '@shared/firestore/client'
import { getFocusedProjectId, setFocusedProjectId } from '@shared/firestore/focused'
import { logError } from '@shared/logging/logger'
import { loadWorkspaceStore, saveWorkspaceStore } from './store'
import type {
  AddWorkspaceEntryInput,
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

async function connectFromServiceAccountPath(serviceAccountPath: string): Promise<WorkspaceResult<WorkspaceEntry>> {
  try {
    const json = await readFile(serviceAccountPath, 'utf-8')
    const info = await connectFirestore(json)
    logFirestoreState('after connectFromServiceAccountPath')

    const existing = getWorkspaceEntry(info.projectId)

    const entry: WorkspaceEntry = {
      id: info.projectId,
      label: existing?.label ?? info.projectId,
      color: existing?.color ?? DEFAULT_ENTRY_COLOR,
      serviceAccountPath,
      readOnly: existing?.readOnly ?? false
    }

    store.entries = store.entries.filter((item) => item.id !== entry.id)
    store.entries.push(entry)

    return { ok: true, data: entry }
  } catch (error) {
    return toWorkspaceError(error)
  }
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

  const result = await connectFromServiceAccountPath(entry.serviceAccountPath)

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

    store.entries = store.entries.filter((item) => item.id !== entry.id)
    store.entries.push(entry)

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

  const result = await connectFromServiceAccountPath(entry.serviceAccountPath)

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

export async function removeEntry(projectId: string): Promise<WorkspaceResult<null>> {
  try {
    if (isFirestoreConnected(projectId)) {
      await disconnectFirestore(projectId)
    }

    store.entries = store.entries.filter((entry) => entry.id !== projectId)

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

  return { ok: true, data: updated }
}

export async function setFocusedProject(projectId: string): Promise<WorkspaceResult<WorkspaceEntry>> {
  const entry = getWorkspaceEntry(projectId)

  if (!entry) {
    return { ok: false, error: 'プロジェクトが登録されていません' }
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
