import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@shared/i18n/renderer/I18nProvider'
import SettingsApp from '@shared/settings/renderer/ui/SettingsApp'
import App from './App'

const isSettingsWindow = window.location.hash.startsWith('#/settings')

if (isSettingsWindow) {
  document.documentElement.classList.add('settings-window-root')
  document.body.classList.add('settings-window-root')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {isSettingsWindow ? <SettingsApp /> : <App />}
    </I18nProvider>
  </StrictMode>
)
