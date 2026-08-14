import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { StartScriptJobInput } from '@features/script_runner/shared/types'
import { cancelScriptJob, getScriptJobSnapshot, startScriptJob } from './job_runner'

export function registerScriptRunnerHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SCRIPT_RUNNER_START,
    async (event, input: StartScriptJobInput) => {
      logInfo('ipc:script_runner', `start kind=${input.kind}`)
      const window = BrowserWindow.fromWebContents(event.sender)
      return startScriptJob(input, window)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SCRIPT_RUNNER_CANCEL, async () => {
    logInfo('ipc:script_runner', 'cancel')
    return cancelScriptJob()
  })

  ipcMain.handle(IPC_CHANNELS.SCRIPT_RUNNER_GET_SNAPSHOT, async () => {
    return getScriptJobSnapshot()
  })
}
