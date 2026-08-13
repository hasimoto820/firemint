import type { Locale } from '@shared/i18n/shared/types'
import { DEFAULT_LOCALE, isLocale } from '@shared/i18n/shared/types'

export const THEMES = ['dark', 'light'] as const

export type Theme = (typeof THEMES)[number]

export type AppSettings = {
  version: 1
  locale: Locale
  theme: Theme
}

export const DEFAULT_THEME: Theme = 'dark'

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  locale: DEFAULT_LOCALE,
  theme: DEFAULT_THEME
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

export function normalizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const record = raw as Partial<AppSettings>
  return {
    version: 1,
    locale: isLocale(record.locale) ? record.locale : DEFAULT_LOCALE,
    theme: isTheme(record.theme) ? record.theme : DEFAULT_THEME
  }
}

export function applyThemeToDocument(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}
