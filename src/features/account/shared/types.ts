/** unknown: 判定に要る日付がまだ無い（起動中・初回で通信できない）。制限はかけない。 */
export type Entitlement = 'subscribed' | 'trial' | 'expired' | 'unknown'

export const TRIAL_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export type LatestSubscription = {
  expiryTimeMillis: number
  lastNotificationType: string | null
}

/** 002_005_flow.txt「利用状態の判定」。モバイル版の computeEntitlement と同じ。 */
export function computeEntitlement(
  firstUseDate: number | null,
  subscription: LatestSubscription | null,
  now: number
): Entitlement {
  if (subscription) {
    if (subscription.expiryTimeMillis > now) {
      return 'subscribed'
    }
    if (subscription.lastNotificationType?.includes('GRACE_PERIOD')) {
      return 'subscribed'
    }
  }
  if (firstUseDate === null) {
    return 'unknown'
  }
  return now < firstUseDate + TRIAL_DAYS * DAY_MS ? 'trial' : 'expired'
}

export function computeTrialDaysLeft(firstUseDate: number, now: number): number {
  return Math.ceil((firstUseDate + TRIAL_DAYS * DAY_MS - now) / DAY_MS)
}

/** 画面に渡す状態。ログイン情報（トークン）は含めない。 */
export type AccountStatus = {
  /** Google ログイン済みならメールアドレス。匿名のままなら null。 */
  email: string | null
  accountId: string | null
  firstUseDate: number | null
  entitlement: Entitlement
  trialDaysLeft: number | null
  /** 購入できるのは owner だけ */
  isOwner: boolean
}

export type AccountSignInResult = { ok: true; status: AccountStatus } | { ok: false; error: string }

export type AccountPurchaseResult = { ok: true } | { ok: false; error: string }
