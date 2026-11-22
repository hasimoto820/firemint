import { tr } from '@shared/i18n/shared/current'
import { getWriteBlockedReason } from '@shared/firestore/client'
import { getFocusedProjectId } from '@shared/firestore/focused'
import { getWorkspaceEntry } from './service'

export function ensureWritable(projectId?: string): void {
  const resolvedProjectId = projectId ?? getFocusedProjectId()

  if (!resolvedProjectId) {
    throw new Error(tr('ui.err_no_project_selected'))
  }

  const entry = getWorkspaceEntry(resolvedProjectId)

  if (entry?.readOnly) {
    throw new Error(tr('workspace.err_read_only'))
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
