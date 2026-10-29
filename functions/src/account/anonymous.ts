import { HttpsError } from "firebase-functions/v2/https";
import { db, auth } from "../admin";
import { listUserDeviceRefs } from "./devices";

/**
 * モバイル版（firemint_m の functions/src/account/anonymous.ts）と同じ処理。
 *
 * 「匿名のまま」のユーザーか。Googleなどのログイン方法が1つも紐づいていなければ匿名。
 * Auth上に存在しない場合は false。
 */
export async function isAnonymousAuthUser(uid: string): Promise<boolean> {
  try {
    const user = await auth.getUser(uid);
    return user.providerData.length === 0;
  } catch {
    return false;
  }
}

/**
 * 匿名ユーザー（Firebase Auth + users/{uid} + users/{uid}/devices）を削除する。
 * 用済みになった匿名ユーザーの掃除に使う。
 *
 * 安全のため、次の場合は削除しない:
 *   ・Googleなどが紐づいている（匿名ではない）
 *   ・accountId を持っている（契約に属している）
 */
export async function discardAnonymousUser(uid: string): Promise<void> {
  if (!(await isAnonymousAuthUser(uid))) {
    throw new HttpsError("failed-precondition", "匿名ユーザーではないため削除できません。");
  }
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.data()?.accountId) {
    throw new HttpsError("failed-precondition", "契約に属しているため削除できません。");
  }
  const batch = db.batch();
  (await listUserDeviceRefs(uid)).forEach((ref) => batch.delete(ref));
  batch.delete(userRef);
  await batch.commit();
  await auth.deleteUser(uid);
}
