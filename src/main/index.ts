import './env'
import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc/register_handlers'
import { initializeWorkspace } from '@features/workspace/main/service'
import { maybeRunOfficialDumpCli } from '@features/data_transfer/main/official/cli'
import { getSettings } from '@shared/settings/main/service'
import {
  titleBarOverlayOptions,
  windowBackgroundColor
} from '@shared/settings/main/window_chrome'

async function createWindow(): Promise<void> {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const isLinux = process.platform === 'linux'
  const { theme } = await getSettings()

  const mainWindow = new BrowserWindow({
    width: 960,
    height: 800,
    minWidth: 640,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: windowBackgroundColor(theme),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 14, y: 10 }
        }
      : {}),
    ...(isWin
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: titleBarOverlayOptions(theme)
        }
      : {}),
    ...(isLinux ? { frame: false, icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void maybeRunOfficialDumpCli().then((exitCode) => {
  if (exitCode !== null) {
    app.exit(exitCode)
    return
  }

  startApp()
})

function startApp(): void {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.firemint')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    void initializeWorkspace().then(() => {
      registerIpcHandlers()
      void createWindow()
    })

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
