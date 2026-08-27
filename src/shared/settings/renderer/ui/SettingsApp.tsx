import { useEffect, useState } from 'react'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import {
  LOCALES,
  LOCALE_LABEL_KEYS,
  type Locale
} from '@shared/i18n/shared/types'
import {
  DEFAULT_SETTINGS,
  THEMES,
  type Theme
} from '@shared/settings/shared/types'
import Button from '@shared/ui/Button'

/**
 * 別ウィンドウ用の Settings。言語とテーマと起動時 Discover。
 */
function SettingsApp(): React.JSX.Element {
  const { t, locale, setLocale, theme, setTheme, ready } = useI18n()
  const [autoDiscoverEmulator, setAutoDiscoverEmulatorState] = useState(
    DEFAULT_SETTINGS.autoDiscoverEmulator
  )
  const [logsPath, setLogsPath] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.api.settings.get().then((settings) => {
      if (!cancelled) {
        setAutoDiscoverEmulatorState(settings.autoDiscoverEmulator)
      }
    })

    void window.api.settings.getLogsPath().then((path) => {
      if (!cancelled) {
        setLogsPath(path)
      }
    })

    const unsubscribe = window.api.settings.onChanged((settings) => {
      setAutoDiscoverEmulatorState(settings.autoDiscoverEmulator)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const handleOpenLogsFolder = (): void => {
    setLogsError(null)
    void window.api.settings.openLogsFolder().then((result) => {
      if (!result.ok) {
        setLogsError(result.error)
        return
      }
      setLogsPath(result.path)
    })
  }

  if (!ready) {
    return (
      <div className="settings-window">
        <p className="settings-window__busy">{t('common.busy')}</p>
      </div>
    )
  }

  return (
    <div className="settings-window">
      <header className="settings-window__header">
        <h1 className="settings-window__title">{t('settings.title')}</h1>
        <p className="settings-window__lead">{t('settings.lead')}</p>
      </header>

      <section className="settings-window__section">
        <h2 className="settings-window__section-title">{t('settings.language')}</h2>
        <div className="settings-window__options" role="radiogroup" aria-label={t('settings.language')}>
          {LOCALES.map((item) => (
            <label key={item} className="settings-window__option">
              <input
                type="radio"
                name="locale"
                value={item}
                checked={locale === item}
                onChange={() => void setLocale(item as Locale)}
              />
              <span>{t(LOCALE_LABEL_KEYS[item])}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-window__section">
        <h2 className="settings-window__section-title">{t('settings.theme')}</h2>
        <div className="settings-window__options" role="radiogroup" aria-label={t('settings.theme')}>
          {THEMES.map((item) => (
            <label key={item} className="settings-window__option">
              <input
                type="radio"
                name="theme"
                value={item}
                checked={theme === item}
                onChange={() => void setTheme(item as Theme)}
              />
              <span>{t(`settings.theme.${item}`)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-window__section">
        <h2 className="settings-window__section-title">{t('menu.emulator')}</h2>
        <div className="settings-window__options">
          <label className="settings-window__option">
            <input
              type="checkbox"
              checked={autoDiscoverEmulator}
              onChange={(event) => {
                const next = event.target.checked
                setAutoDiscoverEmulatorState(next)
                void window.api.settings.setAutoDiscoverEmulator(next)
              }}
            />
            <span>{t('settings.auto_discover')}</span>
          </label>
        </div>
      </section>

      <section className="settings-window__section">
        <h2 className="settings-window__section-title">{t('settings.logs')}</h2>
        <p className="settings-window__hint">{t('settings.logs_hint')}</p>
        {logsPath && <p className="settings-window__path">{logsPath}</p>}
        <Button onClick={handleOpenLogsFolder}>{t('settings.open_logs_folder')}</Button>
        {logsError && <p className="settings-window__path">{logsError}</p>}
      </section>
    </div>
  )
}

export default SettingsApp
