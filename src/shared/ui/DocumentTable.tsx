import { useEffect, useMemo, useState } from 'react'
import type { DocumentSummary } from '@features/explorer/shared/types'
import Button from '@shared/ui/Button'
import {
  filterDocuments,
  getCellText,
  mergeColumnOrder,
  moveColumn,
  sortDocuments,
  type SortState
} from './document_table_utils'

type DocumentTableProps = {
  documents: DocumentSummary[]
  selectedDocumentPath: string | null
  onSelectDocument: (documentPath: string) => void
  showPath?: boolean
  selectable?: boolean
  bulkSelectedPaths?: ReadonlySet<string>
  onBulkToggle?: (documentPath: string, checked: boolean) => void
  onBulkToggleAll?: (checked: boolean) => void
  tableKey?: string
}

function nextSortState(current: SortState, column: string): SortState {
  if (!current || current.column !== column) {
    return { column, direction: 'asc' }
  }

  if (current.direction === 'asc') {
    return { column, direction: 'desc' }
  }

  return null
}

function sortIndicator(sort: SortState, column: string): string {
  if (!sort || sort.column !== column) {
    return ''
  }

  return sort.direction === 'asc' ? ' ▲' : ' ▼'
}

function DocumentTable({
  documents,
  selectedDocumentPath,
  onSelectDocument,
  showPath = false,
  selectable = false,
  bulkSelectedPaths,
  onBulkToggle,
  onBulkToggleAll,
  tableKey
}: DocumentTableProps): React.JSX.Element {
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showColumnPanel, setShowColumnPanel] = useState(false)

  useEffect(() => {
    setColumnOrder((current) => mergeColumnOrder(current, documents, showPath))
    setHiddenColumns(new Set())
    setSort(null)
    setFilters({})
  }, [tableKey, showPath])

  useEffect(() => {
    setColumnOrder((current) => mergeColumnOrder(current, documents, showPath))
  }, [documents, showPath])

  const visibleColumns = useMemo(
    () => columnOrder.filter((column) => !hiddenColumns.has(column)),
    [columnOrder, hiddenColumns]
  )

  const displayedDocuments = useMemo(() => {
    const filtered = filterDocuments(documents, filters)
    return sortDocuments(filtered, sort)
  }, [documents, filters, sort])

  const selectedCount = bulkSelectedPaths?.size ?? 0
  const allSelected =
    selectable && displayedDocuments.length > 0 && selectedCount === displayedDocuments.length

  const handleFilterChange = (column: string, value: string): void => {
    setFilters((current) => ({ ...current, [column]: value }))
  }

  const toggleColumnVisibility = (column: string): void => {
    setHiddenColumns((current) => {
      const next = new Set(current)

      if (next.has(column)) {
        next.delete(column)
      } else {
        next.add(column)
      }

      return next
    })
  }

  if (documents.length === 0) {
    return <p className="document-table__empty">ドキュメントがありません</p>
  }

  return (
    <div className="document-table-panel">
      <div className="document-table-panel__toolbar">
        <Button onClick={() => setShowColumnPanel((current) => !current)}>
          {showColumnPanel ? '列設定を閉じる' : '列設定'}
        </Button>
        <span className="document-table-panel__count">
          {displayedDocuments.length} / {documents.length} 件
        </span>
      </div>

      {showColumnPanel && (
        <div className="document-table-panel__columns">
          {columnOrder.map((column) => (
            <div key={column} className="document-table-panel__column-item">
              <label className="document-table-panel__column-label">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(column)}
                  onChange={() => toggleColumnVisibility(column)}
                />
                {column}
              </label>
              <div className="document-table-panel__column-actions">
                <button
                  type="button"
                  className="document-table-panel__move"
                  onClick={() => setColumnOrder((current) => moveColumn(current, column, 'up'))}
                  aria-label={`${column} を上へ`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="document-table-panel__move"
                  onClick={() => setColumnOrder((current) => moveColumn(current, column, 'down'))}
                  aria-label={`${column} を下へ`}
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="document-table__wrap">
        <table className="document-table">
          <thead>
            <tr>
              {selectable && (
                <th className="document-table__checkbox-col" rowSpan={2}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => onBulkToggleAll?.(event.target.checked)}
                    aria-label="全選択"
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
                <th key={column}>
                  <button
                    type="button"
                    className="document-table__sort"
                    onClick={() => setSort((current) => nextSortState(current, column))}
                  >
                    {column}
                    {sortIndicator(sort, column)}
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {visibleColumns.map((column) => (
                <th key={`${column}-filter`} className="document-table__filter-head">
                  <input
                    className="document-table__filter"
                    value={filters[column] ?? ''}
                    onChange={(event) => handleFilterChange(column, event.target.value)}
                    placeholder="フィルタ"
                    onClick={(event) => event.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedDocuments.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="document-table__empty"
                >
                  フィルタに一致するドキュメントがありません
                </td>
              </tr>
            ) : (
              displayedDocuments.map((document) => {
                const bulkSelected = bulkSelectedPaths?.has(document.path) ?? false

                return (
                  <tr
                    key={document.path}
                    className={
                      selectedDocumentPath === document.path
                        ? 'document-table__row--selected'
                        : undefined
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
                          onChange={(event) =>
                            onBulkToggle?.(document.path, event.target.checked)
                          }
                          aria-label={`Select ${document.id}`}
                        />
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td key={column}>{getCellText(document, column)}</td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DocumentTable
