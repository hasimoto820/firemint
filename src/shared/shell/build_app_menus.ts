import type { ImpExpIntent } from '@features/data_transfer/shared/imp_exp'
import type { AppView } from '@shared/shell/AppNav'
import type { TranslateFn } from '@shared/i18n/shared/types'
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
  canImport: boolean
  canCreateCollection: boolean
  canRenameCollection: boolean
  canDuplicateCollection: boolean
  canDeleteCollection: boolean
  canCreateSubcollection: boolean
  canRenameSubcollection: boolean
  canDuplicateSubcollection: boolean
  canDeleteSubcollection: boolean
  canCreateFieldBulk: boolean
  canUpdateFieldBulk: boolean
  canRenameFieldBulk: boolean
  canDeleteFieldBulk: boolean
  onCreate?: () => void
  onSave?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onExport?: () => void
  onImport?: () => void
  onCreateCollection?: () => void
  onRenameCollection?: () => void
  onDuplicateCollection?: () => void
  onDeleteCollection?: () => void
  onCreateSubcollection?: () => void
  onRenameSubcollection?: () => void
  onDuplicateSubcollection?: () => void
  onDeleteSubcollection?: () => void
  onCreateFieldBulk?: () => void
  onUpdateFieldBulk?: () => void
  onRenameFieldBulk?: () => void
  onDeleteFieldBulk?: () => void
}

export type AppShellMenuActions = {
  openCommandPalette?: () => void
  openImpExp?: (intent?: ImpExpIntent) => void
  toggleSplit?: () => void
  closeActiveTab?: () => void
  closeOtherTabs?: () => void
  canCloseTab?: boolean
  canCloseOtherTabs?: boolean
  splitEnabled?: boolean
  impExpActive?: boolean
}

export type AppMenuHandlers = {
  connected: boolean
  /** フォーカス中プロジェクトをツリーから外せるとき */
  canDisconnect?: boolean
  activeView: AppView
  onDisconnect: () => void
  onNavigate: (view: AppView) => void
  onQuit: () => void
  onAbout: () => void
  onOpenDocs: () => void
  onExportProject?: () => void
  onImportProject?: () => void
  /** 名簿に行き先プロジェクトがあるとき true（接続中でなくてよい） */
  canImportProject?: boolean
  onListConnect?: () => void
  canListConnect?: boolean
  onGoogleConnect?: () => void
  onJsonConnect?: () => void
  onEmulatorConnect?: () => void
  onMinimize?: () => void
  onMaximizeToggle?: () => void
  context?: AppMenuContextActions | null
  shell?: AppShellMenuActions | null
  t: TranslateFn
  onOpenSettings: () => void
}

