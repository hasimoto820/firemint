import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { PingResult } from '@shared/ipc/types'
import { registerConnectionHandlers } from '@features/connection/main/ipc'
import { registerExplorerHandlers } from '@features/explorer/main/ipc'
import { registerQueryHandlers } from '@features/query/main/ipc'
import { registerBulkOperationsHandlers } from '@features/bulk_operations/main/ipc'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PING, (): PingResult => {
    return { message: 'pong' }
  })

  registerConnectionHandlers()
  registerExplorerHandlers()
  registerQueryHandlers()
  registerBulkOperationsHandlers()
}
