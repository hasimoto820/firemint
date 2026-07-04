import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { CreateDocumentInput, UpdateDocumentInput } from '@features/explorer/shared/types'
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listRootCollections,
  listSubcollections,
  updateDocument
} from './service'

export function registerExplorerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LIST_ROOT_COLLECTIONS, async () => {
    logInfo('ipc:explorer', 'listRootCollections invoked')
    return listRootCollections()
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_LIST_DOCUMENTS, async (_event, collectionPath: string) => {
    logInfo('ipc:explorer', `listDocuments invoked path=${collectionPath}`)
    return listDocuments(collectionPath)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_GET_DOCUMENT, async (_event, documentPath: string) => {
    logInfo('ipc:explorer', `getDocument invoked path=${documentPath}`)
    return getDocument(documentPath)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_CREATE_DOCUMENT, async (_event, input: CreateDocumentInput) => {
    logInfo('ipc:explorer', `createDocument invoked path=${input.collectionPath}`)
    return createDocument(input)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_UPDATE_DOCUMENT, async (_event, input: UpdateDocumentInput) => {
    logInfo('ipc:explorer', `updateDocument invoked path=${input.documentPath}`)
    return updateDocument(input)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_DELETE_DOCUMENT, async (_event, documentPath: string) => {
    logInfo('ipc:explorer', `deleteDocument invoked path=${documentPath}`)
    return deleteDocument(documentPath)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_LIST_SUBCOLLECTIONS, async (_event, documentPath: string) => {
    logInfo('ipc:explorer', `listSubcollections invoked path=${documentPath}`)
    return listSubcollections(documentPath)
  })
}
