import { useCallback, useEffect, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import type { ConnectionStatus } from '@features/connection/shared/types'
import type { ImpExpIntent } from '@features/data_transfer/shared/imp_exp'
import type { DocumentSummary } from '@features/explorer/shared/types'
import { isSubcollectionPath } from '@features/explorer/shared/tree'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useRegisterAppMenu } from '@shared/shell/AppMenuContext'
import { confirmAction } from '@shared/ui/confirmAction'
import DocumentJsonPanel from '@shared/ui/DocumentJsonPanel'
import DocumentTable from '@shared/ui/DocumentTable'
import BulkActionsPanel from '@shared/ui/BulkActionsPanel'
import { collectDataColumns } from '@shared/ui/document_table_utils'

type SimpleViewProps = {
  status: ConnectionStatus
  activeCollectionPath: string | null
  selectedDocumentPath: string | null
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string | null) => void
  onRootCollectionsChanged: () => void
  onRequestRenameCollection: (collectionPath: string) => void
  onRequestFieldBulkRename: (collectionPath: string) => void
  onRequestCreateSubcollection: (documentPath: string) => void
  onRequestDeleteSubcollection: (collectionPath: string) => void
  collectionDataReloadToken?: number
  /** ドキュメントの増減後に左ツリーを更新する */
  onCollectionDocumentsChanged?: () => void
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
  onRequestRenameCollection,
  onRequestFieldBulkRename,
  onRequestCreateSubcollection,
  onRequestDeleteSubcollection,
  collectionDataReloadToken = 0,
  onCollectionDocumentsChanged,
  menuEnabled = true,
  onOpenImpExp
}: SimpleViewProps): React.JSX.Element {
  const { t } = useI18n()
  const projectId = status.projectId
  const readOnly = status.readOnly
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
        setBulkSelectedPaths(new Set())
        const fields = collectDataColumns(result.data)
        if (fields.length > 0) {
          autocomplete.addFieldNames(projectId, fields)
        }
      } finally {
        setLoading(false)
      }
    },
    [autocomplete, projectId]
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
      return
    }

    void loadDocuments(activeCollectionPath)
  }, [activeCollectionPath, collectionDataReloadToken, loadDocuments])

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

      await loadDocuments(activeCollectionPath)
      onSelectDocument(null)
      onCollectionDocumentsChanged?.()
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

      autocomplete.addFieldNames(projectId, Object.keys(parsed))

      await loadDocuments(activeCollectionPath)
      onSelectDocument(`${activeCollectionPath}/${result.data}`)
      onCollectionDocumentsChanged?.()
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
    onCollectionDocumentsChanged?.()
  }

  const handleDuplicateDocument = async (): Promise<void> => {
    if (!selectedDocumentPath || !activeCollectionPath) {
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

      await loadDocuments(activeCollectionPath)
      const newPath = `${activeCollectionPath}/${result.data}`
      onSelectDocument(newPath)
      onCollectionDocumentsChanged?.()
      setSuccessMessage(`ドキュメントを複製しました: ${newPath}`)
    } finally {
      setLoading(false)
    }
  }

  const handleExportCollection = (): void => {
    onOpenImpExp?.({ direction: 'export', target: 'collection' })
  }

  const handleImportCollection = (): void => {
    onOpenImpExp?.({ direction: 'import', target: 'collection' })
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

      onRootCollectionsChanged()
      onSelectCollection(result.data.targetCollectionPath)
      setSuccessMessage(
        `${result.data.copiedCount} 件を ${result.data.targetCollectionPath} に複製しました`
      )
    } finally {
      setLoading(false)
    }
  }

  const handleRenameCollection = (): void => {
    if (!activeCollectionPath || readOnly) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestRenameCollection(activeCollectionPath)
  }

  const handleRenameFieldBulk = (): void => {
    if (!activeCollectionPath || readOnly) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    onRequestFieldBulkRename(activeCollectionPath)
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

  useRegisterAppMenu(
    menuEnabled
      ? {
          canCreate: !readOnly && Boolean(activeCollectionPath),
          canSave: !readOnly && Boolean(selectedDocumentPath),
          canDuplicate: !readOnly && Boolean(selectedDocumentPath),
          canDelete: !readOnly && Boolean(selectedDocumentPath),
          canExport: Boolean(activeCollectionPath),
          canImport: Boolean(activeCollectionPath),
          canDuplicateCollection: !readOnly && Boolean(activeCollectionPath),
          canRenameCollection: !readOnly && Boolean(activeCollectionPath),
          canRenameFieldBulk: !readOnly && Boolean(activeCollectionPath),
          canCreateSubcollection: !readOnly && Boolean(selectedDocumentPath),
          canDeleteSubcollection:
            !readOnly &&
            activeCollectionPath !== null &&
            isSubcollectionPath(activeCollectionPath),
          onCreate: () => void handleCreate(),
          onSave: () => void handleSave(),
          onDuplicate: () => void handleDuplicateDocument(),
          onDelete: () => void handleDelete(),
          onExport: handleExportCollection,
          onImport: handleImportCollection,
          onDuplicateCollection: () => void handleDuplicateCollection(),
          onRenameCollection: () => handleRenameCollection(),
          onRenameFieldBulk: () => handleRenameFieldBulk(),
          onCreateSubcollection: () => handleCreateSubcollection(),
          onDeleteSubcollection: () => handleDeleteSubcollection()
        }
      : {
          canCreate: false,
          canSave: false,
          canDuplicate: false,
          canDelete: false,
          canExport: false,
          canImport: false,
          canDuplicateCollection: false,
          canRenameCollection: false,
          canRenameFieldBulk: false,
          canCreateSubcollection: false,
          canDeleteSubcollection: false
        },
    [menuEnabled, readOnly, activeCollectionPath, selectedDocumentPath, jsonText, onOpenImpExp]
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

      <div className="simple-main__workspace">
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
          onCreate={() => void handleCreate()}
          onDuplicate={() => void handleDuplicateDocument()}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}

export default SimpleView
