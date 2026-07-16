import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  ExportCollectionJsonInput,
  ExportDocumentsInput,
  ExportProjectInput,
  ExportProjectProgress,
  ImportCollectionJsonInput,
  ImportCollectionProgress,
  ImportProjectInput,
  ImportProjectProgress
} from '@features/data_transfer/shared/types'
import {
  importCollectionJson,
  selectCollectionImportJson,
  validateCollectionImport
} from './import_service'
import { exportProject } from './project_export_service'
import {
  importProject,
  selectProjectImportZip,
  validateProjectImport
} from './project_import_service'
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

  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_SELECT_COLLECTION_IMPORT_JSON, async (event) => {
    logInfo('ipc:data_transfer', 'selectCollectionImportJson')
    const window = BrowserWindow.fromWebContents(event.sender)
    return selectCollectionImportJson(window)
  })

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_VALIDATE_COLLECTION_IMPORT,
    async (event, input: ImportCollectionJsonInput) => {
      logInfo(
        'ipc:data_transfer',
        `validateCollectionImport path=${input.collectionPath} file=${input.filePath}`
      )
      const reportProgress = (progress: ImportCollectionProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_PROGRESS, progress)
      }
      return validateCollectionImport(input, reportProgress)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_JSON,
    async (event, input: ImportCollectionJsonInput) => {
      logInfo(
        'ipc:data_transfer',
        `importCollectionJson path=${input.collectionPath} file=${input.filePath}`
      )
      const reportProgress = (progress: ImportCollectionProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_COLLECTION_PROGRESS, progress)
      }
      return importCollectionJson(input, reportProgress)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_EXPORT_PROJECT,
    async (event, input: ExportProjectInput) => {
      logInfo(
        'ipc:data_transfer',
        `exportProject projectId=${input.projectId} roots=${input.rootCollectionIds.length}`
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      const reportProgress = (progress: ExportProjectProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_EXPORT_PROJECT_PROGRESS, progress)
      }
      return exportProject(input, window, reportProgress)
    }
  )

  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_SELECT_PROJECT_IMPORT_ZIP, async (event) => {
    logInfo('ipc:data_transfer', 'selectProjectImportZip')
    const window = BrowserWindow.fromWebContents(event.sender)
    return selectProjectImportZip(window)
  })

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_VALIDATE_PROJECT_IMPORT,
    async (event, input: ImportProjectInput) => {
      logInfo(
        'ipc:data_transfer',
        `validateProjectImport projectId=${input.projectId} file=${input.filePath}`
      )
      const reportProgress = (progress: ImportProjectProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, progress)
      }
      return validateProjectImport(input, reportProgress)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT,
    async (event, input: ImportProjectInput) => {
      logInfo(
        'ipc:data_transfer',
        `importProject projectId=${input.projectId} file=${input.filePath}`
      )
      const reportProgress = (progress: ImportProjectProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, progress)
      }
      return importProject(input, reportProgress)
    }
  )
}
