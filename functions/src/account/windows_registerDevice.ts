import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";
import { discardAnonymousUser } from "./anonymous";
import {
  deviceRef,
  findUidsUsingDevice,
  hashDeviceId,
  parseDeviceId,
  userDeviceRef,
} from "./devices";

// Firestore の create() が、既にドキュメントがある時に返すエラーコード
const GRPC_ALREADY_EXISTS = 6;

async function createIfMissing(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  try {
    await ref.create(data);
  } catch (e) {
    if ((e as { code?: number }).code !== GRPC_ALREADY_EXISTS) {
      throw e;
    }
  }
}

/**
 * 002_005_flow.txt「起動時の判定順」③ 端末を登録する。
 * モバイル版の registerDevice と同じ処理で、users/{uid} を作る時の platform だけが "windows"（002_004 の 12）。
 * アプリが呼ぶのは、キャッシュに写しが無い時（初めての起動・データ削除の後）と、
 * Googleログインで uid が切り替わった時（合流）。
 *
 *  1. devices/{deviceIdHash} が無ければ、firstUseDate = 今 で作る。あれば、日付はそのまま。
 *  2. expireAt が入っていれば消す。
 *  3. devices が既にあった場合は、その端末に残っている古い匿名ユーザーを削除する。
 *  4. users/{uid} が無ければ作る（platform = "windows"）。
 *  5. users/{uid}/devices/{deviceIdHash} が無ければ作る。
 *  6. firstUseDate（と、users/{uid}.accountId）を返す。
 */
export const windows_registerDevice = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "認証が必要です。");
  }
  const deviceId = parseDeviceId(request.data?.deviceId);
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId は必須です。");
  }
  const deviceIdHash = hashDeviceId(deviceId);
  const device = deviceRef(deviceIdHash);

  const { firstUseDate, existed } = await db.runTransaction(async (tx) => {
    const data = (await tx.get(device)).data();
    const now = Timestamp.now();
    const stored = data?.firstUseDate as Timestamp | undefined;
    const expireAt = data?.expireAt as Timestamp | undefined;
    // 期限切れは、まだ物理的に残っていても、無いものとして扱う
    const expired = expireAt != null && expireAt.toMillis() <= now.toMillis();
    if (!stored || expired) {
      tx.set(device, { firstUseDate: now });
      return { firstUseDate: now, existed: false };
    }
    if (expireAt) {
      tx.update(device, { expireAt: FieldValue.delete() });
    }
    return { firstUseDate: stored, existed: true };
  });

  if (existed) {
    await discardStaleAnonymousUsers(deviceIdHash, uid);
  }

  const userRef = db.collection("users").doc(uid);
  await createIfMissing(userRef, {
    email: (request.auth?.token.email as string | undefined) ?? "",
    name: (request.auth?.token.name as string | undefined) ?? "",
    platform: "windows",
    accountId: null,
  });
  await createIfMissing(userDeviceRef(uid, deviceIdHash), {
    deviceIdHash,
    addedAt: FieldValue.serverTimestamp(),
  });

  const accountId = ((await userRef.get()).data()?.accountId as string | undefined) ?? null;
  return { firstUseDate: firstUseDate.toMillis(), accountId };
});

/**
 * 「古い匿名ユーザーの掃除」。匿名のままデータ削除などで uid が変わると、前の匿名ユーザーが、
 * 誰も入れないままサーバーに残るので、ここで消す。
 * 消すのは、匿名のままで accountId が無い user だけ（discardAnonymousUser の条件）。
 */
async function discardStaleAnonymousUsers(
  deviceIdHash: string,
  callerUid: string
): Promise<void> {
  const uids = (await findUidsUsingDevice(deviceIdHash)).filter((u) => u !== callerUid);
  for (const uid of uids) {
    try {
      await discardAnonymousUser(uid);
    } catch (e) {
      // 匿名ではない・契約に属している user は、ここで弾かれる（HttpsError）。それ以外は記録する
      if (!(e instanceof HttpsError)) {
        logger.warn("古い匿名ユーザーの削除に失敗", {
          uid,
          reason: e instanceof Error ? e.message : e,
        });
      }
    }
  }
}
