import { useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import EnvironmentBadge from '@features/connection/renderer/ui/EnvironmentBadge'
import DocumentJsonPanel from '@features/explorer/renderer/ui/DocumentJsonPanel'
import DocumentTable from '@features/explorer/renderer/ui/DocumentTable'
import type { SimpleQueryInput } from '@features/query/shared/types'
import AppNav from '@shared/shell/AppNav'
import type { AppView } from '@shared/shell/AppNav'
import AppShell from '@shared/shell/AppShell'
import Button from '@shared/ui/Button'
import BulkActionsPanel from '@features/bulk_operations/renderer/ui/BulkActionsPanel'
import ExportPanel from '@features/data_transfer/renderer/ui/ExportPanel'
import QueryForm from './QueryForm'

type QueryPageProps = {
  initialStatus: ConnectionStatus
  onDisconnected: () => void
  onNavigate: (view: AppView) => void
}

function QueryPage({ initialStatus, onDisconnected, onNavigate }: QueryPageProps): React.JSX.Element {
  const [status] = useState(initialStatus)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [collectionGroup, setCollectionGroup] = useState(false)
  const [lastQueryLabel, setLastQueryLabel] = useState<string | null>(null)
  const [lastQueryInput, setLastQueryInput] = useState<SimpleQueryInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())

  const handleDisconnect = async (): Promise<void> => {
    await window.api.connection.disconnect()
    onDisconnected()
  }

  const handleRun = async (input: SimpleQueryInput): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.query.execute(input)

      if (!result.ok) {
        setError(result.error)
        setDocuments([])
        setSelectedDocumentPath(null)
        setJsonText('{\n  \n}')
        return
      }

      setDocuments(result.data)
      setCollectionGroup(input.collectionGroup)
      setSelectedDocumentPath(null)
      setJsonText('{\n  \n}')
      setBulkSelectedPaths(new Set())
      setLastQueryInput(input)
      setLastQueryLabel(
        input.collectionGroup
          ? `Collection Group: ${input.collectionPath}`
          : `Collection: ${input.collectionPath}`
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDocument = async (documentPath: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.getDocument(documentPath)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSelectedDocumentPath(documentPath)
      setJsonText(JSON.stringify(result.data.data, null, 2))
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
    if (!lastQueryInput) {
      return
    }

    await handleRun(lastQueryInput)
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
            <AppNav active="query" onChange={onNavigate} />
          </div>
          <Button variant="danger" onClick={() => void handleDisconnect()} disabled={loading}>
            切断
          </Button>
        </div>
      }
      sidebar={
        <div className="query-sidebar">
          <h2 className="query-sidebar__title">Query</h2>
          <p className="query-sidebar__hint">
            Simple クエリと Collection Group を実行します。結果の行をクリックすると JSON を表示できます。
          </p>
          {lastQueryLabel && <p className="query-sidebar__last">{lastQueryLabel}</p>}
          {documents.length > 0 && (
            <p className="query-sidebar__count">{documents.length} 件</p>
          )}
        </div>
      }
      main={
        <div className="query-main">
          <QueryForm loading={loading} onRun={(input) => void handleRun(input)} />
          {error && <p className="query-main__error">{error}</p>}
          {successMessage && <p className="query-main__success">{successMessage}</p>}
          {loading && <p className="query-main__loading">実行中...</p>}
          {lastQueryLabel && (
            <div className="query-main__result-label">
              {lastQueryLabel} — {documents.length} 件
            </div>
          )}
          <ExportPanel
            mode="documents"
            documents={documents}
            defaultFileName={lastQueryLabel ?? 'query-result'}
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
            showPath={collectionGroup}
            selectable
            bulkSelectedPaths={bulkSelectedPaths}
            onBulkToggle={handleBulkToggle}
            onBulkToggleAll={handleBulkToggleAll}
            onSelectDocument={(path) => void handleSelectDocument(path)}
          />
          <DocumentJsonPanel
            documentPath={selectedDocumentPath}
            jsonText={jsonText}
            loading={loading}
            onChange={setJsonText}
            onSave={() => undefined}
            onDelete={() => undefined}
            onCreate={() => undefined}
            readOnly
          />
        </div>
      }
    />
  )
}

export default QueryPage
