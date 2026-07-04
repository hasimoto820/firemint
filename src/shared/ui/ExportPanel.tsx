import { useState } from 'react'
import type { DocumentSummary } from '@features/explorer/shared/types'
import Button from '@shared/ui/Button'

type ExportPanelCollectionProps = {
  mode: 'collection'
  collectionPath: string | null
  disabled?: boolean
  onSuccess: (message: string) => void
  onError: (message: string | null) => void
}

type ExportPanelDocumentsProps = {
  mode: 'documents'
  documents: DocumentSummary[]
  defaultFileName?: string
  disabled?: boolean
  onSuccess: (message: string) => void
  onError: (message: string | null) => void
}

type ExportPanelProps = ExportPanelCollectionProps | ExportPanelDocumentsProps

function toExportDocuments(documents: DocumentSummary[]) {
  return documents.map((document) => ({
    id: document.id,
    path: document.path,
    data: document.data
  }))
}

function ExportPanel(props: ExportPanelProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const disabled = props.disabled || loading

  const handleResult = (result: Awaited<ReturnType<typeof window.api.dataTransfer.exportCollectionJson>>): void => {
    if (result.ok) {
      props.onSuccess(`${result.data.documentCount} 件を ${result.data.filePath} に保存しました`)
      props.onError(null)
      return
    }

    if (!result.canceled) {
      props.onError(result.error)
    }
  }

  const handleExportCollectionJson = async (): Promise<void> => {
    if (props.mode !== 'collection' || !props.collectionPath) {
      return
    }

    setLoading(true)

    try {
      const result = await window.api.dataTransfer.exportCollectionJson({
        collectionPath: props.collectionPath
      })
      handleResult(result)
    } finally {
      setLoading(false)
    }
  }

  const handleExportDocumentsJson = async (): Promise<void> => {
    if (props.mode !== 'documents' || props.documents.length === 0) {
      return
    }

    setLoading(true)

    try {
      const result = await window.api.dataTransfer.exportDocumentsJson({
        documents: toExportDocuments(props.documents),
        defaultFileName: props.defaultFileName
      })
      handleResult(result)
    } finally {
      setLoading(false)
    }
  }

  const handleExportDocumentsCsv = async (): Promise<void> => {
    if (props.mode !== 'documents' || props.documents.length === 0) {
      return
    }

    setLoading(true)

    try {
      const result = await window.api.dataTransfer.exportDocumentsCsv({
        documents: toExportDocuments(props.documents),
        defaultFileName: props.defaultFileName
      })
      handleResult(result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="export-panel">
      <h3 className="export-panel__title">エクスポート</h3>
      <div className="export-panel__actions">
        {props.mode === 'collection' ? (
          <Button
            onClick={() => void handleExportCollectionJson()}
            disabled={disabled || !props.collectionPath}
          >
            JSON エクスポート
          </Button>
        ) : (
          <>
            <Button
              onClick={() => void handleExportDocumentsJson()}
              disabled={disabled || props.documents.length === 0}
            >
              JSON エクスポート
            </Button>
            <Button
              onClick={() => void handleExportDocumentsCsv()}
              disabled={disabled || props.documents.length === 0}
            >
              CSV エクスポート
            </Button>
          </>
        )}
      </div>
      {props.mode === 'collection' && (
        <p className="export-panel__hint">コレクション内の全ドキュメントを JSON で保存します</p>
      )}
      {props.mode === 'documents' && (
        <p className="export-panel__hint">表示中のクエリ結果 {props.documents.length} 件をエクスポートします</p>
      )}
    </section>
  )
}

export default ExportPanel
