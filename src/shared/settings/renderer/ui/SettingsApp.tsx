import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import {
  LOCALES,
  LOCALE_LABEL_KEYS,
  type Locale
} from '@shared/i18n/shared/types'
import { THEMES, type Theme } from '@shared/settings/shared/types'

/**
 * 別ウィンドウ用の Settings。言語とテーマ。
 */
function SettingsApp(): React.JSX.Element {
  const { t, locale, setLocale, theme, setTheme, ready } = useI18n()

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
    </div>
  )
}

export default SettingsApp
