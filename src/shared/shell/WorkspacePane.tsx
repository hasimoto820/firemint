import type { BulkFieldMode } from '@features/bulk_operations/shared/types'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ImpExpView from '@features/data_transfer/renderer/ui/ImpExpView'
import TransportView from '@features/data_transfer/renderer/ui/TransportView'
import type { ImpExpDraft, ImpExpIntent } from '@features/data_transfer/shared/imp_exp'
import type { TransportDraft } from '@features/data_transfer/shared/transport'
import type { EmulatorPageMode } from '@features/emulator/shared/types'
import EmulatorPage from '@features/emulator/renderer/ui/EmulatorPage'
import SimpleView from '@features/explorer/renderer/ui/SimpleView'
import QueryView from '@features/query/renderer/ui/QueryView'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { AppView } from '@shared/shell/AppNav'
import {
  isEmulatorImpExpTab,
  isImpExpTab,
  isTransportTab,
  type WorkspaceTab,
  type WorkspaceTabQueryDraftPatch
} from '@shared/shell/workspace_tab'

type WorkspacePaneProps = {
  status: ConnectionStatus
  tab: WorkspaceTab
  menuEnabled: boolean
  impExpJob: ScriptJobSnapshot | null
  impExpDraft: ImpExpDraft
  rootCollections: string[]
  onImpExpDraftChange: (patch: Partial<ImpExpDraft>) => void
  onCancelImpExp: () => void
  onOpenImpExp: (intent?: ImpExpIntent) => void
  transportDraft: TransportDraft
  onTransportDraftChange: (patch: Partial<TransportDraft>) => void
  sourceLabel?: string
  sourceCollectionPath?: string
  emulatorPageMode?: EmulatorPageMode
  onEmulatorModeChange?: (mode: EmulatorPageMode) => void
  emulatorHost?: string
  emulatorDestinationPoolId?: string | null
  emulatorDestinationLabel?: string | null
  onEmulatorWorkspaceChanged?: () => void | Promise<void>
  onCloseEmulatorImpExp?: () => void
  onChangeView: (view: AppView) => void
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string | null) => void
  onRootCollectionsChanged: () => void
  onRequestCreateCollection: () => void
  onRequestCreateDocument: (collectionPath: string) => void
  onRequestDuplicateDocument: (documentPath: string) => void
  onRequestRenameCollection: (collectionPath: string) => void
  onRequestCreateSubcollection: (documentPath: string) => void
  onRequestDeleteSubcollection: (collectionPath: string) => void
  onRequestFieldBulk?: (mode: BulkFieldMode) => void
  collectionDataReloadToken?: number
  onCollectionDocumentsChanged?: () => void
  onCollectionBecameEmpty?: (collectionPath: string) => void
  onOpenDocumentPath?: (documentPath: string) => void
  onQueryDraftChange: (patch: WorkspaceTabQueryDraftPatch) => void
}

/**
 * タブ 1 枚分の中身。コレクションタブは Simple / Query、Imp/Exp はモードバー無し。
 * Split 時は複数マウントされるため、menuEnabled でメニュー登録を一方に限る。
 */
function WorkspacePane({
  status,
  tab,
  menuEnabled,
  impExpJob,
  impExpDraft,
  rootCollections,
  onImpExpDraftChange,
  onCancelImpExp,
  onOpenImpExp,
  transportDraft,
  onTransportDraftChange,
  sourceLabel = '',
  sourceCollectionPath = '',
  emulatorPageMode = 'import-project',
  onEmulatorModeChange,
  emulatorHost,
  emulatorDestinationPoolId = null,
  emulatorDestinationLabel = null,
  onEmulatorWorkspaceChanged,
  onCloseEmulatorImpExp,
  onChangeView,
  onSelectCollection,
  onSelectDocument,
  onRootCollectionsChanged,
  onRequestCreateCollection,
  onRequestCreateDocument,
  onRequestDuplicateDocument,
  onRequestRenameCollection,
  onRequestCreateSubcollection,
  onRequestDeleteSubcollection,
  onRequestFieldBulk,
  collectionDataReloadToken = 0,
  onCollectionDocumentsChanged,
  onCollectionBecameEmpty,
  onOpenDocumentPath,
  onQueryDraftChange
}: WorkspacePaneProps): React.JSX.Element {
  if (isTransportTab(tab)) {
    return (
      <div className="workspace-pane">
        <TransportView
          sourceProjectId={status.projectId}
          sourceLabel={sourceLabel || status.projectId}
          sourceAuthType={status.authType ?? 'serviceAccount'}
          sourceCollectionPath={sourceCollectionPath}
          sourceRootCollections={rootCollections}
          draft={transportDraft}
          onDraftChange={onTransportDraftChange}
          job={impExpJob}
          onCancel={onCancelImpExp}
        />
      </div>
    )
  }

  if (isImpExpTab(tab)) {
    return (
      <div className="workspace-pane">
        <ImpExpView
          projectId={status.projectId}
          readOnly={status.readOnly}
          rootCollections={rootCollections}
          draft={impExpDraft}
          onDraftChange={onImpExpDraftChange}
          job={impExpJob}
          onCancel={onCancelImpExp}
        />
      </div>
    )
  }

  if (isEmulatorImpExpTab(tab)) {
    return (
      <div className="workspace-pane">
        <EmulatorPage
          mode={emulatorPageMode}
          onModeChange={onEmulatorModeChange}
          onClose={() => onCloseEmulatorImpExp?.()}
          onWorkspaceChanged={onEmulatorWorkspaceChanged ?? (async () => undefined)}
          defaultHost={emulatorHost}
          destinationPoolId={emulatorDestinationPoolId}
          destinationLabel={emulatorDestinationLabel}
          job={impExpJob}
          onCancelJob={onCancelImpExp}
        />
      </div>
    )
  }

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
          onOpenDocumentPath={onOpenDocumentPath}
        />
      ) : (
        <SimpleView
          status={status}
          activeCollectionPath={tab.collectionPath}
          selectedDocumentPath={tab.selectedDocumentPath}
          onSelectCollection={onSelectCollection}
          onSelectDocument={onSelectDocument}
          onRootCollectionsChanged={onRootCollectionsChanged}
          onRequestCreateCollection={onRequestCreateCollection}
          onRequestCreateDocument={onRequestCreateDocument}
          onRequestDuplicateDocument={onRequestDuplicateDocument}
          onRequestRenameCollection={onRequestRenameCollection}
          onRequestCreateSubcollection={onRequestCreateSubcollection}
          onRequestDeleteSubcollection={onRequestDeleteSubcollection}
          onRequestFieldBulk={onRequestFieldBulk}
          collectionDataReloadToken={collectionDataReloadToken}
          onCollectionDocumentsChanged={onCollectionDocumentsChanged}
          onCollectionBecameEmpty={onCollectionBecameEmpty}
          onOpenDocumentPath={onOpenDocumentPath}
          menuEnabled={menuEnabled}
          onOpenImpExp={onOpenImpExp}
        />
      )}
    </div>
  )
}

export default WorkspacePane
