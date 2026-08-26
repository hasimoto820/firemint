import { useEffect, useMemo, useState } from 'react'
import { useT } from '@shared/i18n/renderer/I18nProvider'
import {
  buildTabBarItems,
  TAB_GROUP_COLORS,
  type TabDragSource,
  type TabDropDest,
  type TabGroupColor,
  type WorkspaceTabGroup
} from './tab_group'
import { isWorkspaceToolTab, workspaceTabLabel, type WorkspaceTab } from './workspace_tab'

type TabBarProps = {
  tabs: WorkspaceTab[]
  groups: WorkspaceTabGroup[]
  activeTabId: string | null
  ariaLabel?: string
  impExpBusy?: boolean
  projectLabelFor?: (projectId: string) => string
  showProjectLabel?: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onDrop: (source: TabDragSource, dest: TabDropDest) => void
  onCreateGroup: (tabId: string) => void
  onJoinGroup: (tabId: string, groupId: string) => void
  onLeaveGroup: (tabId: string) => void
  onCloseGroup: (groupId: string) => void
  onUngroup: (groupId: string) => void
  onRenameGroup: (groupId: string, title: string) => void
  onSetGroupColor: (groupId: string, color: TabGroupColor) => void
  onToggleGroupCollapsed: (groupId: string) => void
}

type ContextMenuState =
  | { kind: 'tab'; tabId: string; x: number; y: number }
  | { kind: 'group'; groupId: string; x: number; y: number }

type DragOverState = {
  key: string
  place: 'before' | 'after' | 'into'
}

const DRAG_MIME = 'application/x-firemint-tab-drag'

