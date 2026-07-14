import type { AppView } from '@shared/shell/AppNav'
import type { AppMenuSection } from './app_menu'

export const FIREMINT_DOCS_URL = 'https://electron-vite.org'

export type AppMenuHandlers = {
  connected: boolean
  activeView: AppView
  onDisconnect: () => void
  onNavigate: (view: AppView) => void
  onQuit: () => void
  onAbout: () => void
  onOpenDocs: () => void
  onMinimize?: () => void
  onMaximizeToggle?: () => void
}

export function buildAppMenus(handlers: AppMenuHandlers): AppMenuSection[] {
  const showWindowItems = Boolean(handlers.onMinimize && handlers.onMaximizeToggle)

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          type: 'item',
          id: 'file-disconnect',
          label: '切断',
          disabled: !handlers.connected,
          onClick: handlers.onDisconnect
        },
        { type: 'item', id: 'file-export', label: 'エクスポート…', disabled: true },
        { type: 'separator' },
        {
          type: 'item',
          id: 'file-quit',
          label: '終了',
          shortcut: 'Alt+F4',
          onClick: handlers.onQuit
        }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { type: 'item', id: 'edit-new', label: '新規ドキュメント', shortcut: 'Ctrl+N', disabled: true },
        { type: 'item', id: 'edit-save', label: '保存', shortcut: 'Ctrl+S', disabled: true },
        { type: 'item', id: 'edit-duplicate', label: '複製', disabled: true },
        { type: 'separator' },
        { type: 'item', id: 'edit-delete', label: '削除', shortcut: 'Del', disabled: true }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          type: 'item',
          id: 'view-explorer',
          label: handlers.activeView === 'explorer' ? 'Explorer ✓' : 'Explorer',
          disabled: !handlers.connected,
          onClick: () => handlers.onNavigate('explorer')
        },
        {
          type: 'item',
          id: 'view-query',
          label: handlers.activeView === 'query' ? 'Query ✓' : 'Query',
          disabled: !handlers.connected,
          onClick: () => handlers.onNavigate('query')
        }
      ]
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        {
          type: 'item',
          id: 'window-minimize',
          label: '最小化',
          disabled: !showWindowItems,
          onClick: handlers.onMinimize
        },
        {
          type: 'item',
          id: 'window-zoom',
          label: 'ズーム',
          disabled: !showWindowItems,
          onClick: handlers.onMaximizeToggle
        }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          type: 'item',
          id: 'help-about',
          label: 'FireMint について',
          onClick: handlers.onAbout
        },
        {
          type: 'item',
          id: 'help-docs',
          label: 'ドキュメント',
          onClick: handlers.onOpenDocs
        }
      ]
    }
  ]
}
