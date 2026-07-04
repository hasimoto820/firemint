import type { ExportDocument } from '@features/data_transfer/shared/types'

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

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}
