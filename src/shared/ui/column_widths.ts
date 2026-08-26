import { useCallback, useEffect, useState } from 'react'
import { readLayoutRecord, writeLayoutRecord } from './layout_size'

export const DEFAULT_COLUMN_WIDTH = 140
export const MIN_COLUMN_WIDTH = 56
export const CHECKBOX_COLUMN_WIDTH = 36

export function clampColumnWidth(px: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(px))
}

export function useColumnWidths(
  storageKey: string,
  defaults?: Record<string, number>
): {
  widthOf: (column: string) => number
  resizeBy: (column: string, delta: number) => void
  reset: (column: string) => void
} {
  const [widths, setWidths] = useState<Record<string, number>>(
    () => readLayoutRecord(storageKey) ?? {}
  )

  useEffect(() => {
    setWidths(readLayoutRecord(storageKey) ?? {})
  }, [storageKey])

  const persist = useCallback(
    (next: Record<string, number>): void => {
      writeLayoutRecord(storageKey, next)
    },
    [storageKey]
  )

  const widthOf = useCallback(
    (column: string): number => {
      return widths[column] ?? defaults?.[column] ?? DEFAULT_COLUMN_WIDTH
    },
    [defaults, widths]
  )

  const resizeBy = useCallback(
    (column: string, delta: number): void => {
      setWidths((current) => {
        const base = current[column] ?? defaults?.[column] ?? DEFAULT_COLUMN_WIDTH
        const next = { ...current, [column]: clampColumnWidth(base + delta) }
        persist(next)
        return next
      })
    },
    [defaults, persist]
  )

  const reset = useCallback(
    (column: string): void => {
      setWidths((current) => {
        const next = { ...current }
        delete next[column]
        persist(next)
        return next
      })
    },
    [persist]
  )

  return { widthOf, resizeBy, reset }
}
