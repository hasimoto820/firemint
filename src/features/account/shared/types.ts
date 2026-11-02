/** 画面に渡す状態。ログイン情報（トークン）は含めない。 */
export type AccountStatus = {
  /** Google ログイン済みならメールアドレス。匿名のままなら null。 */
  email: string | null
  accountId: string | null
  firstUseDate: number | null
}

export type AccountSignInResult = { ok: true; status: AccountStatus } | { ok: false; error: string }
