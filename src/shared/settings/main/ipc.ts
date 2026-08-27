import { ipcMain, shell } from 'electron'
import { mkdirSync } from 'fs'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { getLogsDir } from '@shared/logging/file_sink'
import { logInfo } from '@shared/logging/logger'
import type { Locale } from '@shared/i18n/shared/types'
import { isLocale } from '@shared/i18n/shared/types'
import { isTheme, type Theme } from '@shared/settings/shared/types'
import { getSettings, setAutoDiscoverEmulator, setLocale, setTheme } from './service'
import { applyThemeToWindows } from './window_chrome'
import { broadcastSettingsChanged, openSettingsWindow } from './window'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    logInfo('ipc:settings', 'get invoked')
    return getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_LOCALE, async (_event, locale: Locale) => {
    if (!isLocale(locale)) {
      throw new Error(`Unsupported locale: ${String(locale)}`)
    }
    logInfo('ipc:settings', `setLocale invoked locale=${locale}`)
    const next = await setLocale(locale)
    broadcastSettingsChanged(next)
    return next
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_THEME, async (_event, theme: Theme) => {
    if (!isTheme(theme)) {
      throw new Error(`Unsupported theme: ${String(theme)}`)
    }
    logInfo('ipc:settings', `setTheme invoked theme=${theme}`)
    const next = await setTheme(theme)
    applyThemeToWindows(next.theme)
    broadcastSettingsChanged(next)
    return next
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_AUTO_DISCOVER_EMULATOR,
    async (_event, autoDiscoverEmulator: boolean) => {
      if (typeof autoDiscoverEmulator !== 'boolean') {
        throw new Error('autoDiscoverEmulator must be boolean')
      }
      logInfo(
        'ipc:settings',
        `setAutoDiscoverEmulator invoked autoDiscoverEmulator=${autoDiscoverEmulator}`
      )
      const next = await setAutoDiscoverEmulator(autoDiscoverEmulator)
      broadcastSettingsChanged(next)
      return next
    }
  )

  ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_WINDOW, async () => {
    logInfo('ipc:settings', 'openWindow invoked')
    openSettingsWindow()
    return null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_LOGS_PATH, async () => {
    const path = getLogsDir()
    try {
      mkdirSync(path, { recursive: true })
    } catch {
      // still return the expected path
    }
    return path
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_LOGS_FOLDER, async () => {
    logInfo('ipc:settings', 'openLogsFolder invoked')
    const path = getLogsDir()
    try {
      mkdirSync(path, { recursive: true })
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error)
      }
    }

    const openError = await shell.openPath(path)
    if (openError) {
      return { ok: false as const, error: openError }
    }

    return { ok: true as const, path }
  })
}
