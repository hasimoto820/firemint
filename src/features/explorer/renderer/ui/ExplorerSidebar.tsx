import AuthNavSection from '@features/auth_users/renderer/ui/AuthNavSection'
import WorkspaceProjectList from '@features/workspace/renderer/ui/WorkspaceProjectList'
import { useT } from '@shared/i18n/renderer/I18nProvider'
import CollectionTree from './CollectionTree'

type ExplorerSidebarProps = {
  projectId: string
  rootCollections: string[]
  activeCollectionPath: string | null
  selectedDocumentPath: string | null
  mainSection: 'firestore' | 'auth'
  onSelectFirestore: () => void
  onSelectAuth: () => void
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string) => void
  onRenameCollection?: (collectionPath: string) => void
  onRenameFieldBulk?: (collectionPath: string) => void
  onCreateSubcollection?: (documentPath: string) => void
  onDeleteSubcollection?: (collectionPath: string) => void
  canRename?: boolean
  canManageSubcollections?: boolean
  onWorkspaceChanged: () => void
  treeReloadToken?: number
  disabled?: boolean
}

/**
 * 左ペインのナビゲータ。上段にプロジェクト一覧、選択中プロジェクト配下に
 * FIRESTORE（root collection ツリー）と AUTH（ユーザー管理入口）を兄弟表示する。
 */
function ExplorerSidebar({
  projectId,
  rootCollections,
  activeCollectionPath,
  selectedDocumentPath,
  mainSection,
  onSelectFirestore,
  onSelectAuth,
  onSelectCollection,
  onSelectDocument,
  onRenameCollection,
  onRenameFieldBulk,
  onCreateSubcollection,
  onDeleteSubcollection,
  canRename = false,
  canManageSubcollections = false,
  onWorkspaceChanged,
  treeReloadToken = 0,
  disabled = false
}: ExplorerSidebarProps): React.JSX.Element {
  const t = useT()

  return (
    <div className="explorer-sidebar">
      <WorkspaceProjectList
        onChanged={onWorkspaceChanged}
        disabled={disabled}
        focusedChildren={
          <>
            <CollectionTree
              title={t('explorer.firestore')}
              projectId={projectId}
              rootCollections={rootCollections}
              activeCollectionPath={
                mainSection === 'firestore' ? activeCollectionPath : null
              }
              selectedDocumentPath={
                mainSection === 'firestore' ? selectedDocumentPath : null
              }
              onSelectCollection={(collectionPath) => {
                onSelectFirestore()
                onSelectCollection(collectionPath)
              }}
              onSelectDocument={(documentPath) => {
                onSelectFirestore()
                onSelectDocument(documentPath)
              }}
              onRenameCollection={onRenameCollection}
              onRenameFieldBulk={onRenameFieldBulk}
              onCreateSubcollection={onCreateSubcollection}
              onDeleteSubcollection={onDeleteSubcollection}
              canRename={canRename}
              canManageSubcollections={canManageSubcollections}
              reloadToken={treeReloadToken}
              disabled={disabled}
            />
            <AuthNavSection
              active={mainSection === 'auth'}
              onSelect={onSelectAuth}
              disabled={disabled}
            />
          </>
        }
      />
    </div>
  )
}

export default ExplorerSidebar
