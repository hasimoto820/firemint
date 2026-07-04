import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  AddWorkspaceEntryInput,
  UpdateWorkspaceEntryInput
} from '@features/workspace/shared/types'
import {
  addEntryAndLoad,
  getWorkspaceState,
  loadProject,
  removeEntry,
  setFocusedProject,
  unloadProject,
  updateEntry
} from './service'

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_STATE, async () => {
    logInfo('ipc:workspace', 'getState invoked')
    return getWorkspaceState()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_ADD_ENTRY, async (_event, input: AddWorkspaceEntryInput) => {
    logInfo('ipc:workspace', `addEntry invoked path=${input.serviceAccountPath}`)
    return addEntryAndLoad(input)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_REMOVE_ENTRY, async (_event, projectId: string) => {
    logInfo('ipc:workspace', `removeEntry invoked projectId=${projectId}`)
    return removeEntry(projectId)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_UPDATE_ENTRY, async (
    _event,
    projectId: string,
    input: UpdateWorkspaceEntryInput
  ) => {
    logInfo('ipc:workspace', `updateEntry invoked projectId=${projectId}`)
    return updateEntry(projectId, input)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LOAD_PROJECT, async (_event, projectId: string) => {
    logInfo('ipc:workspace', `loadProject invoked projectId=${projectId}`)
    return loadProject(projectId)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_UNLOAD_PROJECT, async (_event, projectId: string) => {
    logInfo('ipc:workspace', `unloadProject invoked projectId=${projectId}`)
    return unloadProject(projectId)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SET_FOCUSED, async (_event, projectId: string) => {
    logInfo('ipc:workspace', `setFocused invoked projectId=${projectId}`)
    return setFocusedProject(projectId)
  })
}
