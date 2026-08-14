import { useFieldAutocompleteItems } from '@features/autocomplete/renderer/hooks'
import Button from '@shared/ui/Button'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import GeopointPreview from '@shared/ui/GeopointPreview'
import ImagePreview from '@shared/ui/ImagePreview'
import { findGeopointFields, findImageUrlFields, formatTimestampIso } from '@shared/ui/firestore_display'

type DocumentJsonPanelProps = {
  projectId?: string
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
  projectId = '',
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
  const imageUrls = documentData ? findImageUrlFields(documentData) : []
  const fieldItems = useFieldAutocompleteItems(projectId)

  return (
    <div className="document-json-panel">
      <div className="document-json-panel__header">
        <h2 className="document-json-panel__title">ドキュメント</h2>
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
      <ImagePreview images={imageUrls} />
      <h3 className="document-json-panel__json-label">JSON</h3>
      {readOnly ? (
        <textarea
          className="document-json-panel__editor"
          value={jsonText}
          onChange={() => undefined}
          placeholder='{ "field": "value" }'
          spellCheck={false}
          readOnly
        />
      ) : (
        <AutocompleteInput
          key={documentPath ?? 'new-document'}
          value={jsonText}
          items={fieldItems}
          multiline
          wordCompletion
          placeholder='{ "field": "value" }'
          fieldClassName="document-json-panel__editor"
          aria-label="ドキュメント JSON"
          onChange={onChange}
        />
      )}
    </div>
  )
}

export default DocumentJsonPanel
