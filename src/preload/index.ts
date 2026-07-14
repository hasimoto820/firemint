import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcApi } from '@shared/ipc/types'

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.PING),
  app: {
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
    getAbout: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ABOUT),
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximizeToggle: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)
  },
  connection: {
    selectServiceAccountFile: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SELECT_FILE),
    connect: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CONNECT, filePath),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DISCONNECT),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_STATUS)
  },
  workspace: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_STATE),
    addEntry: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_ADD_ENTRY, input),
    removeEntry: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE_ENTRY, projectId),
    updateEntry: (projectId: string, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE_ENTRY, projectId, input),
    loadProject: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LOAD_PROJECT, projectId),
    unloadProject: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UNLOAD_PROJECT, projectId),
    setFocused: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SET_FOCUSED, projectId)
  },
  explorer: {
    listRootCollections: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS, projectId),
    listDocuments: (projectId: string, collectionPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS, projectId, collectionPath),
    getDocument: (projectId: string, documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_GET_DOCUMENT, projectId, documentPath),
    createDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_CREATE_DOCUMENT, input),
    updateDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_UPDATE_DOCUMENT, input),
    deleteDocument: (projectId: string, documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DELETE_DOCUMENT, projectId, documentPath),
    listSubcollections: (projectId: string, documentPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_SUBCOLLECTIONS, projectId, documentPath),
    duplicateDocument: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DUPLICATE_DOCUMENT, input),
    duplicateCollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DUPLICATE_COLLECTION, input)
  },
  query: {
    execute: (input) => ipcRenderer.invoke(IPC_CHANNELS.QUERY_EXECUTE, input),
    listSaved: (projectId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.QUERY_LIST_SAVED, projectId),
    saveSaved: (input) => ipcRenderer.invoke(IPC_CHANNELS.QUERY_SAVE_SAVED, input),
    deleteSaved: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.QUERY_DELETE_SAVED, id)
  },
  bulk: {
    previewUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_PREVIEW_UPDATE, input),
    updateField: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_UPDATE_FIELD, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_DELETE, input)
  },
  dataTransfer: {
    exportCollectionJson: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_COLLECTION_JSON, input),
    exportDocumentsJson: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_JSON, input),
    exportDocumentsCsv: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_CSV, input)
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
