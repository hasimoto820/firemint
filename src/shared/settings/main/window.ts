import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import { getSettings } from './service'
import { windowBackgroundColor } from './window_chrome'

let settingsWindow: BrowserWindow | null = null

function settingsUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#/settings`
  }

  return `file://${join(__dirname, '../renderer/index.html')}#/settings`
}

/** Alt+Tab / タスクバーで別アプリに見えないよう、メインの子にする。 */
function resolveParentWindow(): BrowserWindow | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed() && focused !== settingsWindow) {
    return focused
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window !== settingsWindow) {
      return window
    }
  }

  return undefined
}

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  logInfo('settings', 'open settings window')

  void getSettings().then((settings) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus()
      return
    }

    const parent = resolveParentWindow()

    settingsWindow = new BrowserWindow({
      width: 440,
      height: 560,
      minWidth: 360,
      minHeight: 400,
      resizable: true,
      minimizable: false,
      maximizable: false,
      show: false,
      autoHideMenuBar: true,
      title: 'FireMint',
      parent,
      modal: false,
      skipTaskbar: true,
      backgroundColor: windowBackgroundColor(settings.theme),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    settingsWindow.on('ready-to-show', () => {
      settingsWindow?.show()
    })

    // 閉じた後に前へ出すウィンドウを Windows に任せると、別のアプリが前に来ることがある。
    // 閉じる直前に、親（メインのウィンドウ）を前に出しておく
    settingsWindow.on('close', () => {
      if (parent && !parent.isDestroyed()) {
        if (parent.isMinimized()) {
          parent.restore()
        }
        parent.focus()
      }
    })

    settingsWindow.on('closed', () => {
      settingsWindow = null
      if (parent && !parent.isDestroyed()) {
        parent.focus()
      }
    })

    void settingsWindow.loadURL(settingsUrl())
  })
}

export function broadcastSettingsChanged(payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, payload)
    }
  }
}
