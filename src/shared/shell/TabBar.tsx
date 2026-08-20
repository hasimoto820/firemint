import { isWorkspaceToolTab, workspaceTabLabel, type WorkspaceTab } from './workspace_tab'

type TabBarProps = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  ariaLabel?: string
  impExpBusy?: boolean
  projectLabelFor?: (projectId: string) => string
  showProjectLabel?: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

function TabBar({
  tabs,
  activeTabId,
  ariaLabel = 'コレクションタブ',
  impExpBusy = false,
  projectLabelFor,
  showProjectLabel = false,
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
        const projectLabel =
          showProjectLabel && !isWorkspaceToolTab(tab) ? projectLabelFor?.(tab.projectId) : undefined
        const label = workspaceTabLabel(tab, projectLabel)
        const className = [
          'tab-bar__tab',
          active ? 'tab-bar__tab--active' : '',
          isWorkspaceToolTab(tab) ? 'tab-bar__tab--imp-exp' : '',
          tab.kind === 'imp_exp' && impExpBusy ? 'tab-bar__tab--busy' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={tab.id}
            className={className}
            role="tab"
            aria-selected={active}
            title={
              isWorkspaceToolTab(tab)
                ? label
                : projectLabel
                  ? `${tab.projectId} / ${tab.collectionPath}`
                  : tab.collectionPath
            }
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
