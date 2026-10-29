import { createHash } from "crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { db } from "../admin";

/**
 * 端末（devices）と、端末の一覧（users/{uid}/devices）の共通処理。
 * モバイル版（firemint_m の functions/src/account/devices.ts）と同じデータを扱う。
 * コレクション名・ハッシュの作り方は、モバイル版と必ず同じにする（違うと、同じ端末を別物として数える）。
 *
 * devices/{deviceIdHash}
 *   firstUseDate … この端末で最初に使い始めた日時。トライアルの起点。一度決まったら変わらない
 *   expireAt     … 退会・データ削除から1年後。ふだんは無い（Firestore の TTL の対象）
 *
 * users/{uid}/devices/{deviceIdHash}
 *   deviceIdHash … ドキュメントIDと同じ値（端末から、全 user の一覧を横断して探すため）
 *   addedAt      … この人が、この端末で使い始めた日時
 */

export const DEVICES = "devices";

/** deviceId（Windows は MachineGuid）→ devices のドキュメントID。必ずこの1つを使う。 */
export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId, "utf8").digest("hex");
}

/** アプリから受け取った deviceId を検証する。使えない値は undefined。 */
export function parseDeviceId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return undefined;
  }
  return trimmed;
}

export function deviceRef(deviceIdHash: string): DocumentReference {
  return db.collection(DEVICES).doc(deviceIdHash);
}

export function userDeviceRef(uid: string, deviceIdHash: string): DocumentReference {
  return db.collection("users").doc(uid).collection(DEVICES).doc(deviceIdHash);
}

/** その人の、端末の一覧のドキュメント参照。users/{uid} を削除する時に、一緒に削除する。 */
export async function listUserDeviceRefs(uid: string): Promise<DocumentReference[]> {
  const snap = await db.collection("users").doc(uid).collection(DEVICES).get();
  return snap.docs.map((d) => d.ref);
}

/**
 * その端末を一覧に持っている user の uid。
 * トップレベルの devices には deviceIdHash の項目が無いので、ここには掛からない。
 */
export async function findUidsUsingDevice(deviceIdHash: string): Promise<string[]> {
  const snap = await db
    .collectionGroup(DEVICES)
    .where("deviceIdHash", "==", deviceIdHash)
    .get();
  const uids: string[] = [];
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) {
      uids.push(uid);
    }
  }
  return uids;
}
