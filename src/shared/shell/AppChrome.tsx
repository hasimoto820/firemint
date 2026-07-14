import type { ReactNode } from 'react'
import type { AppMenuSection } from './app_menu'
import AppTitleBar from './AppTitleBar'

type AppChromeProps = {
  title?: string
  menus: AppMenuSection[]
  children: ReactNode
}

function AppChrome({ title, menus, children }: AppChromeProps): React.JSX.Element {
  const platform = window.electron.process.platform

  return (
    <div className={`app-chrome app-chrome--${platform}`}>
      <AppTitleBar title={title} menus={menus} />
      <div className="app-chrome__content">{children}</div>
    </div>
  )
}

export default AppChrome
