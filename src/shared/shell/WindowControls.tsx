import { useEffect, useState } from 'react'

function WindowControls(): React.JSX.Element {
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
        aria-label="Minimize"
        onClick={() => void window.api.window.minimize()}
      >
        <span className="window-controls__icon window-controls__icon--minimize" />
      </button>
      <button
        type="button"
        className="window-controls__button"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
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
        aria-label="Close"
        onClick={() => void window.api.window.close()}
      >
        <span className="window-controls__icon window-controls__icon--close" />
      </button>
    </div>
  )
}

export default WindowControls
