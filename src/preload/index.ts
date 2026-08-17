import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcApi } from '@shared/ipc/types'
import type { AppSettings } from '@shared/settings/shared/types'

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
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    confirm: (input) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CONFIRM, input)
  },
  connection: {
    selectServiceAccountFile: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SELECT_FILE),
    connect: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CONNECT, filePath),
    googleSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GOOGLE_SIGN_IN),
    googleCancelSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GOOGLE_CANCEL_SIGN_IN),
    googleConnectProject: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GOOGLE_CONNECT_PROJECT, input),
    googleConnectAccount: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GOOGLE_CONNECT_ACCOUNT, input),
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
    setFocused: (projectId: string, options?) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SET_FOCUSED, projectId, options)
  },
  explorer: {
    listRootCollections: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS, projectId),
    listDocuments: (projectId: string, collectionPath: string, options?) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS, projectId, collectionPath, options),
    countDocuments: (projectId: string, collectionPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_COUNT_DOCUMENTS, projectId, collectionPath),
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
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DUPLICATE_COLLECTION, input),
    renameCollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_RENAME_COLLECTION, input),
    createCollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_CREATE_COLLECTION, input),
    createSubcollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_CREATE_SUBCOLLECTION, input),
    deleteCollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DELETE_COLLECTION, input)
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
    previewCreateField: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.BULK_PREVIEW_CREATE_FIELD, input),
    createField: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_CREATE_FIELD, input),
    previewUpdateFieldValue: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.BULK_PREVIEW_UPDATE_FIELD_VALUE, input),
    updateFieldValue: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.BULK_UPDATE_FIELD_VALUE, input),
    previewRenameField: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.BULK_PREVIEW_RENAME_FIELD, input),
    renameField: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_RENAME_FIELD, input),
    previewDeleteField: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.BULK_PREVIEW_DELETE_FIELD, input),
    deleteField: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_DELETE_FIELD, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.BULK_DELETE, input)
  },
  dataTransfer: {
    exportCollectionJson: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_COLLECTION_JSON, input),
    exportDocumentsJson: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_JSON, input),
    exportDocumentsCsv: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_CSV, input),
    selectCollectionImportJson: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_SELECT_COLLECTION_IMPORT_JSON),
    peekCollectionImportJson: (filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_PEEK_COLLECTION_IMPORT_JSON, filePath),
    validateCollectionImport: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_VALIDATE_COLLECTION_IMPORT, input),
    importCollectionJson: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_JSON, input),
    onImportCollectionProgress: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof listener>[0]
      ): void => {
        listener(progress)
      }
      ipcRenderer.on(IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_PROGRESS, handler)
      }
    },
    exportProject: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_EXPORT_PROJECT, input),
    onExportProjectProgress: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof listener>[0]
      ): void => {
        listener(progress)
      }
      ipcRenderer.on(IPC_CHANNELS.DATA_TRANSFER_EXPORT_PROJECT_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.DATA_TRANSFER_EXPORT_PROJECT_PROGRESS, handler)
      }
    },
    selectProjectImportZip: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_SELECT_PROJECT_IMPORT_ZIP),
    validateProjectImport: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_VALIDATE_PROJECT_IMPORT, input),
    importProject: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT, input),
    onImportProjectProgress: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof listener>[0]
      ): void => {
        listener(progress)
      }
      ipcRenderer.on(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, handler)
      }
    }
  },
  scriptRunner: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_RUNNER_START, input),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_RUNNER_CANCEL),
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPT_RUNNER_GET_SNAPSHOT),
    onSnapshot: (listener) => {
      const handler = (
        _event: IpcRendererEvent,
        snapshot: Parameters<typeof listener>[0]
      ): void => {
        listener(snapshot)
      }
      ipcRenderer.on(IPC_CHANNELS.SCRIPT_RUNNER_SNAPSHOT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SCRIPT_RUNNER_SNAPSHOT, handler)
      }
    }
  },
  authUsers: {
    listUsers: (input) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_LIST, input),
    getUser: (projectId: string, uid: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_GET, projectId, uid),
    updateUser: (input) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_UPDATE, input),
    setUsersDisabled: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_SET_DISABLED, input),
    deleteUsers: (input) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_DELETE, input),
    exportUsers: (input) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_USERS_EXPORT, input)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    setLocale: (locale) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_LOCALE, locale),
    setTheme: (theme) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_THEME, theme),
    openWindow: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN_WINDOW),
    onChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, settings: AppSettings): void => {
        listener(settings)
      }
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler)
      }
    }
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
