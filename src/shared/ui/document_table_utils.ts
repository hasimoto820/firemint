import type { DocumentSummary } from '@features/explorer/shared/types'

import { formatDisplayValue, formatTimestampIso, isTimestampValue } from './firestore_display'

export type SortDirection = 'asc' | 'desc'

export type SortState = {
  column: string
  direction: SortDirection
} | null

export type TableFilterOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'contains'
  | 'in'
  | 'array-contains'

export type TableFilterClause = {
  id: string
  field: string
  operator: TableFilterOperator
  value: string
}

export const TABLE_FILTER_OPERATORS: { value: TableFilterOperator; label: string }[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: 'contains', label: '部分一致' },
  { value: 'in', label: 'in' },
  { value: 'array-contains', label: 'array contains' }
]

export function createEmptyFilterClause(): TableFilterClause {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: '',
    operator: 'contains',
    value: ''
  }
}

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

function getRawFieldValue(document: DocumentSummary, column: string): unknown {
  if (column === 'id') {
    return document.id
  }

  if (column === 'path') {
    return document.path
  }

  if (column === 'createTime') {
    return document.createTime
  }

  if (column === 'updateTime') {
    return document.updateTime
  }

  return document.data[column]
}

type Comparable =
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'empty' }

function looksLikeDateInput(value: string): boolean {
  return /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) || /\d{4}-\d{2}-\d{2}T/.test(value)
}

function parseDateMs(value: string): number | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const direct = Date.parse(trimmed)

  if (!Number.isNaN(direct)) {
    return direct
  }

  // 2026/07/04 20:38:40 → ISO-ish
  const normalized = trimmed.replace(/\//g, '-').replace(' ', 'T')
  const fallback = Date.parse(normalized)

  return Number.isNaN(fallback) ? null : fallback
}

function toComparable(value: unknown): Comparable {
  if (value === null || value === undefined || value === '') {
    return { kind: 'empty' }
  }

  if (isTimestampValue(value)) {
    const ms = Date.parse(value.iso)
    return Number.isNaN(ms) ? { kind: 'string', value: value.iso.toLowerCase() } : { kind: 'date', value: ms }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'number', value }
  }

  if (typeof value === 'boolean') {
    return { kind: 'string', value: String(value) }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (trimmed === '') {
      return { kind: 'empty' }
    }

    if (looksLikeDateInput(trimmed)) {
      const ms = parseDateMs(trimmed)

      if (ms !== null) {
        return { kind: 'date', value: ms }
      }
    }

    const asNumber = Number(trimmed)

    if (!Number.isNaN(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { kind: 'number', value: asNumber }
    }

    return { kind: 'string', value: trimmed.toLowerCase() }
  }

  return { kind: 'string', value: formatDisplayValue(value).toLowerCase() }
}

function truncateToSecond(ms: number): number {
  return Math.floor(ms / 1000) * 1000
}

function hasFractionalSeconds(value: string): boolean {
  return /\.\d{1,9}/.test(value)
}

function compareComparables(
  left: Comparable,
  right: Comparable,
  options?: { secondPrecision?: boolean }
): number | null {
  if (left.kind === 'empty' || right.kind === 'empty') {
    if (left.kind === 'empty' && right.kind === 'empty') {
      return 0
    }

    return null
  }

  if (left.kind === 'date' && right.kind === 'date') {
    const leftMs = options?.secondPrecision ? truncateToSecond(left.value) : left.value
    const rightMs = options?.secondPrecision ? truncateToSecond(right.value) : right.value
    return leftMs - rightMs
  }

  if (left.kind === 'number' && right.kind === 'number') {
    return left.value - right.value
  }

  if (left.kind === 'string' && right.kind === 'string') {
    return left.value.localeCompare(right.value, undefined, { numeric: true, sensitivity: 'base' })
  }

  // 異種は文字列化して比較
  const leftText = left.kind === 'string' ? left.value : String(left.value)
  const rightText = right.kind === 'string' ? right.value : String(right.value)

  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' })
}

function unwrapFilterScalar(value: unknown): unknown {
  if (isTimestampValue(value)) {
    return value.iso
  }

  return value
}

