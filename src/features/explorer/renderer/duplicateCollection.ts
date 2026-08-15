import { collectionKindLabel, nextDuplicateCollectionPath } from '@features/explorer/shared/tree'
import { confirmActionWithCheckbox } from '@shared/ui/confirmAction'

const INCLUDE_SUBCOLLECTIONS_DETAIL =
  'サブコレクションを含めると、配下のドキュメントもすべてコピーします（件数・時間が増えます）。'

export type DuplicateCollectionOutcome =
  | { status: 'canceled' }
  | { status: 'error'; error: string }
  | { status: 'ok'; copiedCount: number; targetCollectionPath: string }

export type DuplicateDocumentOutcome =
  | { status: 'canceled' }
  | { status: 'error'; error: string }
  | { status: 'ok'; documentId: string }

export async function runDuplicateCollection(
  projectId: string,
  collectionPath: string
): Promise<DuplicateCollectionOutcome> {
  const segments = collectionPath.split('/').filter(Boolean)
  const siblingResult =
    segments.length <= 1
      ? await window.api.explorer.listRootCollections(projectId)
      : await window.api.explorer.listSubcollections(projectId, segments.slice(0, -1).join('/'))

  if (!siblingResult.ok) {
    return { status: 'error', error: siblingResult.error }
  }

  const targetCollectionPath = nextDuplicateCollectionPath(collectionPath, siblingResult.data)
  const kindLabel = collectionKindLabel(collectionPath)
  const prompt = await confirmActionWithCheckbox(
    `${kindLabel}「${collectionPath}」を「${targetCollectionPath}」に複製しますか？`,
    {
      detail: INCLUDE_SUBCOLLECTIONS_DETAIL,
      checkboxLabel: 'サブコレクションを含む',
      checkboxChecked: false
    }
  )

  if (!prompt.confirmed) {
    return { status: 'canceled' }
  }

  const result = await window.api.explorer.duplicateCollection({
    projectId,
    sourceCollectionPath: collectionPath,
    targetCollectionPath,
    includeSubcollections: prompt.checkboxChecked
  })

  if (!result.ok) {
    return { status: 'error', error: result.error }
  }

  return {
    status: 'ok',
    copiedCount: result.data.copiedCount,
    targetCollectionPath: result.data.targetCollectionPath
  }
}

export async function runDuplicateDocument(
  projectId: string,
  documentPath: string
): Promise<DuplicateDocumentOutcome> {
  const segments = documentPath.split('/').filter(Boolean)
  const documentId = segments[segments.length - 1] ?? documentPath
  const prompt = await confirmActionWithCheckbox(`ドキュメント「${documentId}」を複製しますか？`, {
    detail: INCLUDE_SUBCOLLECTIONS_DETAIL,
    checkboxLabel: 'サブコレクションを含む',
    checkboxChecked: false
  })

  if (!prompt.confirmed) {
    return { status: 'canceled' }
  }

  const result = await window.api.explorer.duplicateDocument({
    projectId,
    documentPath,
    includeSubcollections: prompt.checkboxChecked
  })

  if (!result.ok) {
    return { status: 'error', error: result.error }
  }

  return { status: 'ok', documentId: result.data }
}
