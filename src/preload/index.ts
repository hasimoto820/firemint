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
  },
  explorer: {
    listRootCollections: () => ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS),
    listDocuments: (collectionPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS, collectionPath),
    getDocument: (documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_GET_DOCUMENT, documentPath),
    createDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_CREATE_DOCUMENT, input),
    updateDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_UPDATE_DOCUMENT, input),
    deleteDocument: (documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DELETE_DOCUMENT, documentPath),
    listSubcollections: (documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_SUBCOLLECTIONS, documentPath)
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
