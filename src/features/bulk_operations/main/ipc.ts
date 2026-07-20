import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  BulkDeleteFieldInput,
  BulkDeleteInput,
  BulkRenameFieldInput,
  BulkUpdateFieldInput
} from '@features/bulk_operations/shared/types'
import {
  bulkDelete,
  bulkDeleteField,
  bulkRenameField,
  bulkUpdateField,
  previewBulkDeleteField,
  previewBulkRenameField,
  previewBulkUpdateField
} from './service'

export function registerBulkOperationsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BULK_PREVIEW_UPDATE, async (_event, input: BulkUpdateFieldInput) => {
    logInfo('ipc:bulk_operations', `previewUpdate invoked count=${input.documentPaths.length}`)
    return previewBulkUpdateField(input)
  })

  ipcMain.handle(IPC_CHANNELS.BULK_UPDATE_FIELD, async (_event, input: BulkUpdateFieldInput) => {
    logInfo('ipc:bulk_operations', `updateField invoked count=${input.documentPaths.length}`)
    return bulkUpdateField(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.BULK_PREVIEW_RENAME_FIELD,
    async (_event, input: BulkRenameFieldInput) => {
      logInfo('ipc:bulk_operations', `previewRenameField invoked path=${input.collectionPath}`)
      return previewBulkRenameField(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BULK_RENAME_FIELD, async (_event, input: BulkRenameFieldInput) => {
    logInfo('ipc:bulk_operations', `renameField invoked path=${input.collectionPath}`)
    return bulkRenameField(input)
  })

  ipcMain.handle(
    IPC_CHANNELS.BULK_PREVIEW_DELETE_FIELD,
    async (_event, input: BulkDeleteFieldInput) => {
      logInfo('ipc:bulk_operations', `previewDeleteField invoked path=${input.collectionPath}`)
      return previewBulkDeleteField(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BULK_DELETE_FIELD, async (_event, input: BulkDeleteFieldInput) => {
    logInfo('ipc:bulk_operations', `deleteField invoked path=${input.collectionPath}`)
    return bulkDeleteField(input)
  })

  ipcMain.handle(IPC_CHANNELS.BULK_DELETE, async (_event, input: BulkDeleteInput) => {
    logInfo('ipc:bulk_operations', `delete invoked count=${input.documentPaths.length}`)
    return bulkDelete(input)
  })
}
