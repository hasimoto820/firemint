import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  CreateCollectionInput,
  CreateDocumentInput,
  CreateSubcollectionInput,
  DeleteCollectionInput,
  DuplicateCollectionInput,
  DuplicateDocumentInput,
  ListDocumentsOptions,
  RenameCollectionInput,
  UpdateDocumentInput
} from '@features/explorer/shared/types'
import {
  countDocuments,
  createCollection,
  createDocument,
  createSubcollection,
  deleteCollection,
  deleteDocument,
  duplicateCollection,
  duplicateDocument,
  getDocument,
  listDocuments,
  listRootCollections,
  listSubcollections,
  renameCollection,
  updateDocument
} from './service'

export function registerExplorerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS, async (_event, projectId: string) => {
    logInfo('ipc:explorer', `listRootCollections invoked projectId=${projectId}`)
    return listRootCollections(projectId)
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS,
    async (
      _event,
      projectId: string,
      collectionPath: string,
      options?: ListDocumentsOptions
    ) => {
      logInfo('ipc:explorer', `listDocuments invoked projectId=${projectId} path=${collectionPath}`)
      return listDocuments(projectId, collectionPath, options)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_COUNT_DOCUMENTS,
    async (_event, projectId: string, collectionPath: string) => {
      logInfo('ipc:explorer', `countDocuments invoked projectId=${projectId} path=${collectionPath}`)
      return countDocuments(projectId, collectionPath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_GET_DOCUMENT,
    async (_event, projectId: string, documentPath: string) => {
      logInfo('ipc:explorer', `getDocument invoked projectId=${projectId} path=${documentPath}`)
      return getDocument(projectId, documentPath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.EXPLORER_CREATE_DOCUMENT, async (_event, input: CreateDocumentInput) => {
    logInfo('ipc:explorer', `createDocument invoked projectId=${input.projectId}`)
    return createDocument(input)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_UPDATE_DOCUMENT, async (_event, input: UpdateDocumentInput) => {
    logInfo('ipc:explorer', `updateDocument invoked projectId=${input.projectId}`)
    return updateDocument(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_DELETE_DOCUMENT,
    async (_event, projectId: string, documentPath: string) => {
      logInfo('ipc:explorer', `deleteDocument invoked projectId=${projectId}`)
      return deleteDocument(projectId, documentPath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_LIST_SUBCOLLECTIONS,
    async (_event, projectId: string, documentPath: string) => {
      logInfo('ipc:explorer', `listSubcollections invoked projectId=${projectId}`)
      return listSubcollections(projectId, documentPath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.EXPLORER_DUPLICATE_DOCUMENT, async (_event, input: DuplicateDocumentInput) => {
    logInfo('ipc:explorer', `duplicateDocument invoked projectId=${input.projectId}`)
    return duplicateDocument(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_DUPLICATE_COLLECTION,
    async (_event, input: DuplicateCollectionInput) => {
      logInfo('ipc:explorer', `duplicateCollection invoked projectId=${input.projectId}`)
      return duplicateCollection(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.EXPLORER_RENAME_COLLECTION, async (_event, input: RenameCollectionInput) => {
    logInfo('ipc:explorer', `renameCollection invoked projectId=${input.projectId}`)
    return renameCollection(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_CREATE_COLLECTION,
    async (_event, input: CreateCollectionInput) => {
      logInfo('ipc:explorer', `createCollection invoked projectId=${input.projectId}`)
      return createCollection(input)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_CREATE_SUBCOLLECTION,
    async (_event, input: CreateSubcollectionInput) => {
      logInfo('ipc:explorer', `createSubcollection invoked projectId=${input.projectId}`)
      return createSubcollection(input)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_DELETE_COLLECTION,
    async (_event, input: DeleteCollectionInput) => {
      logInfo('ipc:explorer', `deleteCollection invoked projectId=${input.projectId}`)
      return deleteCollection(input)
    }
  )
}
