import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import ExplorerSidebar from '@features/explorer/renderer/ui/ExplorerSidebar'
import SimpleView from '@features/explorer/renderer/ui/SimpleView'
import QueryView from '@features/query/renderer/ui/QueryView'
import AppHeader from '@shared/shell/AppHeader'
import AppNav from '@shared/shell/AppNav'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'

type FirestorePageProps = {
  status: ConnectionStatus
  view: AppView
  onNavigate: (view: AppView) => void
  onDisconnected: () => void
  onWorkspaceChanged: () => void
}

/**
 * 接続後の Firestore 作業画面。左ペインのツリー（プロジェクト + FIRESTORE）と
 * ヘッダーを 1 枚のシェルで固定し、右メインの Simple / Query モードだけを
 * 切り替える。ツリーの選択状態（activeCollectionPath など）はここで保持するため、
 * モード切替でツリーが再マウント・リセットされない。
 */
function FirestorePage({
  status,
  view,
  onNavigate,
  onDisconnected,
  onWorkspaceChanged
}: FirestorePageProps): React.JSX.Element {
  const projectId = status.projectId
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [activeCollectionPath, setActiveCollectionPath] = useState<string | null>(null)
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)

  const loadRootCollections = useCallback(async (): Promise<void> => {
    setTreeLoading(true)

    try {
      const result = await window.api.explorer.listRootCollections(projectId)
      if (result.ok) {
        setRootCollections(result.data)
      }
    } finally {
      setTreeLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadRootCollections()
  }, [loadRootCollections])

  const handleSelectCollection = useCallback((collectionPath: string): void => {
    setActiveCollectionPath(collectionPath)
    setSelectedDocumentPath(null)
  }, [])

  const handleSelectDocument = useCallback((documentPath: string | null): void => {
    setSelectedDocumentPath(documentPath)
  }, [])

  const handleDisconnect = async (): Promise<void> => {
    await window.api.connection.disconnect()
    onDisconnected()
  }

  return (
    <AppShell
      header={
        <AppHeader status={status} onDisconnect={() => void handleDisconnect()} />
      }
      sidebar={
        <ExplorerSidebar
          projectId={projectId}
          rootCollections={rootCollections}
          activeCollectionPath={activeCollectionPath}
          selectedDocumentPath={selectedDocumentPath}
          onSelectCollection={handleSelectCollection}
          onSelectDocument={(path) => handleSelectDocument(path)}
          onWorkspaceChanged={onWorkspaceChanged}
          disabled={treeLoading}
        />
      }
      main={
        <div className="firestore-main">
          <div className="firestore-modebar">
            <AppNav active={view} onChange={onNavigate} />
          </div>
          {view === 'query' ? (
            <QueryView status={status} />
          ) : (
            <SimpleView
              status={status}
              activeCollectionPath={activeCollectionPath}
              selectedDocumentPath={selectedDocumentPath}
              onSelectCollection={handleSelectCollection}
              onSelectDocument={handleSelectDocument}
              onRootCollectionsChanged={() => void loadRootCollections()}
            />
          )}
        </div>
      }
    />
  )
}

export default FirestorePage
