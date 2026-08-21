import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type Theme
} from '@shared/settings/shared/types'
import type { Locale } from '@shared/i18n/shared/types'

const STORE_FILE_NAME = 'settings.json'

function getStorePath(): string {
  return join(process.cwd(), 'config', STORE_FILE_NAME)
}

export async function loadSettings(): Promise<AppSettings> {
  const storePath = getStorePath()

  try {
    const raw = await readFile(storePath, 'utf-8')
    return normalizeSettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const storePath = getStorePath()
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

export async function getSettings(): Promise<AppSettings> {
  return loadSettings()
}

export async function setLocale(locale: Locale): Promise<AppSettings> {
  const current = await loadSettings()
  const next: AppSettings = { ...current, locale }
  await saveSettings(next)
  return next
}

export async function setTheme(theme: Theme): Promise<AppSettings> {
  const current = await loadSettings()
  const next: AppSettings = { ...current, theme }
  await saveSettings(next)
  return next
}

export async function setAutoDiscoverEmulator(autoDiscoverEmulator: boolean): Promise<AppSettings> {
  const current = await loadSettings()
  const next: AppSettings = { ...current, autoDiscoverEmulator }
  await saveSettings(next)
  return next
}
