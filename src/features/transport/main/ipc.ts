import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { TransportInput, TransportProgress } from '@features/transport/shared/types'
import { transportDocuments, validateTransport } from './service'

export function registerTransportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TRANSPORT_VALIDATE, async (event, input: TransportInput) => {
    logInfo(
      'ipc:transport',
      `validate ${input.sourceProjectId} → ${input.destinationProjectId} target=${input.target}`
    )
    const reportProgress = (progress: TransportProgress): void => {
      event.sender.send(IPC_CHANNELS.TRANSPORT_PROGRESS, progress)
    }
    return validateTransport(input, reportProgress)
  })

  ipcMain.handle(IPC_CHANNELS.TRANSPORT_RUN, async (event, input: TransportInput) => {
    logInfo(
      'ipc:transport',
      `run ${input.sourceProjectId} → ${input.destinationProjectId} target=${input.target}`
    )
    const reportProgress = (progress: TransportProgress): void => {
      event.sender.send(IPC_CHANNELS.TRANSPORT_PROGRESS, progress)
    }
    return transportDocuments(input, reportProgress)
  })
}
