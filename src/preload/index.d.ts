import { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '@shared/ipc/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcApi
  }
}

export {}