function readDragSource(event: React.DragEvent): TabDragSource | null {
  const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain')
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as TabDragSource
    if (parsed.type === 'tab' && typeof parsed.tabId === 'string') {
      return parsed
    }
    if (parsed.type === 'group' && typeof parsed.groupId === 'string') {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function dropPlaceFromEvent(
  event: React.DragEvent,
  allowInto: boolean
): 'before' | 'after' | 'into' {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = rect.width <= 0 ? 0.5 : (event.clientX - rect.left) / rect.width
  if (allowInto && ratio > 0.28 && ratio < 0.72) {
    return 'into'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

function TabItem({
  tab,
  active,
  label,
  title,
  busy,
  dropKey,
  dragOver,
  onActivate,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  tab: WorkspaceTab
  active: boolean
  label: string
  title: string
  busy: boolean
  dropKey: string
  dragOver: DragOverState | null
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onContextMenu: (event: React.MouseEvent, tabId: string) => void
  onDragStart: (event: React.DragEvent, source: TabDragSource) => void
  onDragOver: (event: React.DragEvent, key: string, allowInto: boolean) => void
  onDrop: (event: React.DragEvent, dest: TabDropDest) => void
  onDragEnd: () => void
}): React.JSX.Element {
  const className = [
    'tab-bar__tab',
    active ? 'tab-bar__tab--active' : '',
    isWorkspaceToolTab(tab) ? 'tab-bar__tab--imp-exp' : '',
    isWorkspaceToolTab(tab) && busy ? 'tab-bar__tab--busy' : '',
    dragOver?.key === dropKey && dragOver.place === 'before' ? 'tab-bar__tab--drop-before' : '',
    dragOver?.key === dropKey && dragOver.place === 'after' ? 'tab-bar__tab--drop-after' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      role="tab"
      aria-selected={active}
      title={title}
      draggable
      onDragStart={(event) => {
        event.stopPropagation()
        onDragStart(event, { type: 'tab', tabId: tab.id })
      }}
      onDragOver={(event) => {
        event.stopPropagation()
        onDragOver(event, dropKey, false)
      }}
      onDrop={(event) => {
        event.stopPropagation()
        const place = dropPlaceFromEvent(event, false)
        onDrop(event, {
          type: 'tab',
          tabId: tab.id,
          place: place === 'into' ? 'after' : place
        })
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => onContextMenu(event, tab.id)}
    >
      <button type="button" className="tab-bar__label" onClick={() => onActivate(tab.id)}>
        <span className="tab-bar__name">{label}</span>
        {isWorkspaceToolTab(tab) ? null : (
          <span className="tab-bar__mode">{tab.view === 'query' ? 'Q' : 'S'}</span>
        )}
      </button>
      <button
        type="button"
        className="tab-bar__close"
        aria-label={`${label} を閉じる`}
        draggable={false}
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab.id)
        }}
      >
        ×
      </button>
    </div>
  )
}

function TabBar({
  tabs,
  groups,
  activeTabId,
  ariaLabel = 'コレクションタブ',
  impExpBusy = false,
  projectLabelFor,
  showProjectLabel = false,
  onActivate,
  onClose,
  onDrop,
  onCreateGroup,
  onJoinGroup,
  onLeaveGroup,
  onCloseGroup,
  onUngroup,
  onRenameGroup,
  onSetGroupColor,
  onToggleGroupCollapsed
}: TabBarProps): React.JSX.Element {
  const t = useT()
  const [dragOver, setDragOver] = useState<DragOverState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const paneGroups = useMemo(
    () => groups.filter((group) => tabs.some((tab) => tab.groupId === group.id)),
    [groups, tabs]
  )
  const items = useMemo(() => buildTabBarItems(tabs, paneGroups), [tabs, paneGroups])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const close = (): void => setContextMenu(null)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  if (tabs.length === 0) {
    return <div className="tab-bar tab-bar--empty" />
  }

  const tabMeta = (tab: WorkspaceTab): { label: string; title: string } => {
    const projectLabel =
      showProjectLabel && !isWorkspaceToolTab(tab) ? projectLabelFor?.(tab.projectId) : undefined
    const label = workspaceTabLabel(tab, projectLabel)
    const title = isWorkspaceToolTab(tab)
      ? label
      : projectLabel
        ? `${tab.projectId} / ${tab.collectionPath}`
        : tab.collectionPath
    return { label, title }
  }

  const handleDragStart = (event: React.DragEvent, source: TabDragSource): void => {
    const payload = JSON.stringify(source)
    event.dataTransfer.setData(DRAG_MIME, payload)
    event.dataTransfer.setData('text/plain', payload)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event: React.DragEvent, key: string, allowInto: boolean): void => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const place = dropPlaceFromEvent(event, allowInto)
    setDragOver((current) =>
      current?.key === key && current.place === place ? current : { key, place }
    )
  }

  const handleDrop = (event: React.DragEvent, dest: TabDropDest): void => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(null)
    const source = readDragSource(event)
    if (!source) {
      return
    }
    onDrop(source, dest)
  }

  const handleDragEnd = (): void => {
    setDragOver(null)
  }

  const openTabMenu = (event: React.MouseEvent, tabId: string): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ kind: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openGroupMenu = (event: React.MouseEvent, groupId: string): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ kind: 'group', groupId, x: event.clientX, y: event.clientY })
  }

  const startRename = (group: WorkspaceTabGroup): void => {
    setEditingGroupId(group.id)
    setEditingTitle(group.title)
    setContextMenu(null)
  }

  const commitRename = (): void => {
    if (!editingGroupId) {
      return
    }
    onRenameGroup(editingGroupId, editingTitle.trim())
    setEditingGroupId(null)
  }

  const contextTab = contextMenu?.kind === 'tab' ? tabs.find((tab) => tab.id === contextMenu.tabId) : null
  const contextGroup =
    contextMenu?.kind === 'group'
      ? paneGroups.find((group) => group.id === contextMenu.groupId)
      : contextTab?.groupId
        ? paneGroups.find((group) => group.id === contextTab.groupId)
        : null

  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        if (item.type === 'tab') {
          const { label, title } = tabMeta(item.tab)
          return (
            <TabItem
              key={item.tab.id}
              tab={item.tab}
              active={item.tab.id === activeTabId}
              label={label}
              title={title}
              busy={impExpBusy}
              dropKey={`tab:${item.tab.id}`}
              dragOver={dragOver}
              onActivate={onActivate}
              onClose={onClose}
              onContextMenu={openTabMenu}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          )
        }

        const groupActive = item.tabs.some((tab) => tab.id === activeTabId)
        const groupClass = [
          'tab-bar__group',
          `tab-bar__group--${item.group.color}`,
          item.group.collapsed ? 'tab-bar__group--collapsed' : '',
          groupActive ? 'tab-bar__group--active' : '',
          dragOver?.key === `group:${item.group.id}` && dragOver.place === 'before'
            ? 'tab-bar__group--drop-before'
            : '',
          dragOver?.key === `group:${item.group.id}` && dragOver.place === 'after'
            ? 'tab-bar__group--drop-after'
            : '',
          dragOver?.key === `group:${item.group.id}` && dragOver.place === 'into'
            ? 'tab-bar__group--drop-into'
            : ''
        ]
          .filter(Boolean)
          .join(' ')
        const groupTitle = item.group.title.trim() || t('tab.group')

        return (
          <div
            key={item.group.id}
            className={groupClass}
            draggable={editingGroupId !== item.group.id}
            onDragStart={(event) => {
              if (editingGroupId === item.group.id) {
                event.preventDefault()
                return
              }
              handleDragStart(event, { type: 'group', groupId: item.group.id })
            }}
            onDragOver={(event) => handleDragOver(event, `group:${item.group.id}`, true)}
            onDrop={(event) =>
              handleDrop(event, {
                type: 'group',
                groupId: item.group.id,
                place: dropPlaceFromEvent(event, true)
              })
            }
            onDragEnd={handleDragEnd}
            onContextMenu={(event) => openGroupMenu(event, item.group.id)}
          >
            {editingGroupId === item.group.id ? (
              <input
                className="tab-bar__group-input"
                value={editingTitle}
                autoFocus
                aria-label={t('tab.rename_group')}
                onChange={(event) => setEditingTitle(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitRename()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditingGroupId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="tab-bar__group-label"
                title={groupTitle}
                onClick={() => {
                  if (item.group.collapsed) {
                    const first = item.tabs[0]
                    if (first && !item.tabs.some((tab) => tab.id === activeTabId)) {
                      onActivate(first.id)
                    }
                  }
                  onToggleGroupCollapsed(item.group.id)
                }}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  startRename(item.group)
                }}
              >
                {groupTitle}
              </button>
            )}
            {item.group.collapsed
              ? null
              : item.tabs.map((tab) => {
                  const { label, title } = tabMeta(tab)
                  return (
                    <TabItem
                      key={tab.id}
                      tab={tab}
                      active={tab.id === activeTabId}
                      label={label}
                      title={title}
                      busy={impExpBusy}
                      dropKey={`tab:${tab.id}`}
                      dragOver={dragOver}
                      onActivate={onActivate}
                      onClose={onClose}
                      onContextMenu={openTabMenu}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  )
                })}
          </div>
        )
      })}

      {contextMenu && (
        <div
          className="collection-tree__context-menu tab-bar__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'tab' && contextTab ? (
            <>
              <button
                type="button"
                className="collection-tree__context-item"
                onClick={() => {
                  onCreateGroup(contextTab.id)
                  setContextMenu(null)
                }}
              >
                {t('tab.new_group')}
              </button>
              {paneGroups
                .filter((group) => group.id !== contextTab.groupId)
                .map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="collection-tree__context-item"
                    onClick={() => {
                      onJoinGroup(contextTab.id, group.id)
                      setContextMenu(null)
                    }}
                  >
                    {t('tab.add_to_group')}: {group.title.trim() || t('tab.group')}
                  </button>
                ))}
              {contextTab.groupId ? (
                <button
                  type="button"
                  className="collection-tree__context-item"
                  onClick={() => {
                    onLeaveGroup(contextTab.id)
                    setContextMenu(null)
                  }}
                >
                  {t('tab.remove_from_group')}
                </button>
              ) : null}
            </>
          ) : null}
          {contextGroup ? (
            <>
              {contextMenu.kind === 'group' ? (
                <div className="collection-tree__context-header">{t('tab.group')}</div>
              ) : null}
              <button
                type="button"
                className="collection-tree__context-item"
                onClick={() => startRename(contextGroup)}
              >
                {t('tab.rename_group')}
              </button>
              <div className="tab-bar__color-row" role="group" aria-label={t('tab.group_color')}>
                {TAB_GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={
                      contextGroup.color === color
                        ? `tab-bar__color-dot tab-bar__color-dot--${color} tab-bar__color-dot--active`
                        : `tab-bar__color-dot tab-bar__color-dot--${color}`
                    }
                    aria-label={color}
                    onClick={() => {
                      onSetGroupColor(contextGroup.id, color)
                      setContextMenu(null)
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="collection-tree__context-item"
                onClick={() => {
                  onUngroup(contextGroup.id)
                  setContextMenu(null)
                }}
              >
                {t('tab.ungroup')}
              </button>
              <button
                type="button"
                className="collection-tree__context-item"
                onClick={() => {
                  onCloseGroup(contextGroup.id)
                  setContextMenu(null)
                }}
              >
                {t('tab.close_group')}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default TabBar
