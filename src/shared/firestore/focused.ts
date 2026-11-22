import { tr } from '@shared/i18n/shared/current'
let focusedProjectId: string | null = null

export function getFocusedProjectId(): string | null {
  return focusedProjectId
}

export function setFocusedProjectId(projectId: string | null): void {
  focusedProjectId = projectId
}

export function requireFocusedProjectId(): string {
  if (!focusedProjectId) {
    throw new Error(tr('ui.err_no_project_selected'))
  }

  return focusedProjectId
}
