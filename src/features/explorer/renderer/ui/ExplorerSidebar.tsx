import WorkspaceProjectList from '@features/workspace/renderer/ui/WorkspaceProjectList'
import CollectionTree from './CollectionTree'

type ExplorerSidebarProps = {
  projectId: string
  rootCollections: string[]
  activeCollectionPath: string | null
  selectedDocumentPath: string | null
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string) => void
  onWorkspaceChanged: () => void
  disabled?: boolean
}

/**
 * 左ペインのナビゲータ。上段にプロジェクト一覧、選択中プロジェクト配下に
 * FIRESTORE（root collection ツリー）を表示する。
 */
function ExplorerSidebar({
  projectId,
  rootCollections,
  activeCollectionPath,
  selectedDocumentPath,
  onSelectCollection,
  onSelectDocument,
  onWorkspaceChanged,
  disabled = false
}: ExplorerSidebarProps): React.JSX.Element {
  return (
    <div className="explorer-sidebar">
      <WorkspaceProjectList
        onChanged={onWorkspaceChanged}
        disabled={disabled}
        focusedChildren={
          <CollectionTree
            title="FIRESTORE"
            projectId={projectId}
            rootCollections={rootCollections}
            activeCollectionPath={activeCollectionPath}
            selectedDocumentPath={selectedDocumentPath}
            onSelectCollection={onSelectCollection}
            onSelectDocument={onSelectDocument}
            disabled={disabled}
          />
        }
      />
    </div>
  )
}

export default ExplorerSidebar
