import type { ConnectionStatus } from '@features/connection/shared/types'
import SimpleView from '@features/explorer/renderer/ui/SimpleView'
import QueryView from '@features/query/renderer/ui/QueryView'
import type { AppView } from '@shared/shell/AppNav'
import type { WorkspaceTab } from '@shared/shell/workspace_tab'

type WorkspacePaneProps = {
  status: ConnectionStatus
  tab: WorkspaceTab
  menuEnabled: boolean
  onChangeView: (view: AppView) => void
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string | null) => void
  onRootCollectionsChanged: () => void
}

/**
 * タブ 1 枚分の中身。Simple / Query を tab.view で切り替える。
 * Split 時は複数マウントされるため、menuEnabled でメニュー登録を一方に限る。
 */
function WorkspacePane({
  status,
  tab,
  menuEnabled,
  onChangeView,
  onSelectCollection,
  onSelectDocument,
  onRootCollectionsChanged
}: WorkspacePaneProps): React.JSX.Element {
  return (
    <div className="workspace-pane">
      <div className="workspace-pane__modebar">
        <nav className="app-nav">
          <button
            type="button"
            className={
              tab.view === 'explorer' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'
            }
            onClick={() => onChangeView('explorer')}
          >
            Simple
          </button>
          <button
            type="button"
            className={tab.view === 'query' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
            onClick={() => onChangeView('query')}
          >
            Query
          </button>
        </nav>
        <span className="workspace-pane__path" title={tab.collectionPath}>
          {tab.collectionPath}
        </span>
      </div>

      {tab.view === 'query' ? (
        <QueryView status={status} activeCollectionPath={tab.collectionPath} />
      ) : (
        <SimpleView
          status={status}
          activeCollectionPath={tab.collectionPath}
          selectedDocumentPath={tab.selectedDocumentPath}
          onSelectCollection={onSelectCollection}
          onSelectDocument={onSelectDocument}
          onRootCollectionsChanged={onRootCollectionsChanged}
          menuEnabled={menuEnabled}
        />
      )}
    </div>
  )
}

export default WorkspacePane
