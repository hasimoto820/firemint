import { isImpExpTab, workspaceTabLabel, type WorkspaceTab } from './workspace_tab'

type TabBarProps = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  ariaLabel?: string
  impExpBusy?: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

function TabBar({
  tabs,
  activeTabId,
  ariaLabel = 'コレクションタブ',
  impExpBusy = false,
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
        const label = workspaceTabLabel(tab)
        const className = [
          'tab-bar__tab',
          active ? 'tab-bar__tab--active' : '',
          isImpExpTab(tab) ? 'tab-bar__tab--imp-exp' : '',
          isImpExpTab(tab) && impExpBusy ? 'tab-bar__tab--busy' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={tab.id}
            className={className}
            role="tab"
            aria-selected={active}
            title={isImpExpTab(tab) ? label : tab.collectionPath}
          >
            <button type="button" className="tab-bar__label" onClick={() => onActivate(tab.id)}>
              <span className="tab-bar__name">{label}</span>
              {isImpExpTab(tab) ? null : (
                <span className="tab-bar__mode">{tab.view === 'query' ? 'Q' : 'S'}</span>
              )}
            </button>
            <button
              type="button"
              className="tab-bar__close"
              aria-label={`${label} を閉じる`}
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
