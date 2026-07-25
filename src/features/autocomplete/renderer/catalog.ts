import type {
  AutocompleteItem,
  AutocompleteKind,
  AutocompleteProjectPool
} from '@features/autocomplete/shared/types'

/** `.` は JS のメソッド連鎖で単語が壊れるため含めない。path の `/` は含める。 */
const WORD_CHAR = /[A-Za-z0-9_/-]/
const RESULT_LIMIT = 40

export function createEmptyProjectPool(): AutocompleteProjectPool {
  return {
    collection_path: new Set(),
    field_name: new Set()
  }
}

/** 先頭一致。path は `/` 区切りの各セグメント先頭も可（途中文字の includes はしない）。 */
export function matchesAutocompleteNeedle(value: string, needle: string): boolean {
  if (!needle) {
    return true
  }

  const lower = value.toLowerCase()

  if (lower.startsWith(needle)) {
    return true
  }

  if (!lower.includes('/')) {
    return false
  }

  return lower.split('/').some((segment) => segment.startsWith(needle))
}

function needleMatchRank(value: string, needle: string): number {
  if (!needle) {
    return 0
  }

  const lower = value.toLowerCase()

  if (lower.startsWith(needle)) {
    return 0
  }

  if (lower.split('/').some((segment) => segment.startsWith(needle))) {
    return 1
  }

  return 2
}

function addToSet(target: Set<string>, values: string[]): boolean {
  let changed = false

  for (const raw of values) {
    const value = raw.trim()

    if (!value || target.has(value)) {
      continue
    }

    target.add(value)
    changed = true
  }

  return changed
}

function removeFromSet(target: Set<string>, values: string[]): boolean {
  let changed = false

  for (const raw of values) {
    const value = raw.trim()

    if (!value || !target.has(value)) {
      continue
    }

    target.delete(value)
    changed = true
  }

  return changed
}

export function addCollectionPathsToPool(
  pool: AutocompleteProjectPool,
  paths: string[]
): boolean {
  return addToSet(pool.collection_path, paths)
}

export function addFieldNamesToPool(
  pool: AutocompleteProjectPool,
  fieldNames: string[]
): boolean {
  return addToSet(pool.field_name, fieldNames)
}

export function removeCollectionPathsFromPool(
  pool: AutocompleteProjectPool,
  paths: string[]
): boolean {
  return removeFromSet(pool.collection_path, paths)
}

export function queryAutocompletePool(
  pool: AutocompleteProjectPool,
  text: string,
  kinds?: AutocompleteKind[]
): AutocompleteItem[] {
  const needle = text.trim().toLowerCase()
  const kindsToSearch: AutocompleteKind[] = kinds ?? ['collection_path', 'field_name']
  const items: AutocompleteItem[] = []

  for (const kind of kindsToSearch) {
    for (const value of pool[kind]) {
      if (matchesAutocompleteNeedle(value, needle)) {
        items.push({ kind, value })
      }
    }
  }

  items.sort((left, right) => {
    const leftValue = left.value.toLowerCase()
    const rightValue = right.value.toLowerCase()
    const leftRank = needleMatchRank(leftValue, needle)
    const rightRank = needleMatchRank(rightValue, needle)

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    if (left.kind !== right.kind) {
      return left.kind === 'collection_path' ? -1 : 1
    }

    return leftValue.localeCompare(rightValue)
  })

  return items.slice(0, RESULT_LIMIT)
}

export function getWordRange(
  text: string,
  caret: number
): { start: number; end: number; word: string } {
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  let start = safeCaret
  let end = safeCaret

  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? '')) {
    start -= 1
  }

  while (end < text.length && WORD_CHAR.test(text[end] ?? '')) {
    end += 1
  }

  return {
    start,
    end,
    word: text.slice(start, end)
  }
}

export function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string
): string {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`
}
