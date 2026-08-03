export type WorkspaceAuthType = 'serviceAccount' | 'google'

export type WorkspaceEntry = {
  id: string
  label: string
  color: string
  authType: WorkspaceAuthType
  /** serviceAccount のとき必須。google のときは空文字 */
  serviceAccountPath: string
  /** google のとき表示用 */
  googleAccountEmail?: string
  /** google_oauth_tokens.json のキー */
  googleAccountKey?: string
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

export type AddGoogleWorkspaceEntryInput = {
  projectId: string
  accountKey: string
  accountEmail: string
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
