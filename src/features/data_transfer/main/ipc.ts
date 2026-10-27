import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  ImportVerifyInput,
  OfficialExportInput
} from '@features/data_transfer/shared/official'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import { chooseExportPath, defaultExportPath } from './official/export_dump'
import {
  inspectImportFile,
  selectOfficialDump,
  validateOfficialImport
} from './official/write_dump'

export function registerDataTransferHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_SELECT_OFFICIAL_DUMP, async (event) => {
    logInfo('ipc:data_transfer', 'selectOfficialDump')
    const window = BrowserWindow.fromWebContents(event.sender)
    return selectOfficialDump(window)
  })

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_INSPECT_IMPORT_FILE,
    async (_event, filePath: string) => {
      logInfo('ipc:data_transfer', `inspectImportFile file=${filePath}`)
      return inspectImportFile(filePath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_VALIDATE_OFFICIAL_IMPORT,
    async (event, input: ImportVerifyInput) => {
      logInfo(
        'ipc:data_transfer',
        `validateOfficialImport level=${input.level} projectId=${input.projectId} file=${input.dumpPath}`
      )
      const reportProgress = (progress: ImportProjectProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, progress)
      }
      return validateOfficialImport(input, reportProgress)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_DEFAULT_EXPORT_PATH,
    async (_event, input: OfficialExportInput) => defaultExportPath(input)
  )

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_CHOOSE_EXPORT_PATH,
    async (event, input: OfficialExportInput) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      return chooseExportPath(window, input)
    }
  )
}
