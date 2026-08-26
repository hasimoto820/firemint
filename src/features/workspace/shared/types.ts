export type WorkspaceAuthType = 'serviceAccount' | 'google' | 'emulator'

/** 左ツリーのドット。クラウド／Google の初期色。旧デフォルトは未設定として扱う */
export const DEFAULT_ENTRY_COLOR = '#ff7e29'
export const DEFAULT_EMULATOR_ENTRY_COLOR = '#456280'
const LEGACY_DEFAULT_ENTRY_COLORS = ['#607d8b', '#07e940']

export function defaultWorkspaceEntryColor(
  authType: WorkspaceAuthType,
  options?: { existing?: string; override?: string }
): string {
  if (options?.override) {
    return options.override
  }

  const existing = options?.existing?.trim()

  if (existing && !LEGACY_DEFAULT_ENTRY_COLORS.includes(existing.toLowerCase())) {
    return existing
  }

  return authType === 'emulator' ? DEFAULT_EMULATOR_ENTRY_COLOR : DEFAULT_ENTRY_COLOR
}

export type WorkspaceEntry = {
  id: string
  label: string
  color: string
  authType: WorkspaceAuthType
  /** serviceAccount のとき必須。google / emulator のときは空文字 */
  serviceAccountPath: string
  /** google のとき表示用 */
  googleAccountEmail?: string
  /** google_oauth_tokens.json のキー */
  googleAccountKey?: string
  /** emulator のとき HOST:PORT。例: 127.0.0.1:8080 */
  emulatorHost?: string
  /** emulator のとき Emulator に渡す projectId。id とは別 */
  emulatorProjectId?: string
  readOnly: boolean
}

export function workspaceAuthLabel(authType: WorkspaceAuthType): string {
  if (authType === 'google') {
    return 'google'
  }

  if (authType === 'emulator') {
    return 'emulator'
  }

  return 'json'
}

export type WorkspaceStore = {
  version: 1
  entries: WorkspaceEntry[]
  focusedProjectId: string | null
  /** 前回ツリーに出していたプロジェクト。起動時に再接続する */
  loadedProjectIds: string[]
}

export type WorkspaceState = {
  entries: WorkspaceEntry[]
  focusedProjectId: string | null
  loadedProjectIds: string[]
  /** 接続済みのうち、Native Firestore でないもの */
  writeBlockedReasons: Record<string, string>
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

export type AddEmulatorWorkspaceEntryInput = {
  projectId: string
  host: string
  label?: string
  color?: string
  readOnly?: boolean
  setFocused?: boolean
}

export type SetFocusedProjectOptions = {
  /** true のとき、他プロジェクトの接続を切ってから開く（リストから1件選ぶ用） */
  exclusive?: boolean
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
