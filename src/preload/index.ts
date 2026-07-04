import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcApi } from '@shared/ipc/types'

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.PING),
  connection: {
    selectServiceAccountFile: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SELECT_FILE),
    connect: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CONNECT, filePath),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DISCONNECT),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_STATUS)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error define in dts
  window.electron = electronAPI
  // @ts-expect-error define in dts
  window.api = api
}
