import { BrowserWindow } from 'electron'
import type { Theme } from '@shared/settings/shared/types'

const TITLE_BAR_HEIGHT = 32

export function windowBackgroundColor(theme: Theme): string {
  return theme === 'light' ? '#f4f4f5' : '#1b1b1f'
}

export function titleBarOverlayOptions(theme: Theme): {
  color: string
  symbolColor: string
  height: number
} {
  if (theme === 'light') {
    return {
      color: '#ffffff',
      symbolColor: '#1b1b1f',
      height: TITLE_BAR_HEIGHT
    }
  }

  return {
    color: '#222222',
    symbolColor: '#ebebf5',
    height: TITLE_BAR_HEIGHT
  }
}

/** Windows titleBarOverlay と背景色をテーマに合わせる */
export function applyThemeToWindows(theme: Theme): void {
  const backgroundColor = windowBackgroundColor(theme)
  const overlay = titleBarOverlayOptions(theme)

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.setBackgroundColor(backgroundColor)
    if (process.platform === 'win32') {
      try {
        window.setTitleBarOverlay(overlay)
      } catch {
        // native-frame ウィンドウ（Settings など）は overlay 非対応
      }
    }
  }
}
