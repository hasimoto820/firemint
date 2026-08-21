import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  CollectionDiffInput,
  CollectionDiffProgress,
  CollectionDiffSummary
} from '@features/diff/shared/types'
import {
  compareCollectionJson,
  exportCollectionDiffReport,
  peekDiffJson,
  selectDiffJson
} from './service'

export function registerDiffHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIFF_SELECT_JSON, async (event) => {
    logInfo('ipc:diff', 'selectDiffJson')
    const window = BrowserWindow.fromWebContents(event.sender)
    return selectDiffJson(window)
  })

  ipcMain.handle(IPC_CHANNELS.DIFF_PEEK_JSON, async (_event, filePath: string) => {
    logInfo('ipc:diff', `peekDiffJson file=${filePath}`)
    return peekDiffJson(filePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.DIFF_COMPARE_COLLECTION,
    async (event, input: CollectionDiffInput) => {
      logInfo('ipc:diff', `compareCollectionJson path=${input.collectionPath} file=${input.filePath}`)
      const reportProgress = (progress: CollectionDiffProgress): void => {
        event.sender.send(IPC_CHANNELS.DIFF_COMPARE_PROGRESS, progress)
      }
      return compareCollectionJson(input, reportProgress)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DIFF_EXPORT_REPORT,
    async (event, summary: CollectionDiffSummary) => {
      logInfo(
        'ipc:diff',
        `exportCollectionDiffReport path=${summary.collectionPath} rows=${summary.rows.length}`
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportCollectionDiffReport(summary, window)
    }
  )
}
