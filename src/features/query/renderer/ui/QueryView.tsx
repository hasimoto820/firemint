import { useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import type { SimpleQueryInput } from '@features/query/shared/types'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import ExportPanel from '@shared/ui/ExportPanel'
import QueryForm from './QueryForm'

type QueryViewProps = {
  status: ConnectionStatus
  /** 左ツリーで選択中のコレクション path（QueryForm に反映） */
  activeCollectionPath?: string | null
}

/**
 * Firestore 作業エリアの「Query」モード。Simple クエリ / Collection Group を
 * 実行し、結果を一覧・JSON 表示する。自前の state を持つ。
 */
function QueryView({
  status,
  activeCollectionPath = null
}: QueryViewProps): React.JSX.Element {
  const projectId = status.projectId
  const readOnly = status.readOnly
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [selectedCreateTime, setSelectedCreateTime] = useState<string | null>(null)
  const [selectedUpdateTime, setSelectedUpdateTime] = useState<string | null>(null)
  const [selectedDocumentData, setSelectedDocumentData] = useState<Record<string, unknown> | null>(
    null
  )
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [collectionGroup, setCollectionGroup] = useState(false)
  const [lastQueryLabel, setLastQueryLabel] = useState<string | null>(null)
  const [lastQueryInput, setLastQueryInput] = useState<SimpleQueryInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())

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
      setSelectedCreateTime(null)
      setSelectedUpdateTime(null)
      setSelectedDocumentData(null)
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
      const result = await window.api.explorer.getDocument(projectId, documentPath)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSelectedDocumentPath(documentPath)
      setSelectedCreateTime(result.data.createTime)
      setSelectedUpdateTime(result.data.updateTime)
      setSelectedDocumentData(result.data.data)
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
    <div className="query-main">
      <QueryForm
        projectId={projectId}
        loading={loading}
        collectionPathFromTree={activeCollectionPath}
        onRun={(input) => void handleRun(input)}
      />
      {error && <p className="query-main__error">{error}</p>}
      {successMessage && <p className="query-main__success">{successMessage}</p>}
      {loading && <p className="query-main__loading">実行中...</p>}
      {!lastQueryLabel && !loading && (
        <p className="query-main__empty-hint">
          左ツリーでコレクションを選ぶか path を入力し、Run で結果を表示します。
        </p>
      )}
      {lastQueryLabel && (
        <>
          <div className="query-main__result-label">
            {lastQueryLabel} — {documents.length} 件
          </div>
          <ExportPanel
            mode="documents"
            documents={documents}
            defaultFileName={lastQueryLabel}
            disabled={loading}
            onSuccess={setSuccessMessage}
            onError={setError}
          />
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
            showPath={collectionGroup}
            tableKey={lastQueryLabel}
            selectable={!readOnly}
            bulkSelectedPaths={bulkSelectedPaths}
            onBulkToggle={handleBulkToggle}
            onBulkToggleAll={handleBulkToggleAll}
            onSelectDocument={(path) => void handleSelectDocument(path)}
          />
          <DocumentJsonPanel
            documentPath={selectedDocumentPath}
            jsonText={jsonText}
            createTime={selectedCreateTime}
            updateTime={selectedUpdateTime}
            documentData={selectedDocumentData}
            loading={loading}
            onChange={setJsonText}
            onSave={() => undefined}
            onDelete={() => undefined}
            onCreate={() => undefined}
            readOnly
          />
        </>
      )}
    </div>
  )
}

export default QueryView
