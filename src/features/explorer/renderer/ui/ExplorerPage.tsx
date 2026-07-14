import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import WorkspacePanel from '@features/workspace/renderer/ui/WorkspacePanel'
import type { AppView } from '@shared/shell/AppNav'
import AppHeader from '@shared/shell/AppHeader'
import AppShell from '@shared/shell/AppShell'
import Button from '@shared/ui/Button'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import ExportPanel from '@shared/ui/ExportPanel'
import CollectionTree from './CollectionTree'

type ExplorerPageProps = {
  initialStatus: ConnectionStatus
  onDisconnected: () => void
  onWorkspaceChanged: () => void
  onNavigate: (view: AppView) => void
}

function ExplorerPage({
  initialStatus,
  onDisconnected,
  onWorkspaceChanged,
  onNavigate
}: ExplorerPageProps): React.JSX.Element {
  const [status] = useState(initialStatus)
  const projectId = status.projectId
  const readOnly = status.readOnly
  const [rootCollections, setRootCollections] = useState<string[]>([])
  const [activeCollectionPath, setActiveCollectionPath] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [selectedCreateTime, setSelectedCreateTime] = useState<string | null>(null)
  const [selectedUpdateTime, setSelectedUpdateTime] = useState<string | null>(null)
  const [selectedDocumentData, setSelectedDocumentData] = useState<Record<string, unknown> | null>(
    null
  )
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())

  const loadRootCollections = useCallback(async (): Promise<void> => {
    const result = await window.api.explorer.listRootCollections(projectId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setRootCollections(result.data)
  }, [projectId])

  const loadDocuments = useCallback(
    async (collectionPath: string): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const result = await window.api.explorer.listDocuments(projectId, collectionPath)
        if (!result.ok) {
          setError(result.error)
          setDocuments([])
          return
        }

        setDocuments(result.data)
        setActiveCollectionPath(collectionPath)
        setSelectedDocumentPath(null)
        setSelectedCreateTime(null)
        setSelectedUpdateTime(null)
        setSelectedDocumentData(null)
        setJsonText('{\n  \n}')
        setBulkSelectedPaths(new Set())
      } finally {
        setLoading(false)
      }
    },
    [projectId]
  )

  const loadDocument = useCallback(
    async (documentPath: string): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const documentResult = await window.api.explorer.getDocument(projectId, documentPath)

        if (!documentResult.ok) {
          setError(documentResult.error)
          return
        }

        setSelectedDocumentPath(documentPath)
        setSelectedCreateTime(documentResult.data.createTime)
        setSelectedUpdateTime(documentResult.data.updateTime)
        setSelectedDocumentData(documentResult.data.data)
        setJsonText(JSON.stringify(documentResult.data.data, null, 2))
      } finally {
        setLoading(false)
      }
    },
    [projectId]
  )

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
        projectId,
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
      const result = await window.api.explorer.deleteDocument(projectId, selectedDocumentPath)
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
        projectId,
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

  const handleDuplicateDocument = async (): Promise<void> => {
    if (!selectedDocumentPath) {
      return
    }

    const targetDocumentId = window.prompt('複製先ドキュメント ID（空欄で自動生成）', '')

    if (targetDocumentId === null) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.duplicateDocument({
        projectId,
        documentPath: selectedDocumentPath,
        targetDocumentId: targetDocumentId.trim() || undefined
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (activeCollectionPath) {
        await loadDocuments(activeCollectionPath)
        const newPath = `${activeCollectionPath}/${result.data}`
        await loadDocument(newPath)
        setSuccessMessage(`ドキュメントを複製しました: ${newPath}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDuplicateCollection = async (): Promise<void> => {
    if (!activeCollectionPath) {
      setError('コレクションを選択してください')
      return
    }

    const targetCollectionPath = window.prompt(
      '複製先コレクション path（空のコレクションである必要があります）',
      `${activeCollectionPath}_copy`
    )

    if (!targetCollectionPath?.trim()) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.duplicateCollection({
        projectId,
        sourceCollectionPath: activeCollectionPath,
        targetCollectionPath: targetCollectionPath.trim()
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await loadRootCollections()
      await loadDocuments(result.data.targetCollectionPath)
      setSuccessMessage(
        `${result.data.copiedCount} 件を ${result.data.targetCollectionPath} に複製しました`
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell
      header={
        <AppHeader
          status={status}
          activeView="explorer"
          onNavigate={onNavigate}
          onDisconnect={() => void handleDisconnect()}
          disconnectDisabled={loading}
        />
      }
      sidebar={
        <div className="explorer-sidebar">
          <WorkspacePanel onChanged={onWorkspaceChanged} disabled={loading} />
          <CollectionTree
            projectId={projectId}
            rootCollections={rootCollections}
            activeCollectionPath={activeCollectionPath}
            selectedDocumentPath={selectedDocumentPath}
            onSelectCollection={(path) => void loadDocuments(path)}
            onSelectDocument={(path) => void loadDocument(path)}
            disabled={loading}
          />
        </div>
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
            projectId={projectId}
            collectionPath={activeCollectionPath}
            disabled={loading}
            onSuccess={setSuccessMessage}
            onError={setError}
          />
          {!readOnly && activeCollectionPath && (
            <div className="explorer-main__duplicate">
              <Button onClick={() => void handleDuplicateCollection()} disabled={loading}>
                コレクション複製
              </Button>
            </div>
          )}
          {!readOnly && (
            <BulkActionsPanel
              projectId={projectId}
              environment={status.environment}
              selectedPaths={Array.from(bulkSelectedPaths)}
              loading={loading}
              onLoadingChange={setLoading}
              onClearSelection={() => setBulkSelectedPaths(new Set())}
              onOperationComplete={() => void handleBulkOperationComplete()}
              onError={setError}
            />
          )}
          <DocumentTable
            documents={documents}
            selectedDocumentPath={selectedDocumentPath}
            tableKey={activeCollectionPath ?? undefined}
            selectable={!readOnly}
            bulkSelectedPaths={bulkSelectedPaths}
            onBulkToggle={handleBulkToggle}
            onBulkToggleAll={handleBulkToggleAll}
            onSelectDocument={(path) => void loadDocument(path)}
          />
          <DocumentJsonPanel
            documentPath={selectedDocumentPath}
            jsonText={jsonText}
            createTime={selectedCreateTime}
            updateTime={selectedUpdateTime}
            documentData={selectedDocumentData}
            loading={loading}
            onChange={setJsonText}
            onSave={() => void handleSave()}
            onDelete={() => void handleDelete()}
            onCreate={() => void handleCreate()}
            onDuplicate={() => void handleDuplicateDocument()}
            readOnly={readOnly}
          />
        </div>
      }
    />
  )
}

export default ExplorerPage
