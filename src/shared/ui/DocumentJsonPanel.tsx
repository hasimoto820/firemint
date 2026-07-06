import Button from '@shared/ui/Button'
import GeopointPreview from '@shared/ui/GeopointPreview'
import { findGeopointFields, formatTimestampIso } from '@shared/ui/firestore_display'

type DocumentJsonPanelProps = {
  documentPath: string | null
  jsonText: string
  createTime: string | null
  updateTime: string | null
  documentData: Record<string, unknown> | null
  loading: boolean
  onChange: (value: string) => void
  onSave: () => void
  onDelete: () => void
  onCreate: () => void
  onDuplicate?: () => void
  readOnly?: boolean
}

function DocumentJsonPanel({
  documentPath,
  jsonText,
  createTime,
  updateTime,
  documentData,
  loading,
  onChange,
  onSave,
  onDelete,
  onCreate,
  onDuplicate,
  readOnly = false
}: DocumentJsonPanelProps): React.JSX.Element {
  const geopoints = documentData ? findGeopointFields(documentData) : []

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
              <Button onClick={onDuplicate} disabled={loading || !documentPath || !onDuplicate}>
                複製
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
      {documentPath && (createTime || updateTime) && (
        <div className="document-json-panel__metadata">
          {createTime && <span>createTime: {formatTimestampIso(createTime)}</span>}
          {updateTime && <span>updateTime: {formatTimestampIso(updateTime)}</span>}
        </div>
      )}
      <GeopointPreview points={geopoints} />
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
