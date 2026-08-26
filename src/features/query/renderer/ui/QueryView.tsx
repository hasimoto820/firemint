import { useCallback, useEffect, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import {
  isFirestoreWriteDisabled,
  type ConnectionStatus
} from '@features/connection/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import {
  buildCollectionGroupJsQuerySource,
  buildDefaultJsQuerySource,
  matchQueryGroupTab,
  type QueryGroupTab,
  type SavedQuery
} from '@features/query/shared/types'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import type { WorkspaceTabQueryDraftPatch } from '@shared/shell/workspace_tab'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import SplitPane from '@shared/ui/SplitPane'
import TableBulkSplit from '@shared/ui/TableBulkSplit'
import { confirmAction } from '@shared/ui/confirmAction'
import { collectDataColumns } from '@shared/ui/document_table_utils'
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
  onOpenDocumentPath?: (documentPath: string) => void
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
  onQueryDraftChange,
  onOpenDocumentPath
}: QueryViewProps): React.JSX.Element {
  const { t } = useI18n()
  const projectId = status.projectId
  const readOnly = isFirestoreWriteDisabled(status)
  const autocomplete = useOptionalAutocompleteApi()
  const source = querySource ?? buildDefaultJsQuerySource(activeCollectionPath)
  const groupTab = matchQueryGroupTab(source, activeCollectionPath)
  const showResultPath = /collectionGroup\s*\(/.test(source)
  const selectedDocument =
    queryDocuments.find((document) => document.path === queryResultSelectedPath) ?? null
  const [jsonText, setJsonText] = useState('{\n  \n}')
  const [selectedCreateTime, setSelectedCreateTime] = useState<string | null>(null)
  const [selectedUpdateTime, setSelectedUpdateTime] = useState<string | null>(null)
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

  useEffect(() => {
    if (!queryResultSelectedPath) {
      setJsonText('{\n  \n}')
      setSelectedCreateTime(null)
      setSelectedUpdateTime(null)
    }
  }, [queryResultSelectedPath])

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

    const previousCollectionSeed = buildDefaultJsQuerySource(querySeededPath)
    const previousGroupSeed = buildCollectionGroupJsQuerySource(querySeededPath)
    const nextCollectionSeed = buildDefaultJsQuerySource(nextPath)
    const nextGroupSeed = buildCollectionGroupJsQuerySource(nextPath)

    // 未編集の seed のままコレクションが変わったときだけ結果を捨てて再 seed。
    // 同じ path での再マウント（タブ切替など）では Run 結果を残す。
    if (querySource.trim() === previousCollectionSeed.trim()) {
      if (querySeededPath === nextPath) {
        return
      }

      onQueryDraftChange({
        querySource: nextCollectionSeed,
        querySeededPath: nextPath,
        ...EMPTY_RESULTS_PATCH
      })
      return
    }

    if (querySource.trim() === previousGroupSeed.trim()) {
      if (querySeededPath === nextPath) {
        return
      }

      onQueryDraftChange({
        querySource: nextGroupSeed,
        querySeededPath: nextPath,
        ...(previousGroupSeed.trim() === nextGroupSeed.trim() ? {} : EMPTY_RESULTS_PATCH)
      })
      return
    }

    if (querySeededPath !== nextPath) {
      onQueryDraftChange({ querySeededPath: nextPath })
    }
    // パス変更時のみ。source を依存に入れると入力中に seed 比較がずれる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionPath])

  const handleSelectGroupTab = (tab: QueryGroupTab): void => {
    const nextSource =
      tab === 'group'
        ? buildCollectionGroupJsQuerySource(activeCollectionPath)
        : buildDefaultJsQuerySource(activeCollectionPath)

    if (source.trim() === nextSource.trim()) {
      return
    }

    onQueryDraftChange({
      querySource: nextSource,
      querySeededPath: activeCollectionPath ?? null,
      ...EMPTY_RESULTS_PATCH
    })
    setBulkSelectedPaths(new Set())
    setError(null)
    setStatusMessage(null)
  }

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
      const fields = collectDataColumns(nextDocuments)
      if (fields.length > 0) {
        autocomplete.addFieldNames(projectId, fields)
      }
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

      setJsonText(JSON.stringify(result.data.data, null, 2))
      setSelectedCreateTime(result.data.createTime)
      setSelectedUpdateTime(result.data.updateTime)

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

  // Simple ⇄ Query やタブ切替で再マウントしたとき、選択中ドキュメントの JSON を復元
  useEffect(() => {
    if (!queryResultSelectedPath) {
      return
    }

    void handleSelectDocument(queryResultSelectedPath)
    // mount 時のみ。以降の選択は onSelectDocument → handleSelectDocument
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (forceOverwrite = false): Promise<void> => {
    if (!queryResultSelectedPath || readOnly) {
      return
    }

    setLoading(true)
    setError(null)
    setStatusMessage(null)

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const result = await window.api.explorer.updateDocument({
        projectId,
        documentPath: queryResultSelectedPath,
        data: parsed,
        expectedUpdateTime: selectedUpdateTime,
        forceOverwrite
      })

      if (!result.ok) {
        if (result.code === 'conflict') {
          setLoading(false)
          setError(t('explorer.conflict.message'))
          const overwrite = await confirmAction(t('explorer.conflict.overwrite_confirm'))
          if (overwrite) {
            await handleSave(true)
            return
          }
          const reload = await confirmAction(t('explorer.conflict.reload_confirm'))
          if (reload) {
            await handleSelectDocument(queryResultSelectedPath)
          }
          return
        }

        setError(result.error)
        return
      }

      autocomplete.addFieldNames(projectId, Object.keys(parsed))
      await handleSelectDocument(queryResultSelectedPath)
      setStatusMessage('保存しました')
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'JSON の形式が正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!queryResultSelectedPath || readOnly) {
      return
    }

    if (!(await confirmAction('このドキュメントを削除しますか？'))) {
      return
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    setLoading(true)
    setError(null)
    setStatusMessage(null)

    try {
      const result = await window.api.explorer.deleteDocument(projectId, queryResultSelectedPath)
      if (!result.ok) {
        setError(result.error)
        return
      }

      const deletedPath = queryResultSelectedPath
      const nextDocuments = queryDocuments.filter((document) => document.path !== deletedPath)
      setBulkSelectedPaths((current) => {
        const next = new Set(current)
        next.delete(deletedPath)
        return next
      })
      onQueryDraftChange({
        queryDocuments: nextDocuments,
        queryResultCount: nextDocuments.length,
        queryResultSelectedPath: null
      })
      setJsonText('{\n  \n}')
      setSelectedCreateTime(null)
      setSelectedUpdateTime(null)
      setStatusMessage('削除しました')
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
    if (!(await confirmAction(`「${selected?.name ?? querySelectedSavedId}」を削除しますか？`))) {
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
      <SplitPane
        className="query-main__split"
        orientation="vertical"
        storageKey="query.editor"
        defaultSize={200}
        unit="px"
        minFirst={96}
        minSecond={160}
        ariaLabel="クエリエディタの高さ"
        first={
          <QueryEditor
            projectId={projectId}
            source={source}
            loading={loading}
            groupTab={groupTab}
            onChange={(next) => onQueryDraftChange({ querySource: next })}
            onSelectGroupTab={handleSelectGroupTab}
            onRun={() => void handleRun()}
          />
        }
        second={
          <div className="query-main__after-editor">
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
                Run で絞り込み → 行を選んで JSON を保存、またはチェックして一括。db / admin
                が使えます。
              </p>
            )}
            {queryResultCount !== null && (
              <SplitPane
                className="query-main__result-split"
                orientation="vertical"
                storageKey="query.json"
                sizeTarget="second"
                defaultSize={36}
                unit="percent"
                minFirst={100}
                minSecond={100}
                ariaLabel="JSON パネルの高さ"
                first={
                  <div className="query-main__workspace">
                    <div className="query-main__result-label">{queryResultCount} docs</div>
                    <TableBulkSplit
                      table={
                    <DocumentTable
                      documents={queryDocuments}
                      selectedDocumentPath={queryResultSelectedPath}
                      showPath={showResultPath}
                      tableKey={`js-query:${queryResultCount}:${queryDocuments[0]?.path ?? 'empty'}`}
                      columnWidthsKey="table.col:js-query"
                      projectId={projectId}
                      selectable={!readOnly}
                      bulkSelectedPaths={bulkSelectedPaths}
                      onBulkToggle={handleBulkToggle}
                      onBulkToggleAll={handleBulkToggleAll}
                      onSelectDocument={(path) => void handleSelectDocument(path)}
                    />
                      }
                      bulk={
                        !readOnly && bulkSelectedPaths.size > 0 ? (
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
                        ) : null
                      }
                    />
                  </div>
                }
                second={
                  <div className="query-main__json">
                    <DocumentJsonPanel
                      projectId={projectId}
                      documentPath={queryResultSelectedPath}
                      jsonText={jsonText}
                      createTime={selectedCreateTime}
                      updateTime={selectedUpdateTime}
                      documentData={selectedDocument?.data ?? null}
                      loading={loading}
                      onChange={setJsonText}
                      onSave={() => void handleSave()}
                      onDelete={() => void handleDelete()}
                      onCreate={() => undefined}
                      showCreate={false}
                      readOnly={readOnly}
                      onOpenReference={onOpenDocumentPath}
                    />
                  </div>
                }
              />
            )}
          </div>
        }
      />
    </div>
  )
}

export default QueryView
