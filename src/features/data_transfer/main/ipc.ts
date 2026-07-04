import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  ExportCollectionJsonInput,
  ExportDocumentsInput
} from '@features/data_transfer/shared/types'
import {
  exportCollectionJson,
  exportDocumentsCsv,
  exportDocumentsJson
} from './service'

export function registerDataTransferHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_EXPORT_COLLECTION_JSON,
    async (event, input: ExportCollectionJsonInput) => {
      logInfo('ipc:data_transfer', `exportCollectionJson path=${input.collectionPath}`)
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportCollectionJson(input, window)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_JSON,
    async (event, input: ExportDocumentsInput) => {
      logInfo('ipc:data_transfer', `exportDocumentsJson count=${input.documents.length}`)
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportDocumentsJson(input, window)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_EXPORT_DOCUMENTS_CSV,
    async (event, input: ExportDocumentsInput) => {
      logInfo('ipc:data_transfer', `exportDocumentsCsv count=${input.documents.length}`)
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportDocumentsCsv(input, window)
    }
  )
}
