import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import {
  buildDefaultJsQuerySource,
  type SavedQuery
} from '@features/query/shared/types'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import QueryEditor from './QueryEditor'
import SavedQueriesBar from './SavedQueriesBar'

type QueryViewProps = {
  status: ConnectionStatus
  /** 左ツリーで選択中のコレクション path（初期コードの seed に使う） */
  activeCollectionPath?: string | null
}

/**
 * Firestore 作業エリアの「Query」モード。ユーザーが書いた JS（run）を実行し、
 * 結果を一覧・JSON 表示する。Saved Queries でコードを保存・復元できる。
 */
function QueryView({
  status,
  activeCollectionPath = null
}: QueryViewProps): React.JSX.Element {
  const projectId = status.projectId
  const readOnly = status.readOnly
  const [source, setSource] = useState(() => buildDefaultJsQuerySource(activeCollectionPath))
  const [seededPath, setSeededPath] = useState<string | null>(activeCollectionPath)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null)
  const [selectedCreateTime, setSelectedCreateTime] = useState<string | null>(null)
  const [selectedUpdateTime, setSelectedUpdateTime] = useState<string | null>(null)
  const [selectedDocumentData, setSelectedDocumentData] = useState<Record<string, unknown> | null>(
    null
  )
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [lastSource, setLastSource] = useState<string | null>(null)
  const [resultCount, setResultCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const [savedName, setSavedName] = useState('')

  const refreshSavedQueries = useCallback(async (): Promise<void> => {
    try {
      if (typeof window.api.query.listSaved !== 'function') {
        setError('Saved Queries API が未反映です。アプリを再起動してください。')
        return
      }

      const result = await window.api.query.listSaved(projectId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setSavedQueries(result.data)
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : '保存クエリ一覧の取得に失敗しました'
      )
    }
  }, [projectId])

  useEffect(() => {
    void refreshSavedQueries()
  }, [refreshSavedQueries])

  useEffect(() => {
    const nextPath = activeCollectionPath ?? null
    const previousSeed = buildDefaultJsQuerySource(seededPath)

    if (source.trim() === previousSeed.trim()) {
      setSource(buildDefaultJsQuerySource(nextPath))
    }

    setSeededPath(nextPath)
    // パス変更時のみ。source を依存に入れると入力中に seed 比較がずれる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionPath])

  const handleRun = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setStatusMessage(null)

    try {
      const result = await window.api.query.execute({
        projectId,
        source
      })

      if (!result.ok) {
        setError(result.error)
        setDocuments([])
        setSelectedDocumentPath(null)
        setJsonText('{\n  \n}')
        setResultCount(null)
        setLastSource(null)
        return
      }

      const nextDocuments = Array.isArray(result.data) ? result.data : []
      setDocuments(nextDocuments)
      setSelectedDocumentPath(null)
      setSelectedCreateTime(null)
      setSelectedUpdateTime(null)
      setSelectedDocumentData(null)
      setJsonText('{\n  \n}')
      setBulkSelectedPaths(new Set())
      setLastSource(source)
      setResultCount(nextDocuments.length)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Query の実行に失敗しました')
      setDocuments([])
      setResultCount(null)
      setLastSource(null)
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
    if (!lastSource) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.query.execute({
        projectId,
        source: lastSource
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      const nextDocuments = Array.isArray(result.data) ? result.data : []
      setDocuments(nextDocuments)
      setResultCount(nextDocuments.length)
      setBulkSelectedPaths(new Set())
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSaved = (id: string | null): void => {
    setSelectedSavedId(id)
    const selected = savedQueries.find((query) => query.id === id)
    setSavedName(selected?.name ?? '')
  }

  const handleLoadSaved = (): void => {
    const selected = savedQueries.find((query) => query.id === selectedSavedId)
    if (!selected) {
      return
    }

    setSource(selected.source)
    setSeededPath(null)
    setSavedName(selected.name)
    setStatusMessage(`読込: ${selected.name}`)
    setError(null)
  }

  const handleSaveSaved = async (): Promise<void> => {
    const name = savedName.trim() || activeCollectionPath || 'untitled query'

    if (!name.trim()) {
      setError('名前を入力してください')
      return
    }

    setLoading(true)
    setError(null)
    setStatusMessage(null)

    try {
      if (typeof window.api.query.saveSaved !== 'function') {
        setError('Saved Queries API が未反映です。アプリを再起動してください。')
        return
      }

      const result = await window.api.query.saveSaved({
        id: selectedSavedId ?? undefined,
        name,
        projectId,
        source,
        collectionPathHint: activeCollectionPath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSelectedSavedId(result.data.id)
      setSavedName(result.data.name)
      await refreshSavedQueries()
      setStatusMessage(`保存しました: ${result.data.name}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSaved = async (): Promise<void> => {
    if (!selectedSavedId) {
      return
    }

    const selected = savedQueries.find((query) => query.id === selectedSavedId)
    if (!window.confirm(`「${selected?.name ?? selectedSavedId}」を削除しますか？`)) {
      return
    }

    setLoading(true)
    setError(null)
    setStatusMessage(null)

    try {
      if (typeof window.api.query.deleteSaved !== 'function') {
        setError('Saved Queries API が未反映です。アプリを再起動してください。')
        return
      }

      const result = await window.api.query.deleteSaved(selectedSavedId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setSelectedSavedId(null)
      setSavedName('')
      await refreshSavedQueries()
      setStatusMessage('削除しました')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="query-main">
      <QueryEditor
        source={source}
        loading={loading}
        onChange={setSource}
        onRun={() => void handleRun()}
      />
      <SavedQueriesBar
        queries={savedQueries}
        selectedId={selectedSavedId}
        name={savedName}
        loading={loading}
        onSelect={handleSelectSaved}
        onNameChange={setSavedName}
        onLoad={handleLoadSaved}
        onSave={() => void handleSaveSaved()}
        onDelete={() => void handleDeleteSaved()}
      />
      {error && <p className="query-main__error">{error}</p>}
      {statusMessage && <p className="query-main__status">{statusMessage}</p>}
      {loading && <p className="query-main__loading">実行中...</p>}
      {resultCount === null && !loading && (
        <p className="query-main__empty-hint">
          JS を書いて Run（Ctrl+Enter）で結果を表示します。db / admin が使えます。
        </p>
      )}
      {resultCount !== null && (
        <>
          <div className="query-main__workspace">
            <div className="query-main__result-label">{resultCount} docs</div>
            <DocumentTable
              documents={documents}
              selectedDocumentPath={selectedDocumentPath}
              showPath={false}
              tableKey={`js-query:${resultCount}:${documents[0]?.path ?? 'empty'}`}
              pathLabel={activeCollectionPath}
              selectable={!readOnly}
              bulkSelectedPaths={bulkSelectedPaths}
              onBulkToggle={handleBulkToggle}
              onBulkToggleAll={handleBulkToggleAll}
              onSelectDocument={(path) => void handleSelectDocument(path)}
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
          </div>
          <div className="query-main__json">
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
          </div>
        </>
      )}
    </div>
  )
}

export default QueryView
