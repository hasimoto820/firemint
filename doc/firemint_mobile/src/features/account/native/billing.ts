import {NativeModules} from 'react-native';
import type {PurchaseResult} from '../shared/types';

type BillingNative = {
  purchaseSubscription: () => Promise<PurchaseResult>;
  restorePurchase: () => Promise<PurchaseResult | null>;
};

function native(): BillingNative {
  const mod = NativeModules.Billing as BillingNative | undefined;
  if (!mod) {
    throw new Error('Billing missing');
  }
  return mod;
}

// 実装: android/.../account/BillingModule.kt#purchaseSubscription
// （Google Play Billing Libraryの購入フロー。サーバー検証は別途verifyAndroidPurchaseを呼ぶこと）
export function purchaseSubscription(): Promise<PurchaseResult> {
  return native().purchaseSubscription();
}

// 実装: android/.../account/BillingModule.kt#restorePurchase（queryPurchasesAsync）
export function restorePurchase(): Promise<PurchaseResult | null> {
  return native().restorePurchase();
}
