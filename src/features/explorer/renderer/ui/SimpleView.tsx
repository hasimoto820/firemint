import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import {
  isFirestoreWriteDisabled,
  type ConnectionStatus
} from '@features/connection/shared/types'
import type { ImpExpIntent } from '@features/data_transfer/shared/imp_exp'
import type { BulkFieldMode } from '@features/bulk_operations/shared/types'
import type { DocumentSummary } from '@features/explorer/shared/types'
import { LIST_DOCUMENTS_PAGE_SIZE } from '@features/explorer/shared/types'
import { isSubcollectionPath } from '@features/explorer/shared/tree'
import { runDuplicateCollection } from '@features/explorer/renderer/duplicateCollection'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useRegisterAppMenu } from '@shared/shell/AppMenuContext'
import { confirmAction } from '@shared/ui/confirmAction'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import SplitPane from '@shared/ui/SplitPane'
import TableBulkSplit from '@shared/ui/TableBulkSplit'
import { collectDataColumns } from '@shared/ui/document_table_utils'

type SimpleViewProps = {
  status: ConnectionStatus
  activeCollectionPath: string | null
  selectedDocumentPath: string | null
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string | null) => void
  onRootCollectionsChanged: () => void
  onRequestCreateCollection: () => void
  onRequestCreateDocument: (collectionPath: string) => void
  onRequestDuplicateDocument: (documentPath: string) => void
  onRequestRenameCollection: (collectionPath: string) => void
  onRequestCreateSubcollection: (documentPath: string) => void
  onRequestDeleteSubcollection: (collectionPath: string) => void
  onRequestFieldBulk?: (mode: BulkFieldMode) => void
  collectionDataReloadToken?: number
  /** ドキュメントの増減後に左ツリーを更新する */
  onCollectionDocumentsChanged?: () => void
  /** ドキュメント削除などでコレクションが空になった（Firestore 上は消滅） */
  onCollectionBecameEmpty?: (collectionPath: string) => void
  /** Reference などから別ドキュメントを開く */
  onOpenDocumentPath?: (documentPath: string) => void
  /** Split 時など、メニュー登録を行うのはフォーカス側のペインのみ */
  menuEnabled?: boolean
  onOpenImpExp?: (intent?: ImpExpIntent) => void
}

/**
 * Firestore 作業エリアの「Simple」モード。ツリーで選択中のコレクション /
 * ドキュメントを一覧・JSON 表示し、CRUD を行う。選択状態は親（FirestorePage）
 * が保持し、props で受け取る。
 */
