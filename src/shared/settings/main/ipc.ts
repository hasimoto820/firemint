import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { logInfo } from '@shared/logging/logger'
import type { Locale } from '@shared/i18n/shared/types'
import { isLocale } from '@shared/i18n/shared/types'
import { isTheme, type Theme } from '@shared/settings/shared/types'
import { getSettings, setLocale, setTheme } from './service'
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

  ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_WINDOW, async () => {
    logInfo('ipc:settings', 'openWindow invoked')
    openSettingsWindow()
    return null
  })
}
