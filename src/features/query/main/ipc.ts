import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { SimpleQueryInput } from '@features/query/shared/types'
import { executeQuery } from './service'

export function registerQueryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.QUERY_EXECUTE, async (_event, input: SimpleQueryInput) => {
    logInfo('ipc:query', `execute invoked path=${input.collectionPath}`)
    return executeQuery(input)
  })
}
