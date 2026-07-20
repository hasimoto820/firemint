import type { ConnectionStatus } from '@features/connection/shared/types'
import SimpleView from '@features/explorer/renderer/ui/SimpleView'
import QueryView from '@features/query/renderer/ui/QueryView'
import type { AppView } from '@shared/shell/AppNav'
import type { WorkspaceTab, WorkspaceTabQueryDraftPatch } from '@shared/shell/workspace_tab'

type WorkspacePaneProps = {
  status: ConnectionStatus
  tab: WorkspaceTab
  menuEnabled: boolean
  onChangeView: (view: AppView) => void
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string | null) => void
  onRootCollectionsChanged: () => void
  onRequestRenameCollection: (collectionPath: string) => void
  onRequestFieldBulkRename: (collectionPath: string) => void
  collectionDataReloadToken?: number
  onQueryDraftChange: (patch: WorkspaceTabQueryDraftPatch) => void
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
  onRootCollectionsChanged,
  onRequestRenameCollection,
  onRequestFieldBulkRename,
  collectionDataReloadToken = 0,
  onQueryDraftChange
}: WorkspacePaneProps): React.JSX.Element {
  return (
    <div className="workspace-pane">
      <div className="workspace-pane__modebar">
        <nav className="app-nav">
          <button
            type="button"
            className={
              tab.view === 'simple' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'
            }
            onClick={() => onChangeView('simple')}
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
        <QueryView
          status={status}
          activeCollectionPath={tab.collectionPath}
          querySource={tab.querySource}
          querySeededPath={tab.querySeededPath}
          querySelectedSavedId={tab.querySelectedSavedId}
          querySavedName={tab.querySavedName}
          queryDocuments={tab.queryDocuments}
          queryResultCount={tab.queryResultCount}
          queryLastSource={tab.queryLastSource}
          queryResultSelectedPath={tab.queryResultSelectedPath}
          onQueryDraftChange={onQueryDraftChange}
        />
      ) : (
        <SimpleView
          status={status}
          activeCollectionPath={tab.collectionPath}
          selectedDocumentPath={tab.selectedDocumentPath}
          onSelectCollection={onSelectCollection}
          onSelectDocument={onSelectDocument}
          onRootCollectionsChanged={onRootCollectionsChanged}
          onRequestRenameCollection={onRequestRenameCollection}
          onRequestFieldBulkRename={onRequestFieldBulkRename}
          collectionDataReloadToken={collectionDataReloadToken}
          menuEnabled={menuEnabled}
        />
      )}
    </div>
  )
}

export default WorkspacePane
