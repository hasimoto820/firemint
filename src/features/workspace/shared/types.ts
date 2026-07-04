export type WorkspaceEntry = {
  id: string
  label: string
  color: string
  serviceAccountPath: string
  readOnly: boolean
}

export type WorkspaceStore = {
  version: 1
  entries: WorkspaceEntry[]
  focusedProjectId: string | null
}

export type WorkspaceState = {
  entries: WorkspaceEntry[]
  focusedProjectId: string | null
  loadedProjectIds: string[]
}

export type UpdateWorkspaceEntryInput = {
  label?: string
  color?: string
  readOnly?: boolean
}

export type AddWorkspaceEntryInput = {
  serviceAccountPath: string
  label?: string
  color?: string
  readOnly?: boolean
  setFocused?: boolean
}

export type WorkspaceResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }
