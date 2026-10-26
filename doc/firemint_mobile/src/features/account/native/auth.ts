import {NativeModules} from 'react-native';
import type {
  AnonymousAuthResult,
  CachedUser,
  GoogleLinkResult,
  LatestSubscription,
  MemberEntry,
  UserDocument,
} from '../shared/types';

type AccountNative = {
  getCachedUser: () => Promise<CachedUser | null>;
  cacheUser: (
    uid: string,
    firstUseDate: number,
    accountId: string | null,
  ) => Promise<void>;
  updateCachedAccountId: (accountId: string | null) => Promise<void>;
  clearCachedUser: () => Promise<void>;
  getCurrentUid: () => Promise<string | null>;
  signOut: () => Promise<void>;
  clearLocalData: () => Promise<void>;
  clearAllAppData: () => Promise<boolean>;
  validateSession: () => Promise<boolean>;
  getAndroidId: () => Promise<string | null>;
  updateUserProfile: () => Promise<void>;
  fetchUserDocument: () => Promise<UserDocument | null>;
  signInAnonymously: () => Promise<AnonymousAuthResult>;
  linkWithGoogle: () => Promise<GoogleLinkResult>;
  fetchLatestSubscription: (
    accountId: string,
  ) => Promise<LatestSubscription | null>;
  fetchAccountOwnerUid: (accountId: string) => Promise<string | null>;
  fetchMembers: (accountId: string) => Promise<MemberEntry[]>;
};

function native(): AccountNative {
  const mod = NativeModules.Account as AccountNative | undefined;
  if (!mod) {
    throw new Error('Account missing');
  }
  return mod;
}

// 実装: android/.../account/AccountModule.kt#getCachedUser（SQLite読み取りのみ）
export function getCachedUser(): Promise<CachedUser | null> {
  return native().getCachedUser();
}

// 実装: android/.../account/AccountModule.kt#cacheUser
// firstUseDate: この端末の日付（devices/{deviceIdHash}.firstUseDate）の写し
export function cacheUser(
  uid: string,
  firstUseDate: number,
  accountId: string | null,
): Promise<void> {
  return native().cacheUser(uid, firstUseDate, accountId);
}

// 実装: android/.../account/AccountModule.kt#updateCachedAccountId
export function updateCachedAccountId(accountId: string | null): Promise<void> {
  return native().updateCachedAccountId(accountId);
}

// 実装: android/.../account/AccountModule.kt#clearCachedUser
export function clearCachedUser(): Promise<void> {
  return native().clearCachedUser();
}

// 実装: android/.../account/AccountModule.kt#getCurrentUid
export function getCurrentUid(): Promise<string | null> {
  return native().getCurrentUid();
}

// 実装: android/.../account/AccountModule.kt#signOut
export function signOut(): Promise<void> {
  return native().signOut();
}

// 実装: android/.../account/AccountModule.kt#clearLocalData
// 端末の中の作業データ（名簿・スニペット・設定・ユーザーの写し・一時ファイル）を消す
export function clearLocalData(): Promise<void> {
  return native().clearLocalData();
}

// 実装: android/.../account/AccountModule.kt#clearAllAppData
// アプリのデータを丸ごと消して終了する。成功すると戻らない。消せなかった時だけ false
export function clearAllAppData(): Promise<boolean> {
  return native().clearAllAppData();
}

// 実装: android/.../account/AccountModule.kt#validateSession
// （オフラインと「本当に削除された」を区別する分岐は、このメソッドの中にある）
export function validateSession(): Promise<boolean> {
  return native().validateSession();
}

// 実装: android/.../account/AccountModule.kt#getAndroidId
export function getAndroidId(): Promise<string | null> {
  return native().getAndroidId();
}

// 実装: android/.../account/AccountModule.kt#updateUserProfile（Client直接。003_003_misc.txt #3）
export function updateUserProfile(): Promise<void> {
  return native().updateUserProfile();
}

// 実装: android/.../account/AccountModule.kt#fetchUserDocument
export function fetchUserDocument(): Promise<UserDocument | null> {
  return native().fetchUserDocument();
}

// 実装: android/.../account/AccountModule.kt#signInAnonymously
export function signInAnonymously(): Promise<AnonymousAuthResult> {
  return native().signInAnonymously();
}

// 実装: android/.../account/AccountModule.kt#linkWithGoogle
// （昇格/合流の分岐、discardAnonymous Cloud Functionの呼び出しもこの中にある）
export function linkWithGoogle(): Promise<GoogleLinkResult> {
  return native().linkWithGoogle();
}

// 実装: android/.../account/AccountModule.kt#fetchLatestSubscription
// （FirestoreのsubscriptionsをexpiryTime降順1件、Client直接。003_003_misc.txt #16）
export function fetchLatestSubscription(
  accountId: string,
): Promise<LatestSubscription | null> {
  return native().fetchLatestSubscription(accountId);
}

// 実装: android/.../account/AccountModule.kt#fetchAccountOwnerUid
// （Firestoreのaccounts/{accountId}.ownerUidを読むだけ、Client直接。購入ボタンのowner限定に使う）
export function fetchAccountOwnerUid(accountId: string): Promise<string | null> {
  return native().fetchAccountOwnerUid(accountId);
}

// 実装: android/.../account/AccountModule.kt#fetchMembers
// （Firestoreのaccounts/{accountId}/membersを読むだけ、Client直接。メンバー一覧表示に使う）
export function fetchMembers(accountId: string): Promise<MemberEntry[]> {
  return native().fetchMembers(accountId);
}
