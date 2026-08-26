import type {
  ImportCollectionValidation,
  ImportProjectValidation
} from './types'

export type ImpExpDirection = 'import' | 'export'
export type ImpExpTarget = 'collection' | 'group' | 'project'

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

export function lastPathSegment(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
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
  const direction = intent.direction
  const target = direction === 'import' ? 'project' : intent.target
  const switched = draft.direction !== direction || draft.target !== target

  return {
    ...draft,
    direction,
    target,
    collectionPath:
      target === 'collection'
        ? draft.collectionPath || lastCollectionPath || ''
        : target === 'group'
          ? lastPathSegment(draft.collectionPath || lastCollectionPath || '')
          : draft.collectionPath,
    acceptMismatch: false,
    selectedRoots:
      direction === 'export' &&
      target === 'project' &&
      draft.selectedRoots.length === 0
        ? rootCollectionIds
        : draft.selectedRoots,
    collectionValidation: switched ? null : draft.collectionValidation,
    projectValidation: switched ? null : draft.projectValidation
  }
}
