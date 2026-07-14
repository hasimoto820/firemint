import type { AppView } from '@shared/shell/AppNav'
import type { AppMenuSection } from './app_menu'

export const FIREMINT_DOCS_URL = 'https://electron-vite.org'

/**
 * 画面（Explorer など）から登録される、文脈依存メニューの状態とハンドラ。
 * 何も登録されていない場合は null。
 */
export type AppMenuContextActions = {
  canCreate: boolean
  canSave: boolean
  canDuplicate: boolean
  canDelete: boolean
  canExport: boolean
  canDuplicateCollection: boolean
  onCreate?: () => void
  onSave?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onExport?: () => void
  onDuplicateCollection?: () => void
}

export type AppShellMenuActions = {
  openCommandPalette?: () => void
  toggleSplit?: () => void
  closeActiveTab?: () => void
  closeOtherTabs?: () => void
  canCloseTab?: boolean
  canCloseOtherTabs?: boolean
  splitEnabled?: boolean
}

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
  context?: AppMenuContextActions | null
  shell?: AppShellMenuActions | null
}

export function buildAppMenus(handlers: AppMenuHandlers): AppMenuSection[] {
  const showWindowItems = Boolean(handlers.onMinimize && handlers.onMaximizeToggle)
  const context = handlers.context ?? null
  const shell = handlers.shell ?? null

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
        {
          type: 'item',
          id: 'file-export',
          label: 'エクスポート…',
          disabled: !context?.canExport,
          onClick: context?.onExport
        },
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
        { type: 'header', label: 'ドキュメント' },
        {
          type: 'item',
          id: 'edit-new',
          label: '新規',
          shortcut: 'Ctrl+N',
          indent: true,
          disabled: !context?.canCreate,
          onClick: context?.onCreate
        },
        {
          type: 'item',
          id: 'edit-save',
          label: '保存',
          shortcut: 'Ctrl+S',
          indent: true,
          disabled: !context?.canSave,
          onClick: context?.onSave
        },
        {
          type: 'item',
          id: 'edit-duplicate',
          label: '複製',
          indent: true,
          disabled: !context?.canDuplicate,
          onClick: context?.onDuplicate
        },
        {
          type: 'item',
          id: 'edit-delete',
          label: '削除',
          shortcut: 'Del',
          indent: true,
          disabled: !context?.canDelete,
          onClick: context?.onDelete
        },
        { type: 'header', label: 'コレクション' },
        {
          type: 'item',
          id: 'edit-duplicate-collection',
          label: '複製',
          indent: true,
          disabled: !context?.canDuplicateCollection,
          onClick: context?.onDuplicateCollection
        }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          type: 'item',
          id: 'view-explorer',
          label: handlers.activeView === 'explorer' ? 'Simple ✓' : 'Simple',
          disabled: !handlers.connected,
          onClick: () => handlers.onNavigate('explorer')
        },
        {
          type: 'item',
          id: 'view-query',
          label: handlers.activeView === 'query' ? 'Query ✓' : 'Query',
          disabled: !handlers.connected,
          onClick: () => handlers.onNavigate('query')
        },
        { type: 'separator' },
        {
          type: 'item',
          id: 'view-command-palette',
          label: 'Command Palette…',
          shortcut: 'Ctrl+P',
          disabled: !handlers.connected,
          onClick: shell?.openCommandPalette
        },
        {
          type: 'item',
          id: 'view-split',
          label: shell?.splitEnabled ? 'Split View ✓' : 'Split View',
          disabled: !handlers.connected,
          onClick: shell?.toggleSplit
        }
      ]
    },
    {
      id: 'tab',
      label: 'Tab',
      items: [
        {
          type: 'item',
          id: 'tab-close',
          label: 'タブを閉じる',
          shortcut: 'Ctrl+W',
          disabled: !shell?.canCloseTab,
          onClick: shell?.closeActiveTab
        },
        {
          type: 'item',
          id: 'tab-close-others',
          label: '他のタブを閉じる',
          disabled: !shell?.canCloseOtherTabs,
          onClick: shell?.closeOtherTabs
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
