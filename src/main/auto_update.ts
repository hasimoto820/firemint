import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logInfo, logWarn } from '@shared/logging/logger'

// 新しい版は GitHub Releases（hasimoto820/firemint-desktop）から取る。
// 宛先は electron-builder.yml の publish で決まり、ビルドの時に app-update.yml としてアプリに入る。
//
// 起動の時に新しい版を確かめ、あれば裏でダウンロードする。
// 入れ替えはアプリを閉じた時に行われ、次に開いた時から新しい版になる。
export function startAutoUpdate(): void {
  // 開発中（npm run dev）は app-update.yml が無いので確かめない
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: (message: unknown) => logInfo('update', String(message)),
    warn: (message: unknown) => logWarn('update', String(message)),
    error: (message: unknown) => logWarn('update', String(message)),
    debug: () => {}
  }

  autoUpdater.on('update-available', (info) => {
    logInfo('update', `update available version=${info.version}`)
  })
  autoUpdater.on('update-not-available', (info) => {
    logInfo('update', `up to date version=${info.version}`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    logInfo('update', `update downloaded version=${info.version} (installs on quit)`)
  })
  // ネットにつながらない時などに失敗しても、アプリはそのまま使えるようにする
  autoUpdater.on('error', (error) => {
    logWarn('update', 'update check failed', error)
  })

  autoUpdater.checkForUpdates().catch((error) => {
    logWarn('update', 'update check failed', error)
  })
}
