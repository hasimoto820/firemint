/**
 * ショートカット定義の正。React / IPC は知らない。
 * 1発目は着地・エリア巡回・Palette / タブを閉じる。エリア内 Tab 閉路は後回し。
 */

export const SHORTCUT_ACTIONS = [
  'menu',
  'projects',
  'collections',
  'auth',
  'page_tabs_1',
  'page_tabs_2',
  'settings',
  'results',
  'next_area',
  'prev_area',
  'palette',
  'close_tab'
] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]

function isModifiedLetter(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

/**
 * keydown から動作を決める。Alt 単独（メニュー）は keyup 側。
 */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const ctrl = isModifiedLetter(event)

  if (ctrl && !event.altKey && key === 'Tab') {
    return event.shiftKey ? 'prev_area' : 'next_area'
  }

  if (!ctrl || event.altKey || event.shiftKey) {
    return null
  }

  switch (key) {
    case 't':
      return 'projects'
    case 'g':
      return 'collections'
    case 'b':
      return 'auth'
    case '1':
      return 'page_tabs_1'
    case '2':
      return 'page_tabs_2'
    case 'h':
      return 'settings'
    case 'n':
      return 'results'
    case 'p':
      return 'palette'
    case 'w':
      return 'close_tab'
    default:
      return null
  }
}

function isMacPlatform(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.electron.process.platform === 'darwin'
}

/** メニュー右端の表示。Ctrl+P / Ctrl+W 用。 */
export function shortcutLabel(letter: string): string {
  const upper = letter.toUpperCase()
  return isMacPlatform() ? `⌘${upper}` : `Ctrl+${upper}`
}
