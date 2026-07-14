import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    getSenderWindow(event)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE, (event) => {
    const window = getSenderWindow(event)

    if (!window) {
      return false
    }

    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }

    window.maximize()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    getSenderWindow(event)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return getSenderWindow(event)?.isMaximized() ?? false
  })
}
