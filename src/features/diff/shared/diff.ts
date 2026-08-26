import type { DiffSummary } from './types'

export const DIFF_PREVIEW_LIMIT = 100

export type DiffSourceKind = 'cloud' | 'emulator'

export type DiffIntent = {
  sourceKind: DiffSourceKind
}

export type DiffPeek = {
  documentCount: number
  samplePaths: string[]
  sourceProjectId: string | null
}

export type DiffDraft = {
  dumpPath: string | null
  peek: DiffPeek | null
  result: DiffSummary | null
}

export function createDiffDraft(): DiffDraft {
  return {
    dumpPath: null,
    peek: null,
    result: null
  }
}

export function applyDiffIntent(draft: DiffDraft, _intent: DiffIntent): DiffDraft {
  return {
    ...draft,
    result: null
  }
}

export function diffRowPreview(result: DiffSummary): DiffSummary['rows'] {
  return result.rows.slice(0, DIFF_PREVIEW_LIMIT)
}
