import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useEffect, useState } from 'react'

function WindowControls(): React.JSX.Element {
  const { t } = useI18n()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setIsMaximized)
  }, [])

  const handleMaximizeToggle = async (): Promise<void> => {
    const maximized = await window.api.window.maximizeToggle()
    setIsMaximized(maximized)
  }

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__button"
        aria-label={t('menu.minimize')}
        onClick={() => void window.api.window.minimize()}
      >
        <span className="window-controls__icon window-controls__icon--minimize" />
      </button>
      <button
        type="button"
        className="window-controls__button"
        aria-label={isMaximized ? t('ui.restore') : t('ui.maximize')}
        onClick={() => void handleMaximizeToggle()}
      >
        <span
          className={
            isMaximized
              ? 'window-controls__icon window-controls__icon--restore'
              : 'window-controls__icon window-controls__icon--maximize'
          }
        />
      </button>
      <button
        type="button"
        className="window-controls__button window-controls__button--close"
        aria-label={t('ui.close')}
        onClick={() => void window.api.window.close()}
      >
        <span className="window-controls__icon window-controls__icon--close" />
      </button>
    </div>
  )
}

export default WindowControls
