import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { getAccountStatus, signInWithGoogle, signOutOfAccount } from './account_service'
import { cancelGoogleIdTokenRequest } from './google_id_token'

export function registerAccountHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GET_STATUS, () => getAccountStatus())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GOOGLE_SIGN_IN, () => signInWithGoogle())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_SIGN_OUT, () => signOutOfAccount())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GOOGLE_CANCEL_SIGN_IN, () => {
    cancelGoogleIdTokenRequest()
  })
}
