import { workspaceTabLabel, type WorkspaceTab } from './workspace_tab'

type TabBarProps = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  ariaLabel?: string
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

function TabBar({
  tabs,
  activeTabId,
  ariaLabel = 'コレクションタブ',
  onActivate,
  onClose
}: TabBarProps): React.JSX.Element {
  if (tabs.length === 0) {
    return <div className="tab-bar tab-bar--empty" />
  }

  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        const className = ['tab-bar__tab', active ? 'tab-bar__tab--active' : '']
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={tab.id}
            className={className}
            role="tab"
            aria-selected={active}
            title={tab.collectionPath}
          >
            <button type="button" className="tab-bar__label" onClick={() => onActivate(tab.id)}>
              <span className="tab-bar__name">{workspaceTabLabel(tab.collectionPath)}</span>
              <span className="tab-bar__mode">{tab.view === 'query' ? 'Q' : 'S'}</span>
            </button>
            <button
              type="button"
              className="tab-bar__close"
              aria-label={`${workspaceTabLabel(tab.collectionPath)} を閉じる`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default TabBar
