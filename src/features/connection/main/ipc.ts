import { dialog, ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { GoogleConnectAccountInput, GoogleConnectProjectInput } from '@features/connection/shared/types'
import {
  cancelGoogleSignIn,
  connectWithGoogleAccount,
  connectWithGoogleProject,
  connectWithServiceAccountFile,
  disconnectFromFirestore,
  getConnectionStatus,
  signInWithGoogle
} from './service'

export function registerConnectionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_SELECT_FILE, async (event) => {
    logInfo('ipc:connection', 'selectServiceAccountFile invoked')
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: 'サービスアカウント JSON を選択',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          title: 'サービスアカウント JSON を選択',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })

    if (result.canceled || result.filePaths.length === 0) {
      logInfo('ipc:connection', 'selectServiceAccountFile canceled')
      return null
    }

    logInfo('ipc:connection', `selectServiceAccountFile selected=${result.filePaths[0]}`)
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_CONNECT, async (_event, filePath: string) => {
    logInfo('ipc:connection', `connect invoked file=${filePath}`)
    return connectWithServiceAccountFile(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_GOOGLE_SIGN_IN, async () => {
    logInfo('ipc:connection', 'googleSignIn invoked')
    return signInWithGoogle()
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_GOOGLE_CANCEL_SIGN_IN, async () => {
    logInfo('ipc:connection', 'googleCancelSignIn invoked')
    cancelGoogleSignIn()
  })

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_GOOGLE_CONNECT_PROJECT,
    async (_event, input: GoogleConnectProjectInput) => {
      logInfo('ipc:connection', `googleConnectProject invoked project=${input.projectId}`)
      return connectWithGoogleProject(input)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_GOOGLE_CONNECT_ACCOUNT,
    async (_event, input: GoogleConnectAccountInput) => {
      logInfo(
        'ipc:connection',
        `googleConnectAccount invoked account=${input.accountEmail} projects=${input.projects.length}`
      )
      return connectWithGoogleAccount(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_DISCONNECT, async () => {
    logInfo('ipc:connection', 'disconnect invoked')
    await disconnectFromFirestore()
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET_STATUS, async () => {
    return getConnectionStatus()
  })
}