function SimpleView({
  status,
  activeCollectionPath,
  selectedDocumentPath,
  onSelectCollection,
  onSelectDocument,
  onRootCollectionsChanged,
  onRequestCreateCollection,
  onRequestCreateDocument,
  onRequestDuplicateDocument,
  onRequestRenameCollection,
  onRequestCreateSubcollection,
  onRequestDeleteSubcollection,
  onRequestFieldBulk,
  collectionDataReloadToken = 0,
  onCollectionDocumentsChanged,
  onCollectionBecameEmpty,
  onOpenDocumentPath,
  menuEnabled = true,
  onOpenImpExp
}: SimpleViewProps): React.JSX.Element {
  const { t } = useI18n()
  const projectId = status.projectId
  const readOnly = isFirestoreWriteDisabled(status)
  const autocomplete = useOptionalAutocompleteApi()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
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
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(LIST_DOCUMENTS_PAGE_SIZE)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [seeking, setSeeking] = useState(false)
  const [seekStatus, setSeekStatus] = useState<string | null>(null)
  const pageIndexRef = useRef(0)
  const hasMoreRef = useRef(false)
  /** pageStartCursors[i] = ページ i を読むときの startAfterId（0 ページ目は null） */
  const pageStartCursorsRef = useRef<(string | null)[]>([null])
  const seekCanceledRef = useRef(false)

  const refreshTotalCount = useCallback(
    async (collectionPath: string): Promise<void> => {
      const result = await window.api.explorer.countDocuments(projectId, collectionPath)
      if (result.ok) {
        setTotalCount(result.data)
        return
      }

      setTotalCount(null)
    },
    [projectId]
  )

  const loadDocumentsPage = useCallback(
    async (
      collectionPath: string,
      targetPage: number,
      options?: { retainLoading?: boolean }
    ): Promise<DocumentSummary[] | null> => {
      if (!options?.retainLoading) {
        setLoading(true)
      }
      setError(null)

      try {
        const cursors = pageStartCursorsRef.current
        if (targetPage > 0 && cursors[targetPage] === undefined) {
          setError(`ページ ${targetPage + 1} へ進むための位置情報がありません`)
          return null
        }

        const startAfterId = cursors[targetPage] ?? null
        const result = await window.api.explorer.listDocuments(projectId, collectionPath, {
          startAfterId
        })

        if (!result.ok) {
          setError(result.error)
          setDocuments([])
          setHasMore(false)
          hasMoreRef.current = false
          return null
        }

        const {
          documents: pageDocs,
          hasMore: more,
          nextCursor,
          pageSize: size
        } = result.data

        const nextCursors = cursors.slice(0, targetPage + 1)
        if (more && nextCursor) {
          nextCursors[targetPage + 1] = nextCursor
        }
        pageStartCursorsRef.current = nextCursors
        pageIndexRef.current = targetPage
        hasMoreRef.current = more

        setDocuments(pageDocs)
        setHasMore(more)
        setPageSize(size)
        setPageIndex(targetPage)
        setBulkSelectedPaths(new Set())

        const fields = collectDataColumns(pageDocs)
        if (fields.length > 0) {
          autocomplete.addFieldNames(projectId, fields)
        }

        return pageDocs
      } finally {
        if (!options?.retainLoading) {
          setLoading(false)
        }
      }
    },
    [autocomplete, projectId]
  )

  const resetAndLoadFirstPage = useCallback(
    async (collectionPath: string): Promise<DocumentSummary[] | null> => {
      pageStartCursorsRef.current = [null]
      pageIndexRef.current = 0
      void refreshTotalCount(collectionPath)
      return loadDocumentsPage(collectionPath, 0)
    },
    [loadDocumentsPage, refreshTotalCount]
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
    if (!activeCollectionPath) {
      setDocuments([])
      setBulkSelectedPaths(new Set())
      setPageIndex(0)
      setHasMore(false)
      setTotalCount(null)
      pageStartCursorsRef.current = [null]
      pageIndexRef.current = 0
      return
    }

    void resetAndLoadFirstPage(activeCollectionPath)
  }, [activeCollectionPath, collectionDataReloadToken, resetAndLoadFirstPage])

  useEffect(() => {
    if (!selectedDocumentPath) {
      setSelectedCreateTime(null)
      setSelectedUpdateTime(null)
      setSelectedDocumentData(null)
      setJsonText('{\n  \n}')
      return
    }

    void loadDocument(selectedDocumentPath)
  }, [selectedDocumentPath, loadDocument])

  const handleSave = async (forceOverwrite = false): Promise<void> => {
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
            await loadDocument(selectedDocumentPath)
          }
          return
        }

        setError(result.error)
        return
      }

      autocomplete.addFieldNames(projectId, Object.keys(parsed))

      if (activeCollectionPath) {
        await loadDocumentsPage(activeCollectionPath, pageIndexRef.current)
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

    if (!(await confirmAction('このドキュメントを削除しますか？'))) {
      return
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.explorer.deleteDocument(projectId, selectedDocumentPath)
      if (!result.ok) {
        setError(result.error)
        return
      }

      const documentsAfterDelete = await loadDocumentsPage(
        activeCollectionPath,
        pageIndexRef.current
      )
      if (documentsAfterDelete && documentsAfterDelete.length === 0) {
        if (pageIndexRef.current > 0) {
          await loadDocumentsPage(activeCollectionPath, pageIndexRef.current - 1)
          void refreshTotalCount(activeCollectionPath)
          onSelectDocument(null)
          onCollectionDocumentsChanged?.()
          return
        }

        onCollectionBecameEmpty?.(activeCollectionPath)
        return
      }

      void refreshTotalCount(activeCollectionPath)
      onSelectDocument(null)
      onCollectionDocumentsChanged?.()
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = (): void => {
    if (!activeCollectionPath || readOnly) {
      setError('コレクションを選択してください')
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestCreateDocument(activeCollectionPath)
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

    const documentsAfterDelete = await loadDocumentsPage(
      activeCollectionPath,
      pageIndexRef.current
    )
    if (documentsAfterDelete && documentsAfterDelete.length === 0) {
      if (pageIndexRef.current > 0) {
        await loadDocumentsPage(activeCollectionPath, pageIndexRef.current - 1)
        void refreshTotalCount(activeCollectionPath)
        onCollectionDocumentsChanged?.()
        return
      }

      onCollectionBecameEmpty?.(activeCollectionPath)
      return
    }

    void refreshTotalCount(activeCollectionPath)
    onCollectionDocumentsChanged?.()
  }

  const handleFirstPage = (): void => {
    if (!activeCollectionPath || pageIndex <= 0 || loading || seeking) {
      return
    }

    void loadDocumentsPage(activeCollectionPath, 0)
  }

  const handlePrevPage = (): void => {
    if (!activeCollectionPath || pageIndex <= 0 || loading || seeking) {
      return
    }

    void loadDocumentsPage(activeCollectionPath, pageIndex - 1)
  }

  const handleNextPage = (): void => {
    if (!activeCollectionPath || !hasMore || loading || seeking) {
      return
    }

    void loadDocumentsPage(activeCollectionPath, pageIndex + 1)
  }

  const handleCancelSeek = (): void => {
    seekCanceledRef.current = true
  }

  const runSeek = async (
    collectionPath: string,
    options: {
      targetPage?: number
      toLast?: boolean
      label: string
    }
  ): Promise<void> => {
    seekCanceledRef.current = false
    setSeeking(true)
    setLoading(true)
    setError(null)

    try {
      let walkPage = pageStartCursorsRef.current.length - 1
      if (walkPage < 0) {
        walkPage = 0
      }

      while (true) {
        if (seekCanceledRef.current) {
          setSeekStatus('停止しました')
          return
        }

        if (options.toLast) {
          setSeekStatus(`最終ページへ…（${walkPage + 1}）`)
        } else if (options.targetPage !== undefined) {
          if (walkPage >= options.targetPage) {
            break
          }
          setSeekStatus(`${walkPage + 1} → ${options.label}…`)
        }

        const docs = await loadDocumentsPage(collectionPath, walkPage, {
          retainLoading: true
        })

        if (!docs) {
          return
        }

        if (!hasMoreRef.current) {
          if (options.toLast) {
            setSeekStatus(null)
            return
          }

          if (options.targetPage !== undefined && walkPage < options.targetPage) {
            setError(`ページ ${options.label} はありません（最終は ${walkPage + 1} ページ）`)
          }
          setSeekStatus(null)
          return
        }

        walkPage += 1

        if (options.targetPage !== undefined && walkPage >= options.targetPage) {
          break
        }
      }

      if (seekCanceledRef.current) {
        setSeekStatus('停止しました')
        return
      }

      if (options.targetPage !== undefined) {
        setSeekStatus(`${options.label} を表示…`)
        await loadDocumentsPage(collectionPath, options.targetPage, { retainLoading: true })
      }

      setSeekStatus(null)
    } finally {
      setSeeking(false)
      setLoading(false)
    }
  }

  const handleGoToPage = (pageNumber1Based: number): void => {
    if (!activeCollectionPath || loading || seeking) {
      return
    }

    const targetPage = pageNumber1Based - 1
    if (targetPage < 0) {
      return
    }

    if (targetPage === pageIndexRef.current) {
      return
    }

    const knownLast = pageStartCursorsRef.current.length - 1
    if (targetPage <= knownLast) {
      void loadDocumentsPage(activeCollectionPath, targetPage)
      return
    }

    void runSeek(activeCollectionPath, {
      targetPage,
      label: `${pageNumber1Based} ページ`
    })
  }

  const handleLastPage = (): void => {
    if (!activeCollectionPath || !hasMore || loading || seeking) {
      return
    }

    void runSeek(activeCollectionPath, {
      toLast: true,
      label: '最終ページ'
    })
  }

  const rangeFrom = documents.length === 0 ? 0 : pageIndex * pageSize + 1
  const rangeTo = pageIndex * pageSize + documents.length
  const rangeLabel =
    documents.length === 0
      ? totalCount === null
        ? '0 件'
        : `0 / ${totalCount} 件`
      : totalCount === null
        ? `${rangeFrom}–${rangeTo} 件`
        : `${rangeFrom}–${rangeTo} / ${totalCount} 件`

  const handleDuplicateDocument = (): void => {
    if (!selectedDocumentPath || readOnly) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestDuplicateDocument(selectedDocumentPath)
  }

  const handleExportCollection = (): void => {
    onOpenImpExp?.({ direction: 'export', target: 'collection' })
  }

  const handleImportCollection = (): void => {
    onOpenImpExp?.({ direction: 'import', target: 'project' })
  }

  const duplicateOpenCollection = async (): Promise<void> => {
    if (!activeCollectionPath) {
      setError('コレクションを選択してください')
      return
    }

    const outcome = await runDuplicateCollection(projectId, activeCollectionPath)

    if (outcome.status === 'canceled') {
      return
    }

    if (outcome.status === 'error') {
      setError(outcome.error)
      return
    }

    onRootCollectionsChanged()
    onCollectionDocumentsChanged?.()
    onSelectCollection(outcome.targetCollectionPath)
    setSuccessMessage(
      `${outcome.copiedCount} 件を ${outcome.targetCollectionPath} に複製しました`
    )
  }

  const handleDuplicateCollection = async (): Promise<void> => {
    if (!activeCollectionPath || isSubcollectionPath(activeCollectionPath)) {
      return
    }

    await duplicateOpenCollection()
  }

  const handleCreateCollection = (): void => {
    if (readOnly) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestCreateCollection()
  }

  const handleRenameCollection = (): void => {
    if (!activeCollectionPath || readOnly || isSubcollectionPath(activeCollectionPath)) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestRenameCollection(activeCollectionPath)
  }

  const handleDeleteCollection = (): void => {
    if (!activeCollectionPath || readOnly || isSubcollectionPath(activeCollectionPath)) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestDeleteSubcollection(activeCollectionPath)
  }

  const handleRenameSubcollection = (): void => {
    if (!activeCollectionPath || readOnly || !isSubcollectionPath(activeCollectionPath)) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestRenameCollection(activeCollectionPath)
  }

  const handleDuplicateSubcollection = async (): Promise<void> => {
    if (!activeCollectionPath || !isSubcollectionPath(activeCollectionPath)) {
      return
    }

    await duplicateOpenCollection()
  }

  const handleCreateSubcollection = (): void => {
    if (!selectedDocumentPath || readOnly) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestCreateSubcollection(selectedDocumentPath)
  }

  const handleDeleteSubcollection = (): void => {
    if (!activeCollectionPath || readOnly || !isSubcollectionPath(activeCollectionPath)) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestDeleteSubcollection(activeCollectionPath)
  }

  const isNestedCollection =
    activeCollectionPath !== null && isSubcollectionPath(activeCollectionPath)
  const isRootCollection = Boolean(activeCollectionPath) && !isNestedCollection

  useRegisterAppMenu(
    menuEnabled
      ? {
          canCreate: !readOnly && Boolean(activeCollectionPath),
          canSave: !readOnly && Boolean(selectedDocumentPath),
          canDuplicate: !readOnly && Boolean(selectedDocumentPath),
          canDelete: !readOnly && Boolean(selectedDocumentPath),
          canExport: Boolean(activeCollectionPath),
          canImport: Boolean(activeCollectionPath),
          canCreateCollection: !readOnly,
          canRenameCollection: !readOnly && isRootCollection,
          canDuplicateCollection: !readOnly && isRootCollection,
          canDeleteCollection: !readOnly && isRootCollection,
          canCreateSubcollection: !readOnly && Boolean(selectedDocumentPath),
          canRenameSubcollection: !readOnly && isNestedCollection,
          canDuplicateSubcollection: !readOnly && isNestedCollection,
          canDeleteSubcollection: !readOnly && isNestedCollection,
          canCreateFieldBulk: !readOnly && Boolean(activeCollectionPath),
          canUpdateFieldBulk: !readOnly && Boolean(activeCollectionPath),
          canRenameFieldBulk: !readOnly && Boolean(activeCollectionPath),
          canDeleteFieldBulk: !readOnly && Boolean(activeCollectionPath),
          onCreate: () => handleCreate(),
          onSave: () => void handleSave(),
          onDuplicate: () => void handleDuplicateDocument(),
          onDelete: () => void handleDelete(),
          onExport: handleExportCollection,
          onImport: handleImportCollection,
          onCreateCollection: () => handleCreateCollection(),
          onRenameCollection: () => handleRenameCollection(),
          onDuplicateCollection: () => void handleDuplicateCollection(),
          onDeleteCollection: () => handleDeleteCollection(),
          onCreateSubcollection: () => handleCreateSubcollection(),
          onRenameSubcollection: () => handleRenameSubcollection(),
          onDuplicateSubcollection: () => void handleDuplicateSubcollection(),
          onDeleteSubcollection: () => handleDeleteSubcollection(),
          onCreateFieldBulk: () => onRequestFieldBulk?.('create'),
          onUpdateFieldBulk: () => onRequestFieldBulk?.('update'),
          onRenameFieldBulk: () => onRequestFieldBulk?.('rename'),
          onDeleteFieldBulk: () => onRequestFieldBulk?.('delete')
        }
      : {
          canCreate: false,
          canSave: false,
          canDuplicate: false,
          canDelete: false,
          canExport: false,
          canImport: false,
          canCreateCollection: false,
          canRenameCollection: false,
          canDuplicateCollection: false,
          canDeleteCollection: false,
          canCreateSubcollection: false,
          canRenameSubcollection: false,
          canDuplicateSubcollection: false,
          canDeleteSubcollection: false,
          canCreateFieldBulk: false,
          canUpdateFieldBulk: false,
          canRenameFieldBulk: false,
          canDeleteFieldBulk: false
        },
    [menuEnabled, readOnly, activeCollectionPath, selectedDocumentPath, jsonText, onOpenImpExp, onRequestFieldBulk, onRequestCreateDocument, onRequestDuplicateDocument]
  )

  if (!activeCollectionPath) {
    return (
      <div className="simple-main simple-main--empty">
        <p className="simple-main__empty-title">コレクションを選択してください</p>
        <p className="simple-main__empty-hint">
          左のツリーからコレクションを選ぶと、ドキュメント一覧と JSON 編集が表示されます。
        </p>
      </div>
    )
  }

  return (
    <div className="simple-main">
      {(error || successMessage || loading) && (
        <div className="simple-main__status">
          {error && <p className="simple-main__error">{error}</p>}
          {successMessage && <p className="simple-main__success">{successMessage}</p>}
          {loading && <p className="simple-main__loading">読み込み中...</p>}
        </div>
      )}

      <SplitPane
        className="simple-main__split"
        orientation="vertical"
        storageKey="simple.json"
        sizeTarget="second"
        defaultSize={38}
        unit="percent"
        minFirst={120}
        minSecond={120}
        ariaLabel="JSON パネルの高さ"
        first={
          <div className="simple-main__workspace">
            <TableBulkSplit
              table={
            <DocumentTable
              documents={documents}
              selectedDocumentPath={selectedDocumentPath}
              tableKey={activeCollectionPath}
              projectId={projectId}
              selectable={!readOnly}
              bulkSelectedPaths={bulkSelectedPaths}
              onBulkToggle={handleBulkToggle}
              onBulkToggleAll={handleBulkToggleAll}
              onSelectDocument={(path) => onSelectDocument(path)}
              paging={{
                rangeLabel,
                hasPrev: pageIndex > 0,
                hasNext: hasMore,
                hasLast: hasMore,
                disabled: loading,
                pageNumber: pageIndex + 1,
                seeking,
                seekStatus,
                onFirst: handleFirstPage,
                onPrev: handlePrevPage,
                onNext: handleNextPage,
                onLast: handleLastPage,
                onGoToPage: handleGoToPage,
                onCancelSeek: handleCancelSeek
              }}
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
          <div className="simple-main__json">
            <DocumentJsonPanel
              projectId={projectId}
              documentPath={selectedDocumentPath}
              jsonText={jsonText}
              createTime={selectedCreateTime}
              updateTime={selectedUpdateTime}
              documentData={selectedDocumentData}
              loading={loading}
              onChange={setJsonText}
              onSave={() => void handleSave()}
              onDelete={() => void handleDelete()}
              onCreate={() => handleCreate()}
              onDuplicate={() => void handleDuplicateDocument()}
              onOpenReference={onOpenDocumentPath}
              readOnly={readOnly}
            />
          </div>
        }
      />
    </div>
  )
}

export default SimpleView
