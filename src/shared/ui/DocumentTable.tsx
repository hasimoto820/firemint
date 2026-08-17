import { useEffect, useMemo, useState } from 'react'
import { useFieldAutocompleteItems } from '@features/autocomplete/renderer/hooks'
import type { DocumentSummary } from '@features/explorer/shared/types'
import Button from '@shared/ui/Button'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import {
  createEmptyFilterClause,
  filterDocuments,
  getCellText,
  isFilterClauseActive,
  isUnaryFilterOperator,
  mergeColumnOrder,
  moveColumn,
  sortDocuments,
  TABLE_FILTER_OPERATORS,
  type SortState,
  type TableFilterClause,
  type TableFilterOperator
} from './document_table_utils'

type DocumentTablePaging = {
  rangeLabel: string
  hasPrev: boolean
  hasNext: boolean
  /** 末尾ページへ進めるか（続きがあるとき true。最終ページでは false） */
  hasLast?: boolean
  disabled?: boolean
  /** 1 始まりの現在ページ */
  pageNumber: number
  seeking?: boolean
  seekStatus?: string | null
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
  /** 1 始まりのページ番号へ移動 */
  onGoToPage: (pageNumber: number) => void
  onCancelSeek?: () => void
}

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
  projectId?: string
  paging?: DocumentTablePaging
}

function filterValuePlaceholder(operator: TableFilterOperator): string {
  switch (operator) {
    case 'in':
      return '例: ["a","b"] または a, b'
    case 'array-contains':
      return '配列内の1値（例: beta）'
    case 'contains':
      return '部分一致する文字列'
    case 'exists':
    case 'not-exists':
      return '（不要）'
    default:
      return '値を入力'
  }
}

const MAX_FILTER_CLAUSES = 5

