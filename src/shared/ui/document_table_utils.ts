import type { DocumentSummary } from '@features/explorer/shared/types'

import { formatDisplayValue, formatTimestampIso } from './firestore_display'

export type SortDirection = 'asc' | 'desc'

export type SortState = {
  column: string
  direction: SortDirection
} | null

export function formatCellValue(value: unknown): string {
  return formatDisplayValue(value)
}

export function collectDataColumns(documents: DocumentSummary[]): string[] {
  const columns = new Set<string>()

  for (const document of documents) {
    for (const key of Object.keys(document.data)) {
      columns.add(key)
    }
  }

  return Array.from(columns).sort()
}

export function buildDefaultColumnOrder(
  documents: DocumentSummary[],
  showPath: boolean
): string[] {
  const dataColumns = collectDataColumns(documents)
  const base = showPath
    ? ['id', 'path', 'createTime', 'updateTime']
    : ['id', 'createTime', 'updateTime']

  return [...base, ...dataColumns.filter((column) => !base.includes(column))]
}

export function mergeColumnOrder(
  currentOrder: string[],
  documents: DocumentSummary[],
  showPath: boolean
): string[] {
  const defaults = buildDefaultColumnOrder(documents, showPath)
  const known = new Set(defaults)
  const merged = currentOrder.filter((column) => known.has(column))

  for (const column of defaults) {
    if (!merged.includes(column)) {
      merged.push(column)
    }
  }

  return merged
}

export function getCellText(document: DocumentSummary, column: string): string {
  if (column === 'id') {
    return document.id
  }

  if (column === 'path') {
    return document.path
  }

  if (column === 'createTime') {
    return document.createTime ? formatTimestampIso(document.createTime) : ''
  }

  if (column === 'updateTime') {
    return document.updateTime ? formatTimestampIso(document.updateTime) : ''
  }

  return formatCellValue(document.data[column])
}

export function filterDocuments(
  documents: DocumentSummary[],
  filters: Record<string, string>
): DocumentSummary[] {
  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim())

  if (activeFilters.length === 0) {
    return documents
  }

  return documents.filter((document) =>
    activeFilters.every(([column, rawFilter]) => {
      const filter = rawFilter.trim().toLowerCase()
      return getCellText(document, column).toLowerCase().includes(filter)
    })
  )
}

function compareValues(left: string, right: string, direction: SortDirection): number {
  const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? result : -result
}

export function sortDocuments(
  documents: DocumentSummary[],
  sort: SortState
): DocumentSummary[] {
  if (!sort) {
    return documents
  }

  const sorted = [...documents]

  sorted.sort((left, right) =>
    compareValues(getCellText(left, sort.column), getCellText(right, sort.column), sort.direction)
  )

  return sorted
}

export function moveColumn(order: string[], column: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(column)

  if (index < 0) {
    return order
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= order.length) {
    return order
  }

  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  return next
}
