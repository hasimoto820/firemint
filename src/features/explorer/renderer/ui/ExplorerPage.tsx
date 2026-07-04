import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import EnvironmentBadge from '@features/connection/renderer/ui/EnvironmentBadge'
import AppNav from '@shared/shell/AppNav'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'
import Button from '@shared/ui/Button'
import BulkActionsPanel from '@features/bulk_operations/renderer/ui/BulkActionsPanel'
import ExportPanel from '@features/data_transfer/renderer/ui/ExportPanel'
import CollectionSidebar from './CollectionSidebar'
import DocumentJsonPanel from './DocumentJsonPanel'
import DocumentTable from './DocumentTable'

type ExplorerPageProps = {
  initialStatus: ConnectionStatus
  onDisconnected: () => void
  onNavigate: (view: AppView) => void
}

function ExplorerPage({ initialStatus, onDisconnected, onNavigate }: ExplorerPageProps): React.JSX.Element {
  const [status] = useState(initialStatus)
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [activeCollectionPath, setActiveCollectionPath] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [subcollections, setSubcollections] = useState<string[]>([])
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())

  const loadRootCollections = useCallback(async (): Promise<void> => {
    const result = await window.api.explorer.listRootCollections()
    if (!result.ok) {
      setError(result.error)
      return
    }
    setRootCollections(result.data)
  }, [])

  const loadDocuments = useCallback(async (collectionPath: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.listDocuments(collectionPath)
      if (!result.ok) {
        setError(result.error)
        setDocuments([])
        return
      }

      setDocuments(result.data)
      setActiveCollectionPath(collectionPath)
      setSelectedDocumentPath(null)
      setSubcollections([])
      setJsonText('{\n  \n}')
      setBulkSelectedPaths(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDocument = useCallback(async (documentPath: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [documentResult, subcollectionResult] = await Promise.all([
        window.api.explorer.getDocument(documentPath),
        window.api.explorer.listSubcollections(documentPath)
      ])

      if (!documentResult.ok) {
        setError(documentResult.error)
        return
      }

      setSelectedDocumentPath(documentPath)
      setJsonText(JSON.stringify(documentResult.data.data, null, 2))

      if (subcollectionResult.ok) {
        setSubcollections(subcollectionResult.data)
      } else {
        setSubcollections([])
        setError(subcollectionResult.error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRootCollections()
  }, [loadRootCollections])

  const handleDisconnect = async (): Promise<void> => {
    await window.api.connection.disconnect()
    onDisconnected()
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedDocumentPath) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const result = await window.api.explorer.updateDocument({
        documentPath: selectedDocumentPath,
        data: parsed
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (activeCollectionPath) {
        await loadDocuments(activeCollectionPath)
        await loadDocument(selectedDocumentPath)
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'JSON の形式が正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!selectedDocumentPath || !activeCollectionPath) {
      return
    }

    if (!window.confirm('このドキュメントを削除しますか？')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.deleteDocument(selectedDocumentPath)
      if (!result.ok) {
        setError(result.error)
        return
      }

      await loadDocuments(activeCollectionPath)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!activeCollectionPath) {
      setError('コレクションを選択してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const result = await window.api.explorer.createDocument({
        collectionPath: activeCollectionPath,
        data: parsed
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await loadDocuments(activeCollectionPath)
      const newPath = `${activeCollectionPath}/${result.data}`
      await loadDocument(newPath)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'JSON の形式が正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkToggle = (documentPath: string, checked: boolean): void => {
    setBulkSelectedPaths((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(documentPath)
      } else {
        next.delete(documentPath)
      }

      return next
    })
  }

  const handleBulkToggleAll = (checked: boolean): void => {
    if (checked) {
      setBulkSelectedPaths(new Set(documents.map((document) => document.path)))
      return
    }

    setBulkSelectedPaths(new Set())
  }

  const handleBulkOperationComplete = async (): Promise<void> => {
    if (!activeCollectionPath) {
      return
    }

    await loadDocuments(activeCollectionPath)
  }

  return (
    <AppShell
      header={
        <div className="explorer-header">
          <div>
            <h1 className="explorer-header__title">FireMint</h1>
            <p className="explorer-header__meta">
              {status.projectId} <EnvironmentBadge environment={status.environment} />
            </p>
            <AppNav active="explorer" onChange={onNavigate} />
          </div>
          <Button variant="danger" onClick={() => void handleDisconnect()} disabled={loading}>
            切断
          </Button>
        </div>
      }
      sidebar={
        <CollectionSidebar
          rootCollections={rootCollections}
          activeCollectionPath={activeCollectionPath}
          subcollections={subcollections}
          selectedDocumentPath={selectedDocumentPath}
          onSelectCollection={(path) => void loadDocuments(path)}
          onSelectSubcollection={(path) => void loadDocuments(path)}
        />
      }
      main={
        <div className="explorer-main">
          {error && <p className="explorer-main__error">{error}</p>}
          {successMessage && <p className="explorer-main__success">{successMessage}</p>}
          {loading && <p className="explorer-main__loading">読み込み中...</p>}
          <div className="explorer-main__path">
            {activeCollectionPath ? `コレクション: ${activeCollectionPath}` : 'コレクションを選択してください'}
          </div>
          <ExportPanel
            mode="collection"
            collectionPath={activeCollectionPath}
            disabled={loading}
            onSuccess={setSuccessMessage}
            onError={setError}
          />
          <BulkActionsPanel
            environment={status.environment}
            selectedPaths={Array.from(bulkSelectedPaths)}
            loading={loading}
            onLoadingChange={setLoading}
            onClearSelection={() => setBulkSelectedPaths(new Set())}
            onOperationComplete={() => void handleBulkOperationComplete()}
            onError={setError}
          />
          <DocumentTable
            documents={documents}
            selectedDocumentPath={selectedDocumentPath}
            selectable
            bulkSelectedPaths={bulkSelectedPaths}
            onBulkToggle={handleBulkToggle}
            onBulkToggleAll={handleBulkToggleAll}
            onSelectDocument={(path) => void loadDocument(path)}
          />
          <DocumentJsonPanel
            documentPath={selectedDocumentPath}
            jsonText={jsonText}
            loading={loading}
            onChange={setJsonText}
            onSave={() => void handleSave()}
            onDelete={() => void handleDelete()}
            onCreate={() => void handleCreate()}
          />
        </div>
      }
    />
  )
}

export default ExplorerPage