function parseFilterScalar(raw: string): unknown {
  const trimmed = raw.trim()

  if (!trimmed) {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (trimmed === 'null') {
    return null
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

/**
 * in 用: JSON 配列 `["a","b"]` またはカンマ区切り `a, b`
 */
export function parseFilterList(raw: string): unknown[] | null {
  const trimmed = raw.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown

      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      return null
    }

    return null
  }

  return trimmed.split(',').map((part) => parseFilterScalar(part.trim()))
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const a = unwrapFilterScalar(left)
  const b = unwrapFilterScalar(right)

  if (Object.is(a, b)) {
    return true
  }

  if (typeof a === 'number' && typeof b === 'string' && /^-?\d+(\.\d+)?$/.test(b)) {
    return a === Number(b)
  }

  if (typeof b === 'number' && typeof a === 'string' && /^-?\d+(\.\d+)?$/.test(a)) {
    return Number(a) === b
  }

  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }

  return String(a).toLowerCase() === String(b).toLowerCase()
}

function fieldEqualsFilterValue(
  document: DocumentSummary,
  field: string,
  candidateRaw: unknown
): boolean {
  const candidateText =
    typeof candidateRaw === 'string'
      ? candidateRaw.trim()
      : formatDisplayValue(candidateRaw).trim()

  if (!candidateText) {
    return false
  }

  const cellText = getCellText(document, field)

  if (cellText.trim().toLowerCase() === candidateText.toLowerCase()) {
    return true
  }

  const rawFieldValue = getRawFieldValue(document, field)

  if (valuesEqual(rawFieldValue, candidateRaw)) {
    return true
  }

  const left = toComparable(rawFieldValue)
  const right = toComparable(candidateText)
  const secondPrecision =
    left.kind === 'date' && right.kind === 'date' && !hasFractionalSeconds(candidateText)
  const compared = compareComparables(left, right, { secondPrecision })

  return compared === 0
}

function matchesInOperator(
  document: DocumentSummary,
  field: string,
  rawList: string
): boolean {
  const list = parseFilterList(rawList)

  if (!list || list.length === 0) {
    return false
  }

  return list.some((candidate) => fieldEqualsFilterValue(document, field, candidate))
}

function matchesArrayContains(fieldValue: unknown, rawValue: string): boolean {
  if (!Array.isArray(fieldValue)) {
    return false
  }

  const needle = parseFilterScalar(rawValue)
  return fieldValue.some((item) => valuesEqual(item, needle))
}

export function matchesFilterClause(
  document: DocumentSummary,
  clause: TableFilterClause
): boolean {
  const field = clause.field.trim()
  const value = clause.value.trim()

  if (!field || !value) {
    return true
  }

  const cellText = getCellText(document, field)
  const rawFieldValue = getRawFieldValue(document, field)

  if (clause.operator === 'contains') {
    return cellText.toLowerCase().includes(value.toLowerCase())
  }

  if (clause.operator === 'in') {
    return matchesInOperator(document, field, value)
  }

  if (clause.operator === 'array-contains') {
    return matchesArrayContains(rawFieldValue, value)
  }

  if (clause.operator === '==') {
    return fieldEqualsFilterValue(document, field, value)
  }

  if (clause.operator === '!=') {
    return !fieldEqualsFilterValue(document, field, value)
  }

  const left = toComparable(rawFieldValue)
  const right = toComparable(value)
  const secondPrecision =
    left.kind === 'date' && right.kind === 'date' && !hasFractionalSeconds(value)
  const compared = compareComparables(left, right, { secondPrecision })

  if (compared === null) {
    return false
  }

  switch (clause.operator) {
    case '<':
      return compared < 0
    case '<=':
      return compared <= 0
    case '>':
      return compared > 0
    case '>=':
      return compared >= 0
    default:
      return true
  }
}

export function filterDocuments(
  documents: DocumentSummary[],
  clauses: TableFilterClause[]
): DocumentSummary[] {
  const active = clauses.filter((clause) => clause.field.trim() && clause.value.trim())

  if (active.length === 0) {
    return documents
  }

  return documents.filter((document) =>
    active.every((clause) => matchesFilterClause(document, clause))
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
