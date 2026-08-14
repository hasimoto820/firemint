import { useMemo } from 'react'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import { useOptionalAutocompleteApi } from './AutocompleteProvider'

const EMPTY_EXTRAS: readonly string[] = []

/** フィールド名候補。プール + 画面側の追加値（列名など）。 */
export function useFieldAutocompleteItems(
  projectId: string,
  extraValues: readonly string[] = EMPTY_EXTRAS
): AutocompleteItem[] {
  const autocomplete = useOptionalAutocompleteApi()

  return useMemo(() => {
    void autocomplete.revision
    const fromPool = autocomplete.query(projectId, '', ['field_name'])
    const seen = new Set(fromPool.map((item) => item.value))
    const extras: AutocompleteItem[] = []

    for (const raw of extraValues) {
      const value = raw.trim()

      if (!value || seen.has(value)) {
        continue
      }

      seen.add(value)
      extras.push({ kind: 'field_name', value })
    }

    return extras.length === 0 ? fromPool : [...fromPool, ...extras]
  }, [autocomplete, extraValues, projectId])
}
