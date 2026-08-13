import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createTranslator } from '@shared/i18n/shared/translate'
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type MessageParams,
  type TranslateFn
} from '@shared/i18n/shared/types'
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  THEMES,
  type Theme
} from '@shared/settings/shared/types'

type I18nContextValue = {
  locale: Locale
  theme: Theme
  ready: boolean
  t: TranslateFn
  setLocale: (locale: Locale) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  locales: readonly Locale[]
  themes: readonly Theme[]
}

const I18nContext = createContext<I18nContextValue | null>(null)

type I18nProviderProps = {
  children: React.ReactNode
}

export function I18nProvider({ children }: I18nProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const settings = await window.api.settings.get()
        if (!cancelled) {
          setLocaleState(settings.locale)
          setThemeState(settings.theme)
          applyThemeToDocument(settings.theme)
        }
      } catch {
        if (!cancelled) {
          setLocaleState(DEFAULT_LOCALE)
          setThemeState(DEFAULT_THEME)
          applyThemeToDocument(DEFAULT_THEME)
        }
      } finally {
        if (!cancelled) {
          setReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return window.api.settings.onChanged((settings) => {
      setLocaleState(settings.locale)
      setThemeState(settings.theme)
      applyThemeToDocument(settings.theme)
    })
  }, [])

  const setLocale = useCallback(async (next: Locale): Promise<void> => {
    setLocaleState(next)
    await window.api.settings.setLocale(next)
  }, [])

  const setTheme = useCallback(async (next: Theme): Promise<void> => {
    setThemeState(next)
    applyThemeToDocument(next)
    await window.api.settings.setTheme(next)
  }, [])

  const t = useMemo(() => createTranslator(locale), [locale])

  const value = useMemo(
    (): I18nContextValue => ({
      locale,
      theme,
      ready,
      t,
      setLocale,
      setTheme,
      locales: LOCALES,
      themes: THEMES
    }),
    [locale, theme, ready, t, setLocale, setTheme]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return value
}

export function useT(): TranslateFn {
  return useI18n().t
}

export type { MessageParams, TranslateFn, Locale, Theme }
