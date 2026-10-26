// 端末の SQLite の写し。firstUseDate は、この端末の日付（devices/{deviceIdHash}.firstUseDate）
export type CachedUser = {
  uid: string;
  firstUseDate: number;
  accountId: string | null;
};

// users/{uid} のうち、アプリが読む項目
export type UserDocument = {
  accountId: string | null;
  email: string | null;
};

export type AnonymousAuthResult = {
  uid: string;
  isNewUser: boolean;
  // 匿名認証でサインインしたままのユーザーか（Googleなどが紐づいていない）
  isAnonymous: boolean;
};

export type GoogleLinkResult = {
  uid: string;
  email: string;
  // true: そのGoogleが既に別のuidにあったため、既存のuidへ合流（切り替え）した
  switched: boolean;
};

export type CreateAccountResult = {
  accountId: string;
};

// 端末を登録した結果（003_011_device.txt）。
// firstUseDate: この端末の日付。accountId: users/{uid}.accountId
export type RegisterDeviceResult = {
  firstUseDate: number;
  accountId: string | null;
};

export type PendingInvite = {
  accountId: string;
  ownerEmail: string | null;
};

export type JoinAccountResult =
  | {joined: true; accountId: string}
  | {joined: false; pendingInvite?: PendingInvite};

export type RespondToInviteResult =
  | {joined: true; accountId: string}
  | {joined: false};

export type AddMemberResult = {
  accountId: string;
};

export type RemoveMemberResult = {
  success: true;
};

export type DeleteAccountResult = {
  success: true;
};

export type DeleteMyDataResult = {
  success: true;
  scope: 'account' | 'member' | 'unaffiliated';
};

export type MemberEntry = {
  id: string;
  email: string | null;
  // true: 未ログインの招待中（ドキュメントIDがemail）。false: 参加済み（ドキュメントIDがuid）
  pending: boolean;
};

export type LatestSubscription = {
  expiryTimeMillis: number;
  provider: string | null;
  lastNotificationType: string | null;
};

export type PurchaseResult = {
  purchaseToken: string;
  productId: string;
};

export type VerifyPurchaseResult = {
  accountId: string;
  expiryTimeMillis: number;
};

export type Entitlement = 'subscribed' | 'trial' | 'expired';
