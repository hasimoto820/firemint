import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import {
  addAccountMember,
  getAccountStatus,
  deleteAccountData,
  leaveAccount,
  listAccountMembers,
  manageBilling,
  purchaseSubscription,
  removeAccountMember,
  refreshAccount,
  signInWithGoogle,
  signOutOfAccount
} from './account_service'
import { cancelGoogleIdTokenRequest } from './google_id_token'

export function registerAccountHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GET_STATUS, () => getAccountStatus())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GOOGLE_SIGN_IN, () => signInWithGoogle())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_SIGN_OUT, () => signOutOfAccount())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_REFRESH, () => refreshAccount())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_PURCHASE, () => purchaseSubscription())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_LIST_MEMBERS, () => listAccountMembers())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_ADD_MEMBER, (_event, email: string) =>
    addAccountMember(email)
  )
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_REMOVE_MEMBER, (_event, memberId: string) =>
    removeAccountMember(memberId)
  )
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_LEAVE, () => leaveAccount())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_MANAGE_BILLING, () => manageBilling())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_DELETE_DATA, () => deleteAccountData())
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GOOGLE_CANCEL_SIGN_IN, () => {
    cancelGoogleIdTokenRequest()
  })
}
