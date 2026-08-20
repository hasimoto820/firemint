import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type {
  DeleteEmulatorProjectInput,
  ImportEmulatorCollectionJsonInput,
  ImportEmulatorProjectZipInput
} from '@features/emulator/shared/types'
import {
  deleteEmulatorProject,
  discoverEmulators,
  importEmulatorCollectionJson,
  importEmulatorProjectZip
} from './service'

export function registerEmulatorHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.EMULATOR_IMPORT_PROJECT_ZIP,
    async (_event, input: ImportEmulatorProjectZipInput) => {
      logInfo('ipc:emulator', `importProjectZip host=${input.host} file=${input.filePath}`)
      return importEmulatorProjectZip(input)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EMULATOR_IMPORT_COLLECTION_JSON,
    async (_event, input: ImportEmulatorCollectionJsonInput) => {
      logInfo(
        'ipc:emulator',
        `importCollectionJson project=${input.projectId} file=${input.filePath}`
      )
      return importEmulatorCollectionJson(input)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EMULATOR_DELETE_PROJECT,
    async (_event, input: DeleteEmulatorProjectInput) => {
      logInfo('ipc:emulator', `deleteProject project=${input.projectId}`)
      return deleteEmulatorProject(input)
    }
  )

  ipcMain.handle(IPC_CHANNELS.EMULATOR_DISCOVER, async () => {
    logInfo('ipc:emulator', 'discover')
    return discoverEmulators()
  })
}
