export type AuthUser = {
  uid: string
  email: string | null
  displayName: string | null
  phoneNumber: string | null
  disabled: boolean
  emailVerified: boolean
  customClaims: Record<string, unknown>
  creationTime: string | null
  lastSignInTime: string | null
  providerIds: string[]
}

export type AuthUsersResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type ListAuthUsersInput = {
  projectId: string
  pageToken?: string
  maxResults?: number
}

export type ListAuthUsersResult = {
  users: AuthUser[]
  pageToken: string | null
}

export type UpdateAuthUserInput = {
  projectId: string
  uid: string
  email?: string | null
  password?: string
  phoneNumber?: string | null
  displayName?: string | null
  emailVerified?: boolean
  disabled?: boolean
  /** null で claims 全クリア。undefined は変更なし */
  customClaims?: Record<string, unknown> | null
}

export type SetAuthUsersDisabledInput = {
  projectId: string
  uids: string[]
  disabled: boolean
}

export type DeleteAuthUsersInput = {
  projectId: string
  uids: string[]
}

export type AuthUsersMutationSummary = {
  successCount: number
  failureCount: number
  errors: Array<{ uid: string; error: string }>
}

export type ExportAuthUsersInput = {
  projectId: string
  format: 'json' | 'csv'
  /** 省略時は接続プロジェクトの全ユーザーをページング取得して export */
  uids?: string[]
}

export type ExportAuthUsersResult = {
  filePath: string
  exportedCount: number
}
