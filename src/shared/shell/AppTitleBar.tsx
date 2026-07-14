import AppMenuBar from './AppMenuBar'
import WindowControls from './WindowControls'
import type { AppMenuSection } from './app_menu'

type AppTitleBarProps = {
  title?: string
  menus: AppMenuSection[]
}

function AppTitleBar({ title = 'FireMint', menus }: AppTitleBarProps): React.JSX.Element {
  const platform = window.electron.process.platform
  const showWindowControls = platform === 'linux'

  const handleDragDoubleClick = (): void => {
    if (platform === 'linux') {
      void window.api.window.maximizeToggle()
    }
  }

  return (
    <div className={`app-title-bar app-title-bar--${platform}`}>
      <AppMenuBar menus={menus} />
      <div
        className="app-title-bar__drag"
        onDoubleClick={handleDragDoubleClick}
        title={title}
      >
        <span className="app-title-bar__title">{title}</span>
      </div>
      {showWindowControls && <WindowControls />}
    </div>
  )
}

export default AppTitleBar
