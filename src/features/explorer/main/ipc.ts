import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { CreateDocumentInput, DuplicateCollectionInput, DuplicateDocumentInput, UpdateDocumentInput } from '@features/explorer/shared/types'
import {
  createDocument,
  deleteDocument,
  duplicateCollection,
  duplicateDocument,
  getDocument,
  listDocuments,
  listRootCollections,
  listSubcollections,
  updateDocument
} from './service'

export function registerExplorerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS, async (_event, projectId: string) => {
    logInfo('ipc:explorer', `listRootCollections invoked projectId=${projectId}`)
    return listRootCollections(projectId)
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS,
    async (_event, projectId: string, collectionPath: string) => {
      logInfo('ipc:explorer', `listDocuments invoked projectId=${projectId} path=${collectionPath}`)
      return listDocuments(projectId, collectionPath)
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
}