function DocumentTablePagingControls({
  paging,
  countLabel
}: {
  paging: DocumentTablePaging
  countLabel: string
}): React.JSX.Element {
  const [pageInput, setPageInput] = useState(String(paging.pageNumber))

  useEffect(() => {
    setPageInput(String(paging.pageNumber))
  }, [paging.pageNumber])

  const submitGoToPage = (): void => {
    const parsed = Number.parseInt(pageInput.trim(), 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPageInput(String(paging.pageNumber))
      return
    }

    paging.onGoToPage(parsed)
  }

  const navDisabled = Boolean(paging.disabled || paging.seeking)

  return (
    <div className="document-table-panel__paging">
      <button
        type="button"
        className="document-table-panel__page-btn"
        onClick={paging.onFirst}
        disabled={navDisabled || !paging.hasPrev}
        aria-label="最初のページ"
        title="最初"
      >
        «
      </button>
      <button
        type="button"
        className="document-table-panel__page-btn"
        onClick={paging.onPrev}
        disabled={navDisabled || !paging.hasPrev}
        aria-label="前のページ"
        title="前へ"
      >
        ‹
      </button>
      <span className="document-table-panel__count">{countLabel}</span>
      <button
        type="button"
        className="document-table-panel__page-btn"
        onClick={paging.onNext}
        disabled={navDisabled || !paging.hasNext}
        aria-label="次のページ"
        title="次へ"
      >
        ›
      </button>
      <button
        type="button"
        className="document-table-panel__page-btn"
        onClick={paging.onLast}
        disabled={navDisabled || !paging.hasLast || !paging.onLast}
        aria-label="最後のページ"
        title="最後"
      >
        »
      </button>
      <label className="document-table-panel__page-jump">
        <span className="document-table-panel__page-jump-label">ページ</span>
        <input
          className="document-table-panel__page-input"
          type="number"
          min={1}
          inputMode="numeric"
          value={pageInput}
          disabled={navDisabled}
          aria-label="ページ番号"
          onChange={(event) => setPageInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitGoToPage()
            }
          }}
        />
        <button
          type="button"
          className="document-table-panel__page-btn"
          onClick={submitGoToPage}
          disabled={navDisabled}
        >
          移動
        </button>
      </label>
      {paging.seeking && (
        <>
          {paging.seekStatus && (
            <span className="document-table-panel__seek-status">{paging.seekStatus}</span>
          )}
          <button
            type="button"
            className="document-table-panel__page-btn document-table-panel__page-btn--stop"
            onClick={paging.onCancelSeek}
            disabled={!paging.onCancelSeek}
          >
            停止
          </button>
        </>
      )}
    </div>
  )
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
  tableKey,
  projectId = '',
  paging
}: DocumentTableProps): React.JSX.Element {
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState>(null)
  const [filterClauses, setFilterClauses] = useState<TableFilterClause[]>([])
  const [showColumnPanel, setShowColumnPanel] = useState(false)

  useEffect(() => {
    setColumnOrder((current) => mergeColumnOrder(current, documents, showPath))
    setHiddenColumns(new Set())
    setSort(null)
    setFilterClauses([])
  }, [tableKey, showPath])

  useEffect(() => {
    setColumnOrder((current) => mergeColumnOrder(current, documents, showPath))
  }, [documents, showPath])

  const visibleColumns = useMemo(
    () => columnOrder.filter((column) => !hiddenColumns.has(column)),
    [columnOrder, hiddenColumns]
  )

  const displayedDocuments = useMemo(() => {
    const filtered = filterDocuments(documents, filterClauses)
    return sortDocuments(filtered, sort)
  }, [documents, filterClauses, sort])

  const selectedCount = bulkSelectedPaths?.size ?? 0
  const allSelected =
    selectable && displayedDocuments.length > 0 && selectedCount === displayedDocuments.length

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

  const addFilterClause = (): void => {
    if (filterClauses.length >= MAX_FILTER_CLAUSES) {
      return
    }

    const next = createEmptyFilterClause()

    if (columnOrder.length > 0 && !next.field) {
      next.field = columnOrder.includes('createTime') ? 'createTime' : columnOrder[0]
    }

    setFilterClauses((current) => [...current, next])
  }

  const updateFilterClause = (
    id: string,
    patch: Partial<Pick<TableFilterClause, 'field' | 'operator' | 'value'>>
  ): void => {
    setFilterClauses((current) =>
      current.map((clause) => (clause.id === id ? { ...clause, ...patch } : clause))
    )
  }

  const removeFilterClause = (id: string): void => {
    setFilterClauses((current) => current.filter((clause) => clause.id !== id))
  }

  const fieldItems = useFieldAutocompleteItems(projectId, columnOrder)

  if (documents.length === 0) {
    return (
      <div className="document-table-panel">
        <div className="document-table-panel__toolbar">
          {paging ? (
            <DocumentTablePagingControls paging={paging} countLabel={paging.rangeLabel} />
          ) : (
            <span className="document-table-panel__count">0 件</span>
          )}
        </div>
        <p className="document-table__empty">ドキュメントがありません</p>
      </div>
    )
  }

  return (
    <div className="document-table-panel">
      <div className="document-table-panel__toolbar">
        <Button onClick={() => setShowColumnPanel((current) => !current)}>
          {showColumnPanel ? '列設定を閉じる' : '列設定'}
        </Button>
        <button
          type="button"
          className="document-filter-bar__add"
          onClick={addFilterClause}
          disabled={filterClauses.length >= MAX_FILTER_CLAUSES}
        >
          + フィルタ
        </button>
        {paging ? (
          <DocumentTablePagingControls
            paging={paging}
            countLabel={
              filterClauses.some((clause) => isFilterClauseActive(clause)) &&
              displayedDocuments.length !== documents.length
                ? `このページ ${displayedDocuments.length}/${documents.length} · ${paging.rangeLabel}`
                : paging.rangeLabel
            }
          />
        ) : (
          <span className="document-table-panel__count">
            {displayedDocuments.length} / {documents.length} 件
          </span>
        )}
      </div>

      <div className="document-filter-bar">
        {filterClauses.map((clause) => (
          <div key={clause.id} className="document-filter-bar__row">
            <AutocompleteInput
              className="document-filter-bar__field-wrap"
              fieldClassName="document-filter-bar__field"
              value={clause.field}
              items={fieldItems}
              placeholder="field"
              aria-label="フィルタ対象フィールド"
              onChange={(next) => updateFilterClause(clause.id, { field: next })}
            />
            <select
              className="document-filter-bar__operator"
              value={clause.operator}
              onChange={(event) =>
                updateFilterClause(clause.id, {
                  operator: event.target.value as TableFilterOperator
                })
              }
              aria-label="フィルタ演算子"
            >
              {TABLE_FILTER_OPERATORS.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>
            <input
              className="document-filter-bar__value"
              value={isUnaryFilterOperator(clause.operator) ? '' : clause.value}
              onChange={(event) => updateFilterClause(clause.id, { value: event.target.value })}
              placeholder={filterValuePlaceholder(clause.operator)}
              aria-label="フィルタ値"
              disabled={isUnaryFilterOperator(clause.operator)}
            />
            <button
              type="button"
              className="document-filter-bar__remove"
              onClick={() => removeFilterClause(clause.id)}
              aria-label="フィルタを削除"
            >
              ×
            </button>
          </div>
        ))}
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
                <th className="document-table__checkbox-col">
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
