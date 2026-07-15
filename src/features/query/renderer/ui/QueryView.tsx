import { useCallback, useEffect, useState } from 'react'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import {
  buildDefaultJsQuerySource,
  type SavedQuery
} from '@features/query/shared/types'
import type { WorkspaceTabQueryDraftPatch } from '@shared/shell/workspace_tab'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import QueryEditor from './QueryEditor'
import SavedQueriesBar from './SavedQueriesBar'

type QueryViewProps = {
  status: ConnectionStatus
  /** 左ツリーで選択中のコレクション path（初期コードの seed に使う） */
  activeCollectionPath?: string | null
  querySource: string | null
  querySeededPath: string | null
  querySelectedSavedId: string | null
  querySavedName: string
  queryDocuments: DocumentSummary[]
  queryResultCount: number | null
  queryLastSource: string | null
  queryResultSelectedPath: string | null
  onQueryDraftChange: (patch: WorkspaceTabQueryDraftPatch) => void
}

const EMPTY_RESULTS_PATCH: WorkspaceTabQueryDraftPatch = {
  queryDocuments: [],
  queryResultCount: null,
  queryLastSource: null,
  queryResultSelectedPath: null
}

/**
 * Firestore 作業エリアの「Query」モード。ユーザーが書いた JS（run）を実行し、
 * 結果を一覧・JSON 表示する。Saved Queries でコードを保存・復元できる。
 * エディタ下書きと直近 Run 結果は WorkspaceTab 側に保持する（モード切替で消えない）。
 */
