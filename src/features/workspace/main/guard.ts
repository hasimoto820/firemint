import { getWriteBlockedReason } from '@shared/firestore/client'
import { getFocusedProjectId } from '@shared/firestore/focused'
import { getWorkspaceEntry } from './service'

export function ensureWritable(projectId?: string): void {
  const resolvedProjectId = projectId ?? getFocusedProjectId()

  if (!resolvedProjectId) {
    throw new Error('プロジェクトが選択されていません')
  }

  const entry = getWorkspaceEntry(resolvedProjectId)

  if (entry?.readOnly) {
    throw new Error('read-only プロジェクトのため書き込みできません')
  }
}

/** Firestore への書込。read-only に加え、Datastore モード／DB なしも止める。 */
export function ensureFirestoreWritable(projectId?: string): void {
  ensureWritable(projectId)

  const resolvedProjectId = projectId ?? getFocusedProjectId()

  if (!resolvedProjectId) {
    return
  }

  const reason = getWriteBlockedReason(resolvedProjectId)

  if (reason) {
    throw new Error(reason)
  }
}
