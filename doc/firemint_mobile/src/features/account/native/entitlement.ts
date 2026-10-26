import type {Entitlement, LatestSubscription} from '../shared/types';
import {fetchLatestSubscription} from './auth';

export const TRIAL_DAYS = 60;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * 003_002_flow.txt「利用状態の判定」に対応。
 * subscriptionのstatusフラグは持たず、expiryTimeと現在日時から都度判定する
 * （003_001_plan.txt「利用状態の基本ロジック」）。
 * expiryTimeが過去でも、lastNotificationTypeが猶予期間系（IN_GRACE_PERIOD等）なら
 * 有効として扱う（決定）。
 */
export function computeEntitlement(
  firstUseDate: number,
  subscription: LatestSubscription | null,
): Entitlement {
  if (subscription) {
    if (subscription.expiryTimeMillis > Date.now()) {
      return 'subscribed';
    }
    if (isGracePeriod(subscription.lastNotificationType)) {
      return 'subscribed';
    }
  }
  const trialEnd = firstUseDate + TRIAL_MS;
  return Date.now() < trialEnd ? 'trial' : 'expired';
}

function isGracePeriod(lastNotificationType: string | null): boolean {
  // verifyAndroidPurchase側のラベル("IN_GRACE_PERIOD")と、RTDN側のラベル
  // ("SUBSCRIPTION_IN_GRACE_PERIOD")の両方に対応する。ON_HOLD/EXPIREDは対象外
  // （expiryTimeが過去のまま扱われる。決定）。
  return lastNotificationType != null && lastNotificationType.includes('GRACE_PERIOD');
}

export function trialDaysLeft(firstUseDate: number): number {
  const remainingMs = firstUseDate + TRIAL_MS - Date.now();
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export async function fetchEntitlement(
  accountId: string | null,
  firstUseDate: number,
): Promise<Entitlement> {
  if (!accountId) {
    return computeEntitlement(firstUseDate, null);
  }
  const subscription = await fetchLatestSubscription(accountId);
  return computeEntitlement(firstUseDate, subscription);
}
