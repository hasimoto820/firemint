import type { DocumentSummary } from '@features/explorer/shared/types'

type DocumentTableProps = {
  documents: DocumentSummary[]
  selectedDocumentPath: string | null
  onSelectDocument: (documentPath: string) => void
  showPath?: boolean
  selectable?: boolean
  bulkSelectedPaths?: ReadonlySet<string>
  onBulkToggle?: (documentPath: string, checked: boolean) => void
  onBulkToggleAll?: (checked: boolean) => void
}

function collectColumns(documents: DocumentSummary[]): string[] {
  const columns = new Set<string>()

  for (const document of documents) {
    for (const key of Object.keys(document.data)) {
      columns.add(key)
    }
  }

  return Array.from(columns).sort()
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function DocumentTable({
  documents,
  selectedDocumentPath,
  onSelectDocument,
  showPath = false,
  selectable = false,
  bulkSelectedPaths,
  onBulkToggle,
  onBulkToggleAll
}: DocumentTableProps): React.JSX.Element {
  const columns = collectColumns(documents)
  const selectedCount = bulkSelectedPaths?.size ?? 0
  const allSelected = selectable && documents.length > 0 && selectedCount === documents.length

  if (documents.length === 0) {
    return <p className="document-table__empty">ドキュメントがありません</p>
  }

  return (
    <div className="document-table__wrap">
      <table className="document-table">
        <thead>
          <tr>
            {selectable && (
              <th className="document-table__checkbox-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onBulkToggleAll?.(event.target.checked)}
                  aria-label="全選択"
                />
              </th>
            )}
            <th>id</th>
            {showPath && <th>path</th>}
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => {
            const bulkSelected = bulkSelectedPaths?.has(document.path) ?? false

            return (
              <tr
                key={document.path}
                className={
                  selectedDocumentPath === document.path ? 'document-table__row--selected' : undefined
                }
                onClick={() => onSelectDocument(document.path)}
              >
                {selectable && (
                  <td
                    className="document-table__checkbox-col"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={bulkSelected}
                      onChange={(event) => onBulkToggle?.(document.path, event.target.checked)}
                      aria-label={`Select ${document.id}`}
                    />
                  </td>
                )}
                <td>{document.id}</td>
                {showPath && <td>{document.path}</td>}
                {columns.map((column) => (
                  <td key={column}>{formatCellValue(document.data[column])}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default DocumentTable
