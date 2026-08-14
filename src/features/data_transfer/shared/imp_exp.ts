import type {
  ImportCollectionValidation,
  ImportProjectValidation
} from './types'

export type ImpExpDirection = 'import' | 'export'
export type ImpExpTarget = 'collection' | 'project'

export type ImpExpIntent = {
  direction: ImpExpDirection
  target: ImpExpTarget
}

export type ImpExpDraft = ImpExpIntent & {
  collectionPath: string
  filePath: string | null
  includeSubcollections: boolean
  selectedRoots: string[]
  destinationProjectId: string
  acceptMismatch: boolean
  collectionValidation: ImportCollectionValidation | null
  projectValidation: ImportProjectValidation | null
}

export function createImpExpDraft(projectId: string): ImpExpDraft {
  return {
    direction: 'export',
    target: 'collection',
    collectionPath: '',
    filePath: null,
    includeSubcollections: true,
    selectedRoots: [],
    destinationProjectId: projectId,
    acceptMismatch: false,
    collectionValidation: null,
    projectValidation: null
  }
}

export function applyImpExpIntent(
  draft: ImpExpDraft,
  intent: ImpExpIntent,
  lastCollectionPath: string | null,
  rootCollectionIds: string[] = []
): ImpExpDraft {
  const switched =
    draft.direction !== intent.direction || draft.target !== intent.target

  return {
    ...draft,
    direction: intent.direction,
    target: intent.target,
    collectionPath:
      intent.target === 'collection'
        ? draft.collectionPath || lastCollectionPath || ''
        : draft.collectionPath,
    acceptMismatch:
      intent.direction === 'import' && intent.target === 'project' ? draft.acceptMismatch : false,
    selectedRoots:
      intent.direction === 'export' &&
      intent.target === 'project' &&
      draft.selectedRoots.length === 0
        ? rootCollectionIds
        : draft.selectedRoots,
    collectionValidation: switched ? null : draft.collectionValidation,
    projectValidation: switched ? null : draft.projectValidation
  }
}
