import type { CollectionDiffSummary } from './types'

export const DIFF_PREVIEW_LIMIT = 100

export type DiffSourceKind = 'cloud' | 'emulator'

export type DiffIntent = {
  sourceKind: DiffSourceKind
}

export type DiffDraft = {
  collectionPath: string
  filePath: string | null
  includeSubcollections: boolean
  result: CollectionDiffSummary | null
}

export function createDiffDraft(): DiffDraft {
  return {
    collectionPath: '',
    filePath: null,
    includeSubcollections: true,
    result: null
  }
}

export function applyDiffIntent(
  draft: DiffDraft,
  intent: DiffIntent,
  lastCollectionPath: string
): DiffDraft {
  return {
    ...draft,
    collectionPath:
      intent.sourceKind === 'cloud' || intent.sourceKind === 'emulator'
        ? lastCollectionPath || draft.collectionPath
        : draft.collectionPath,
    result: null
  }
}

export function diffRowPreview(result: CollectionDiffSummary): CollectionDiffSummary['rows'] {
  return result.rows.slice(0, DIFF_PREVIEW_LIMIT)
}
