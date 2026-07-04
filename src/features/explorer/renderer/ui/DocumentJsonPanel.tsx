import Button from '@shared/ui/Button'

type DocumentJsonPanelProps = {
  documentPath: string | null
  jsonText: string
  loading: boolean
  onChange: (value: string) => void
  onSave: () => void
  onDelete: () => void
  onCreate: () => void
  readOnly?: boolean
}

function DocumentJsonPanel({
  documentPath,
  jsonText,
  loading,
  onChange,
  onSave,
  onDelete,
  onCreate,
  readOnly = false
}: DocumentJsonPanelProps): React.JSX.Element {
  return (
    <div className="document-json-panel">
      <div className="document-json-panel__header">
        <h2 className="document-json-panel__title">JSON</h2>
        <div className="document-json-panel__actions">
          {!readOnly && (
            <>
              <Button onClick={onCreate} disabled={loading}>
                新規
              </Button>
              <Button onClick={onSave} disabled={loading || !documentPath}>
                保存
              </Button>
              <Button variant="danger" onClick={onDelete} disabled={loading || !documentPath}>
                削除
              </Button>
            </>
          )}
        </div>
      </div>
      {documentPath && <p className="document-json-panel__path">{documentPath}</p>}
      <textarea
        className="document-json-panel__editor"
        value={jsonText}
        onChange={(event) => onChange(event.target.value)}
        placeholder='{ "field": "value" }'
        spellCheck={false}
        readOnly={readOnly}
      />
    </div>
  )
}

export default DocumentJsonPanel
