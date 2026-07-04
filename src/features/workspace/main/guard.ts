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