export function buildAppMenus(handlers: AppMenuHandlers): AppMenuSection[] {
  const showWindowItems = Boolean(handlers.onMinimize && handlers.onMaximizeToggle)
  const context = handlers.context ?? null
  const shell = handlers.shell ?? null
  const t = handlers.t

  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { type: 'header', label: t('menu.import') },
        {
          type: 'item',
          id: 'file-import-project',
          label: t('menu.project'),
          indent: true,
          disabled: !(handlers.canImportProject ?? handlers.connected),
          onClick: () => {
            if (shell?.openImpExp) {
              shell.openImpExp({ direction: 'import', target: 'project' })
              return
            }
            handlers.onImportProject?.()
          }
        },
        {
          type: 'item',
          id: 'file-import',
          label: t('menu.collection'),
          indent: true,
          disabled: !handlers.connected,
          onClick: () => shell?.openImpExp?.({ direction: 'import', target: 'collection' })
        },
        { type: 'header', label: t('menu.export') },
        {
          type: 'item',
          id: 'file-export-project',
          label: t('menu.project'),
          indent: true,
          disabled: !handlers.connected,
          onClick: () => shell?.openImpExp?.({ direction: 'export', target: 'project' })
        },
        {
          type: 'item',
          id: 'file-export',
          label: t('menu.collection'),
          indent: true,
          disabled: !handlers.connected,
          onClick: () => shell?.openImpExp?.({ direction: 'export', target: 'collection' })
        },
        { type: 'separator' },
        { type: 'header', label: t('menu.connection') },
        {
          type: 'item',
          id: 'file-list-connect',
          label: t('menu.connect_list'),
          indent: true,
          disabled: !(handlers.canListConnect ?? false),
          onClick: handlers.onListConnect
        },
        {
          type: 'item',
          id: 'file-json-connect',
          label: t('menu.connect_json'),
          indent: true,
          disabled: !handlers.onJsonConnect,
          onClick: handlers.onJsonConnect
        },
        {
          type: 'item',
          id: 'file-google-connect',
          label: t('menu.connect_google'),
          indent: true,
          disabled: !handlers.onGoogleConnect,
          onClick: handlers.onGoogleConnect
        },
        {
          type: 'item',
          id: 'file-emulator-connect',
          label: t('menu.connect_emulator'),
          indent: true,
          disabled: !handlers.onEmulatorConnect,
          onClick: handlers.onEmulatorConnect
        },
        {
          type: 'item',
          id: 'file-disconnect',
          label: t('menu.disconnect'),
          indent: true,
          disabled: !(handlers.canDisconnect ?? handlers.connected),
          onClick: handlers.onDisconnect
        },
        { type: 'separator' },
        {
          type: 'item',
          id: 'file-quit',
          label: t('menu.quit'),
          shortcut: 'Alt+F4',
          onClick: handlers.onQuit
        }
      ]
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { type: 'header', label: t('menu.collection') },
        {
          type: 'item',
          id: 'edit-create-collection',
          label: t('menu.new'),
          indent: true,
          disabled: !context?.canCreateCollection,
          onClick: context?.onCreateCollection
        },
        {
          type: 'item',
          id: 'edit-rename-collection',
          label: t('menu.rename'),
          indent: true,
          disabled: !context?.canRenameCollection,
          onClick: context?.onRenameCollection
        },
        {
          type: 'item',
          id: 'edit-duplicate-collection',
          label: t('menu.duplicate'),
          indent: true,
          disabled: !context?.canDuplicateCollection,
          onClick: context?.onDuplicateCollection
        },
        {
          type: 'item',
          id: 'edit-delete-collection',
          label: t('common.delete'),
          indent: true,
          disabled: !context?.canDeleteCollection,
          onClick: context?.onDeleteCollection
        },
        { type: 'header', label: t('menu.subcollection') },
        {
          type: 'item',
          id: 'edit-subcollection-create',
          label: t('menu.new'),
          indent: true,
          disabled: !context?.canCreateSubcollection,
          onClick: context?.onCreateSubcollection
        },
        {
          type: 'item',
          id: 'edit-subcollection-rename',
          label: t('menu.rename'),
          indent: true,
          disabled: !context?.canRenameSubcollection,
          onClick: context?.onRenameSubcollection
        },
        {
          type: 'item',
          id: 'edit-subcollection-duplicate',
          label: t('menu.duplicate'),
          indent: true,
          disabled: !context?.canDuplicateSubcollection,
          onClick: context?.onDuplicateSubcollection
        },
        {
          type: 'item',
          id: 'edit-subcollection-delete',
          label: t('common.delete'),
          indent: true,
          disabled: !context?.canDeleteSubcollection,
          onClick: context?.onDeleteSubcollection
        },
        { type: 'header', label: t('menu.documents') },
        {
          type: 'item',
          id: 'edit-new',
          label: t('menu.new'),
          shortcut: 'Ctrl+N',
          indent: true,
          disabled: !context?.canCreate,
          onClick: context?.onCreate
        },
        {
          type: 'item',
          id: 'edit-save',
          label: t('common.save'),
          shortcut: 'Ctrl+S',
          indent: true,
          disabled: !context?.canSave,
          onClick: context?.onSave
        },
        {
          type: 'item',
          id: 'edit-duplicate',
          label: t('menu.duplicate'),
          indent: true,
          disabled: !context?.canDuplicate,
          onClick: context?.onDuplicate
        },
        {
          type: 'item',
          id: 'edit-delete',
          label: t('common.delete'),
          shortcut: 'Del',
          indent: true,
          disabled: !context?.canDelete,
          onClick: context?.onDelete
        },
        { type: 'header', label: t('menu.rename_field_bulk') },
        {
          type: 'item',
          id: 'edit-field-bulk-create',
          label: t('menu.new'),
          indent: true,
          disabled: !context?.canCreateFieldBulk,
          onClick: context?.onCreateFieldBulk
        },
        {
          type: 'item',
          id: 'edit-field-bulk-update',
          label: t('menu.update_field_value'),
          indent: true,
          disabled: !context?.canUpdateFieldBulk,
          onClick: context?.onUpdateFieldBulk
        },
        {
          type: 'item',
          id: 'edit-field-bulk-rename',
          label: t('menu.rename'),
          indent: true,
          disabled: !context?.canRenameFieldBulk,
          onClick: context?.onRenameFieldBulk
        },
        {
          type: 'item',
          id: 'edit-field-bulk-delete',
          label: t('common.delete'),
          indent: true,
          disabled: !context?.canDeleteFieldBulk,
          onClick: context?.onDeleteFieldBulk
        }
      ]
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          type: 'item',
          id: 'view-simple',
          label: !shell?.impExpActive && handlers.activeView === 'simple' ? 'Simple ✓' : 'Simple',
          disabled: !handlers.connected || Boolean(shell?.impExpActive),
          onClick: () => handlers.onNavigate('simple')
        },
        {
          type: 'item',
          id: 'view-query',
          label: !shell?.impExpActive && handlers.activeView === 'query' ? 'Query ✓' : 'Query',
          disabled: !handlers.connected || Boolean(shell?.impExpActive),
          onClick: () => handlers.onNavigate('query')
        },
        { type: 'separator' },
        {
          type: 'item',
          id: 'view-imp-exp',
          label: shell?.impExpActive ? 'Imp/Exp ✓' : 'Imp/Exp',
          disabled: !handlers.connected,
          onClick: shell?.openImpExp
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
      id: 'settings',
      label: t('menu.settings'),
      items: [
        {
          type: 'item',
          id: 'settings-open',
          label: t('menu.settings_open'),
          onClick: handlers.onOpenSettings
        }
      ]
    },
    {
      id: 'tab',
      label: t('menu.tab'),
      items: [
        {
          type: 'item',
          id: 'tab-close',
          label: t('menu.close_tab'),
          shortcut: 'Ctrl+W',
          disabled: !shell?.canCloseTab,
          onClick: shell?.closeActiveTab
        },
        {
          type: 'item',
          id: 'tab-close-others',
          label: t('menu.close_other_tabs'),
          disabled: !shell?.canCloseOtherTabs,
          onClick: shell?.closeOtherTabs
        }
      ]
    },
    {
      id: 'window',
      label: t('menu.window'),
      items: [
        {
          type: 'item',
          id: 'window-minimize',
          label: t('menu.minimize'),
          disabled: !showWindowItems,
          onClick: handlers.onMinimize
        },
        {
          type: 'item',
          id: 'window-zoom',
          label: t('menu.zoom'),
          disabled: !showWindowItems,
          onClick: handlers.onMaximizeToggle
        }
      ]
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [
        {
          type: 'item',
          id: 'help-about',
          label: t('menu.about'),
          onClick: handlers.onAbout
        },
        {
          type: 'item',
          id: 'help-docs',
          label: t('menu.docs'),
          onClick: handlers.onOpenDocs
        }
      ]
    }
  ]
}