function QueryView({
  status,
  activeCollectionPath = null,
  querySource,
  querySeededPath,
  querySelectedSavedId,
  querySavedName,
  queryDocuments,
  queryResultCount,
  queryLastSource,
  queryResultSelectedPath,
  onQueryDraftChange
}: QueryViewProps): React.JSX.Element {
  const projectId = status.projectId
  const readOnly = status.readOnly
  const source = querySource ?? buildDefaultJsQuerySource(activeCollectionPath)
  const selectedDocument =
    queryDocuments.find((document) => document.path === queryResultSelectedPath) ?? null
  const jsonText = selectedDocument
    ? JSON.stringify(selectedDocument.data, null, 2)
    : '{\n  \n}'
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkSelectedPaths, setBulkSelectedPaths] = useState<Set<string>>(new Set())
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])

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

  // タブに未保存の下書きが無いとき、コレクション向け default を一度だけ書き込む
  useEffect(() => {
    if (querySource !== null) {
      return
    }

    const nextPath = activeCollectionPath ?? null
    onQueryDraftChange({
      querySource: buildDefaultJsQuerySource(nextPath),
      querySeededPath: nextPath
    })
  }, [querySource, activeCollectionPath, onQueryDraftChange])

  useEffect(() => {
    const nextPath = activeCollectionPath ?? null
    if (querySource === null) {
      return
    }

    const previousSeed = buildDefaultJsQuerySource(querySeededPath)

    if (querySource.trim() === previousSeed.trim()) {
      onQueryDraftChange({
        querySource: buildDefaultJsQuerySource(nextPath),
        querySeededPath: nextPath,
        ...EMPTY_RESULTS_PATCH
      })
      return
    }

    if (querySeededPath !== nextPath) {
      onQueryDraftChange({ querySeededPath: nextPath })
    }
    // パス変更時のみ。source を依存に入れると入力中に seed 比較がずれる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionPath])

  const handleRun = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setStatusMessage(null)
    setBulkSelectedPaths(new Set())

    try {
      const result = await window.api.query.execute({
        projectId,
        source
      })

      if (!result.ok) {
        setError(result.error)
        onQueryDraftChange({ ...EMPTY_RESULTS_PATCH })
        return
      }

      const nextDocuments = Array.isArray(result.data) ? result.data : []
      onQueryDraftChange({
        queryDocuments: nextDocuments,
        queryResultCount: nextDocuments.length,
        queryLastSource: source,
        queryResultSelectedPath: null
      })
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Query の実行に失敗しました')
      onQueryDraftChange({ ...EMPTY_RESULTS_PATCH })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDocument = async (documentPath: string): Promise<void> => {
    onQueryDraftChange({ queryResultSelectedPath: documentPath })
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.getDocument(projectId, documentPath)

      if (!result.ok) {
        setError(result.error)
        return
      }

      onQueryDraftChange({
        queryResultSelectedPath: documentPath,
        queryDocuments: queryDocuments.map((document) =>
          document.path === documentPath
            ? {
                ...document,
                data: result.data.data,
                createTime: result.data.createTime,
                updateTime: result.data.updateTime
              }
            : document
        )
      })
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
      setBulkSelectedPaths(new Set(queryDocuments.map((document) => document.path)))
      return
    }

    setBulkSelectedPaths(new Set())
  }

  const handleBulkOperationComplete = async (): Promise<void> => {
    if (!queryLastSource) {
      return
    }

    setLoading(true)
    setError(null)
    setBulkSelectedPaths(new Set())

    try {
      const result = await window.api.query.execute({
        projectId,
        source: queryLastSource
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      const nextDocuments = Array.isArray(result.data) ? result.data : []
      onQueryDraftChange({
        queryDocuments: nextDocuments,
        queryResultCount: nextDocuments.length,
        queryResultSelectedPath: null
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSaved = (id: string | null): void => {
    const selected = savedQueries.find((query) => query.id === id)
    onQueryDraftChange({
      querySelectedSavedId: id,
      querySavedName: selected?.name ?? ''
    })
  }

  const handleLoadSaved = (): void => {
    const selected = savedQueries.find((query) => query.id === querySelectedSavedId)
    if (!selected) {
      return
    }

    onQueryDraftChange({
      querySource: selected.source,
      querySeededPath: null,
      querySavedName: selected.name
    })
    setStatusMessage(`読込: ${selected.name}`)
    setError(null)
  }

  const handleSaveSaved = async (): Promise<void> => {
    const name = querySavedName.trim() || activeCollectionPath || 'untitled query'

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
        id: querySelectedSavedId ?? undefined,
        name,
        projectId,
        source,
        collectionPathHint: activeCollectionPath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onQueryDraftChange({
        querySelectedSavedId: result.data.id,
        querySavedName: result.data.name
      })
      await refreshSavedQueries()
      setStatusMessage(`保存しました: ${result.data.name}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSaved = async (): Promise<void> => {
    if (!querySelectedSavedId) {
      return
    }

    const selected = savedQueries.find((query) => query.id === querySelectedSavedId)
    if (!window.confirm(`「${selected?.name ?? querySelectedSavedId}」を削除しますか？`)) {
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

      const result = await window.api.query.deleteSaved(querySelectedSavedId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      onQueryDraftChange({
        querySelectedSavedId: null,
        querySavedName: ''
      })
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
        onChange={(next) => onQueryDraftChange({ querySource: next })}
        onRun={() => void handleRun()}
      />
      <SavedQueriesBar
        queries={savedQueries}
        selectedId={querySelectedSavedId}
        name={querySavedName}
        loading={loading}
        onSelect={handleSelectSaved}
        onNameChange={(name) => onQueryDraftChange({ querySavedName: name })}
        onLoad={handleLoadSaved}
        onSave={() => void handleSaveSaved()}
        onDelete={() => void handleDeleteSaved()}
      />
      {error && <p className="query-main__error">{error}</p>}
      {statusMessage && <p className="query-main__status">{statusMessage}</p>}
      {loading && <p className="query-main__loading">実行中...</p>}
      {queryResultCount === null && !loading && (
        <p className="query-main__empty-hint">
          JS を書いて Run（Ctrl+Enter）で結果を表示します。db / admin が使えます。
        </p>
      )}
      {queryResultCount !== null && (
        <>
          <div className="query-main__workspace">
            <div className="query-main__result-label">{queryResultCount} docs</div>
            <DocumentTable
              documents={queryDocuments}
              selectedDocumentPath={queryResultSelectedPath}
              showPath={false}
              tableKey={`js-query:${queryResultCount}:${queryDocuments[0]?.path ?? 'empty'}`}
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
              documentPath={queryResultSelectedPath}
              jsonText={jsonText}
              createTime={selectedDocument?.createTime ?? null}
              updateTime={selectedDocument?.updateTime ?? null}
              documentData={selectedDocument?.data ?? null}
              loading={loading}
              onChange={() => undefined}
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
