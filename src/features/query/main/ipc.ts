import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { JsQueryInput, SaveSavedQueryInput } from '@features/query/shared/types'
import {
  deleteSavedQuery,
  listSavedQueries,
  saveSavedQuery
} from './saved_queries_service'
import { executeJsQuery } from './service'

export function registerQueryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.QUERY_EXECUTE, async (_event, input: JsQueryInput) => {
    logInfo('ipc:query', `executeJs invoked projectId=${input.projectId}`)
    return executeJsQuery(input)
  })

  ipcMain.handle(IPC_CHANNELS.QUERY_LIST_SAVED, async (_event, projectId?: string) => {
    logInfo('ipc:query', `listSaved projectId=${projectId ?? 'all'}`)
    return listSavedQueries(projectId)
  })

  ipcMain.handle(IPC_CHANNELS.QUERY_SAVE_SAVED, async (_event, input: SaveSavedQueryInput) => {
    logInfo('ipc:query', `saveSaved name=${input.name}`)
    return saveSavedQuery(input)
  })

  ipcMain.handle(IPC_CHANNELS.QUERY_DELETE_SAVED, async (_event, id: string) => {
    logInfo('ipc:query', `deleteSaved id=${id}`)
    return deleteSavedQuery(id)
  })
}
