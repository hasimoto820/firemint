import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { WindowConfirmInput } from '@shared/ipc/types'

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function restoreWebContentsFocus(event: IpcMainInvokeEvent): void {
  const window = getSenderWindow(event)

  if (!window || window.isDestroyed()) {
    return
  }

  // hidden titleBar + ネイティブダイアログのあと、Windows で入力が死ぬことがある
  window.setEnabled(true)
  window.focus()
  event.sender.focus()
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

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_CONFIRM,
    async (event, input: WindowConfirmInput): Promise<boolean> => {
      const window = getSenderWindow(event)
      const confirmLabel = input.confirmLabel?.trim() || 'OK'
      const cancelLabel = input.cancelLabel?.trim() || 'キャンセル'
      const result = await dialog.showMessageBox(window ?? undefined, {
        type: 'question',
        buttons: [confirmLabel, cancelLabel],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: input.message
      })

      restoreWebContentsFocus(event)
      setImmediate(() => restoreWebContentsFocus(event))

      return result.response === 0
    }
  )
}

