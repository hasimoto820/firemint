import type { ExportDocument, ImportDocument } from '@features/data_transfer/shared/types'

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function collectColumns(documents: ExportDocument[]): string[] {
  const columns = new Set<string>()

  for (const document of documents) {
    for (const key of Object.keys(document.data)) {
      columns.add(key)
    }
  }

  return Array.from(columns).sort()
}

export function documentsToJson(documents: ExportDocument[]): string {
  return JSON.stringify(documents, null, 2)
}

export function documentsToCsv(documents: ExportDocument[]): string {
  const columns = collectColumns(documents)
  const header = ['id', 'path', ...columns].map(escapeCsvCell).join(',')
  const rows = documents.map((document) => {
    const cells = [
      document.id,
      document.path,
      ...columns.map((column) => document.data[column])
    ]

    return cells.map(escapeCsvCell).join(',')
  })

  return [header, ...rows].join('\n')
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

function parseCsvRows(raw: string): string[][] {
  const text = stripBom(raw)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let index = 0

  while (index < text.length) {
    const character = text[index]

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 2
          continue
        }

        inQuotes = false
        index += 1
        continue
      }

      cell += character
      index += 1
      continue
    }

    if (character === '"') {
      inQuotes = true
      index += 1
      continue
    }

    if (character === ',') {
      row.push(cell)
      cell = ''
      index += 1
      continue
    }

    if (character === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      index += 1
      continue
    }

    if (character === '\r') {
      index += 1
      continue
    }

    cell += character
    index += 1
  }

  if (inQuotes) {
    throw new Error('CSV の引用符が閉じていません')
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function decodeCsvCell(cell: string): unknown {
  const trimmed = cell.trim()
  if (trimmed === '') {
    return undefined
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return cell
    }
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

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  return cell
}

export function looksLikeCsv(raw: string, filePath?: string): boolean {
  const lower = filePath?.toLowerCase() ?? ''
  if (lower.endsWith('.csv')) {
    return true
  }

  if (lower.endsWith('.json')) {
    return false
  }

  const first = stripBom(raw).trimStart()[0]
  return first !== '[' && first !== '{'
}

export function csvToDocuments(raw: string): ImportDocument[] {
  const rows = parseCsvRows(raw)
  if (rows.length === 0) {
    throw new Error('CSV が空です')
  }

  const header = rows[0].map((name) => name.trim())
  if (header.every((name) => name === '')) {
    throw new Error('CSV の先頭行に列名が必要です')
  }

  const idIndex = header.findIndex((name) => name.toLowerCase() === 'id')
  const pathIndex = header.findIndex((name) => name.toLowerCase() === 'path')
  const documents: ImportDocument[] = []

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (row.every((cell) => cell.trim() === '')) {
      continue
    }

    const data: Record<string, unknown> = {}

    for (let column = 0; column < header.length; column += 1) {
      const name = header[column]
      if (!name || column === idIndex || column === pathIndex) {
        continue
      }

      const value = decodeCsvCell(row[column] ?? '')
      if (value === undefined) {
        continue
      }

      data[name] = value
    }

    const id = idIndex >= 0 ? (row[idIndex] ?? '').trim() : ''
    const path = pathIndex >= 0 ? (row[pathIndex] ?? '').trim() : ''

    documents.push({
      id: id || undefined,
      path: path || undefined,
      data
    })
  }

  if (documents.length === 0) {
    throw new Error('インポート対象のドキュメントがありません')
  }

  return documents
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}
