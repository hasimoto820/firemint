import {NativeModules} from 'react-native';
import type {
  AddMemberResult,
  CreateAccountResult,
  DeleteAccountResult,
  DeleteMyDataResult,
  JoinAccountResult,
  RegisterDeviceResult,
  RemoveMemberResult,
  RespondToInviteResult,
  VerifyPurchaseResult,
} from '../shared/types';

type AccountFunctionsNative = {
  createAccount: () => Promise<CreateAccountResult>;
  registerDevice: (deviceId: string) => Promise<RegisterDeviceResult>;
  joinAccount: () => Promise<JoinAccountResult>;
  respondToInvite: (accept: boolean) => Promise<RespondToInviteResult>;
  addMember: (email: string) => Promise<AddMemberResult>;
  removeMember: (uid: string) => Promise<RemoveMemberResult>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  deleteMyData: () => Promise<DeleteMyDataResult>;
  verifyAndroidPurchase: (
    purchaseToken: string,
    productId: string,
  ) => Promise<VerifyPurchaseResult>;
};

function native(): AccountFunctionsNative {
  const mod = NativeModules.AccountFunctions as AccountFunctionsNative | undefined;
  if (!mod) {
    throw new Error('AccountFunctions missing');
  }
  return mod;
}

// 実装: android/.../account/AccountFunctionsModule.kt が Cloud Functions を呼ぶだけの橋渡し。
// 本当のロジックは functions/src/account/*.ts / functions/src/billing/*.ts 側にある。

// 実装: functions/src/account/createAccount.ts
export function createAccount(): Promise<CreateAccountResult> {
  return native().createAccount();
}

// 実装: functions/src/account/registerDevice.ts
// 端末を登録する（003_011_device.txt）。deviceId: この端末の Android ID。
// サーバーが、devices・users/{uid}・端末の一覧を作り、この端末の firstUseDate を返す。
export function registerDevice(deviceId: string): Promise<RegisterDeviceResult> {
  return native().registerDevice(deviceId);
}

// 実装: functions/src/account/joinAccount.ts
// 確認・照会のみ行い、新規の招待への合流は確定させない（確定はrespondToInvite）。
// pendingInviteが返った場合は、UIで「参加しますか？」を表示し、respondToInviteを呼ぶこと。
export function joinAccount(): Promise<JoinAccountResult> {
  return native().joinAccount();
}

// 実装: functions/src/account/respondToInvite.ts
// joinAccountが返したpendingInviteに対する、ユーザーの応答（参加する/参加しない）を確定させる。
export function respondToInvite(accept: boolean): Promise<RespondToInviteResult> {
  return native().respondToInvite(accept);
}

// 実装: functions/src/account/addMember.ts
export function addMember(email: string): Promise<AddMemberResult> {
  return native().addMember(email);
}

// 実装: functions/src/account/removeMember.ts
export function removeMember(uid: string): Promise<RemoveMemberResult> {
  return native().removeMember(uid);
}

// 実装: functions/src/account/deleteAccount.ts → deleteAccountCore.ts
export function deleteAccount(): Promise<DeleteAccountResult> {
  return native().deleteAccount();
}

// 実装: functions/src/account/deleteMyData.ts
export function deleteMyData(): Promise<DeleteMyDataResult> {
  return native().deleteMyData();
}

// 実装: functions/src/billing/verifyAndroidPurchase.ts
export function verifyAndroidPurchase(
  purchaseToken: string,
  productId: string,
): Promise<VerifyPurchaseResult> {
  return native().verifyAndroidPurchase(purchaseToken, productId);
}
