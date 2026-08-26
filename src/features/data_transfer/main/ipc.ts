import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { OfficialImportInput } from '@features/data_transfer/shared/official'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import { selectOfficialDump, validateOfficialImport } from './official/write_dump'

export function registerDataTransferHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_SELECT_OFFICIAL_DUMP, async (event) => {
    logInfo('ipc:data_transfer', 'selectOfficialDump')
    const window = BrowserWindow.fromWebContents(event.sender)
    return selectOfficialDump(window)
  })

  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_VALIDATE_OFFICIAL_IMPORT,
    async (event, input: OfficialImportInput) => {
      logInfo(
        'ipc:data_transfer',
        `validateOfficialImport projectId=${input.projectId} dump=${input.dumpPath}`
      )
      const reportProgress = (progress: ImportProjectProgress): void => {
        event.sender.send(IPC_CHANNELS.DATA_TRANSFER_IMPORT_PROJECT_PROGRESS, progress)
      }
      return validateOfficialImport(input, reportProgress)
    }
  )
}
