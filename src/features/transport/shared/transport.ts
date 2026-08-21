import type { TransportTarget, TransportValidation } from './types'

export type TransportSourceKind = 'cloud' | 'emulator'

export type TransportIntent = {
  sourceKind: TransportSourceKind
  target: TransportTarget
}

export type TransportDraft = {
  target: TransportTarget
  destinationProjectId: string
  destinationCollectionPath: string
  includeSubcollections: boolean
  selectedRoots: string[]
  validation: TransportValidation | null
}

export function createTransportDraft(): TransportDraft {
  return {
    target: 'collection',
    destinationProjectId: '',
    destinationCollectionPath: '',
    includeSubcollections: true,
    selectedRoots: [],
    validation: null
  }
}

export function applyTransportIntent(
  draft: TransportDraft,
  intent: TransportIntent,
  sourceCollectionPath: string,
  rootCollectionIds: string[]
): TransportDraft {
  const switched = draft.target !== intent.target

  return {
    ...draft,
    target: intent.target,
    destinationCollectionPath:
      intent.target === 'collection'
        ? draft.destinationCollectionPath || sourceCollectionPath
        : draft.destinationCollectionPath,
    selectedRoots:
      intent.target === 'project' && draft.selectedRoots.length === 0
        ? [...rootCollectionIds]
        : draft.selectedRoots,
    validation: switched ? null : draft.validation
  }
}
