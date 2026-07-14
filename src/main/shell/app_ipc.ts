import { app, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { AppAboutInfo } from '@shared/ipc/types'

export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    app.quit()
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_ABOUT, (): AppAboutInfo => {
    return {
      name: 'FireMint',
      version: app.getVersion(),
      description: 'Firestore external management desktop tool'
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new Error('Invalid URL')
    }

    void shell.openExternal(url)
  })
}
