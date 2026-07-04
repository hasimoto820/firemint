let focusedProjectId: string | null = null

export function getFocusedProjectId(): string | null {
  return focusedProjectId
}

export function setFocusedProjectId(projectId: string | null): void {
  focusedProjectId = projectId
}

export function requireFocusedProjectId(): string {
  if (!focusedProjectId) {
    throw new Error('プロジェクトが選択されていません')
  }

  return focusedProjectId
}
