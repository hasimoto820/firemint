import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  DumpDiffInput,
  DiffProgress,
  DiffSummary,
  DiffExportFormat
} from '@features/diff/shared/types'
import { compareOfficialDump, exportDumpDiffReport, peekDiffDump } from './service'

export function registerDiffHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIFF_PEEK_DUMP, async (_event, dumpPath: string) => {
    logInfo('ipc:diff', `peekDiffDump dump=${dumpPath}`)
    return peekDiffDump(dumpPath)
  })

  ipcMain.handle(IPC_CHANNELS.DIFF_COMPARE_DUMP, async (event, input: DumpDiffInput) => {
    logInfo('ipc:diff', `compareOfficialDump projectId=${input.projectId} dump=${input.dumpPath}`)
    const reportProgress = (progress: DiffProgress): void => {
      event.sender.send(IPC_CHANNELS.DIFF_COMPARE_PROGRESS, progress)
    }
    return compareOfficialDump(input, reportProgress)
  })

  ipcMain.handle(
    IPC_CHANNELS.DIFF_EXPORT_REPORT,
    async (event, summary: DiffSummary, format: DiffExportFormat) => {
      logInfo(
        'ipc:diff',
        `exportDumpDiffReport format=${format} projectId=${summary.projectId} rows=${summary.rows.length}`
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      return exportDumpDiffReport(summary, format, window)
    }
  )
}
