import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  DeleteAuthUsersInput,
  ExportAuthUsersInput,
  ListAuthUsersInput,
  SetAuthUsersDisabledInput,
  UpdateAuthUserInput
} from '@features/auth_users/shared/types'
import {
  deleteUsers,
  exportUsers,
  getUser,
  listUsers,
  setUsersDisabled,
  updateUser
} from './service'

export function registerAuthUsersHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_USERS_LIST, async (_event, input: ListAuthUsersInput) => {
    logInfo('ipc:auth_users', `list projectId=${input.projectId}`)
    return listUsers(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_USERS_GET,
    async (_event, projectId: string, uid: string) => {
      logInfo('ipc:auth_users', `get projectId=${projectId} uid=${uid}`)
      return getUser(projectId, uid)
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_USERS_UPDATE, async (_event, input: UpdateAuthUserInput) => {
    logInfo('ipc:auth_users', `update projectId=${input.projectId} uid=${input.uid}`)
    return updateUser(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_USERS_SET_DISABLED,
    async (_event, input: SetAuthUsersDisabledInput) => {
      logInfo(
        'ipc:auth_users',
        `setDisabled projectId=${input.projectId} count=${input.uids.length} disabled=${input.disabled}`
      )
      return setUsersDisabled(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.AUTH_USERS_DELETE, async (_event, input: DeleteAuthUsersInput) => {
    logInfo('ipc:auth_users', `delete projectId=${input.projectId} count=${input.uids.length}`)
    return deleteUsers(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_USERS_EXPORT,
    async (event, input: ExportAuthUsersInput) => {
      logInfo(
        'ipc:auth_users',
        `export projectId=${input.projectId} format=${input.format}`
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportUsers(input, window)
    }
  )
}
