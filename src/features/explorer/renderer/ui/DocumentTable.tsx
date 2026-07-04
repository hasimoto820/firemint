import type { DocumentSummary } from '@features/explorer/shared/types'

type DocumentTableProps = {
  documents: DocumentSummary[]
  selectedDocumentPath: string | null
  onSelectDocument: (documentPath: string) => void
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
  onSelectDocument
}: DocumentTableProps): React.JSX.Element {
  const columns = collectColumns(documents)

  if (documents.length === 0) {
    return <p className="document-table__empty">ドキュメントがありません</p>
  }

  return (
    <div className="document-table__wrap">
      <table className="document-table">
        <thead>
          <tr>
            <th>id</th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr
              key={document.path}
              className={
                selectedDocumentPath === document.path ? 'document-table__row--selected' : undefined
              }
              onClick={() => onSelectDocument(document.path)}
            >
              <td>{document.id}</td>
              {columns.map((column) => (
                <td key={column}>{formatCellValue(document.data[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default DocumentTable
