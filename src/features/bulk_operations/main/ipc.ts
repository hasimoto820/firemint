import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { BulkDeleteInput, BulkUpdateFieldInput } from '@features/bulk_operations/shared/types'
import { bulkDelete, bulkUpdateField, previewBulkUpdateField } from './service'

export function registerBulkOperationsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BULK_PREVIEW_UPDATE, async (_event, input: BulkUpdateFieldInput) => {
    logInfo('ipc:bulk_operations', `previewUpdate invoked count=${input.documentPaths.length}`)
    return previewBulkUpdateField(input)
  })

  ipcMain.handle(IPC_CHANNELS.BULK_UPDATE_FIELD, async (_event, input: BulkUpdateFieldInput) => {
    logInfo('ipc:bulk_operations', `updateField invoked count=${input.documentPaths.length}`)
    return bulkUpdateField(input)
  })

  ipcMain.handle(IPC_CHANNELS.BULK_DELETE, async (_event, input: BulkDeleteInput) => {
    logInfo('ipc:bulk_operations', `delete invoked count=${input.documentPaths.length}`)
    return bulkDelete(input)
  })
}
