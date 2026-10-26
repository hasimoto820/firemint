import {
  cacheUser,
  clearCachedUser,
  fetchUserDocument,
  getAndroidId,
  getCachedUser,
  getCurrentUid,
  signInAnonymously,
  updateCachedAccountId,
  validateSession,
} from './auth';
import {createAccount, joinAccount, registerDevice} from './functions';
import type {PendingInvite} from '../shared/types';

// firstUseDate: この端末の日付（devices/{deviceIdHash}.firstUseDate）。トライアルの起点
export type EnsureUserResult = {
  uid: string;
  firstUseDate: number;
  accountId: string | null;
};

let inflight: Promise<EnsureUserResult> | null = null;

/**
 * アプリ起動時（基本ルール0）と、アカウント画面から呼ばれる。
 * 同時に複数回呼ばれても、匿名ユーザーを二重に作らないよう、実行中の1回に相乗りさせる。
 */
export function ensureUser(): Promise<EnsureUserResult> {
  if (!inflight) {
    inflight = doEnsureUser().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * 003_002_flow.txt「起動時の判定順」①〜③に対応する、起動時ブートストラップ。
 *
 * 基本ルール6: 「自分は誰か(uid)」の正はFirebase Auth。SQLiteのキャッシュは、
 * Firebase Authのuidと一致する時だけ信用し、食い違えば捨てる。
 */
async function doEnsureUser(): Promise<EnsureUserResult> {
  // ① まず、Firebase Auth のセッションが有効かを確認する（正はここ）。
  //    サーバー側でユーザーが削除されていた場合（owner退会など）や、セッションが無いのに
  //    キャッシュだけ残っている場合は、セッションもキャッシュも捨てて「無い」扱いにする。
  await validateSession();

  // ② SQLite に、このuidの写しがあれば、サーバーには聞かない
  const cached = await getCachedUser();
  const currentUid = await getCurrentUid();
  if (cached && currentUid && cached.uid === currentUid) {
    return {
      uid: cached.uid,
      firstUseDate: cached.firstUseDate,
      accountId: cached.accountId,
    };
  }
  if (cached) {
    await clearCachedUser();
  }

  // ③ 端末を登録する。セッションが無ければ、先に匿名ユーザーを作る
  //    （ログイン済みなら、signInAnonymously は今のuidをそのまま返す）
  const user = await signInAnonymously();
  return registerThisDevice(user.uid);
}

/**
 * 003_011_device.txt「端末を登録する」。サーバーが、devices・users/{uid}・端末の一覧を作り、
 * この端末の firstUseDate を返す。それを SQLite に写す。
 * 起動時（SQLite に写しが無い時）と、Googleログインで uid が切り替わった時（合流）に呼ぶ。
 *
 * 失敗した時（オフライン等）は、SQLite に写しが無いままになる。この端末の日付が
 * 分からない間は、利用不可。次の起動で、もう一度ここを通る。
 */
export async function registerThisDevice(uid: string): Promise<EnsureUserResult> {
  const androidId = await getAndroidId();
  if (!androidId) {
    throw new Error('Android ID missing');
  }
  const registered = await registerDevice(androidId);
  await cacheUser(uid, registered.firstUseDate, registered.accountId);
  return {
    uid,
    firstUseDate: registered.firstUseDate,
    accountId: registered.accountId,
  };
}

let inviteCheckInflight: Promise<PendingInvite | null> | null = null;

/**
 * 003_002_flow.txt「通常起動：Android」「匿名ユーザー→Google認証」の
 * 「招待チェックは非同期」に対応。
 *
 * Googleユーザー（emailを持つ）であれば、joinAccountをバックグラウンドで呼び、
 * 自分宛の招待が無いか確認する。画面はブロックしない。呼び出し元は、InviteWatcher.tsx
 * （起動時・フォアグラウンド復帰時）と AccountScreen.tsx（画面を開いた時・自己脱退の直後）。
 * 匿名ユーザーの場合や、通信エラー等で失敗した場合は、何もせず静かに終わる。
 *
 * 戻り値: 新規の招待が見つかり「参加しますか？」の確認が必要な場合は、その内容を返す。
 * それ以外（招待なし／既に合流済み／課金中で黙って拒否された）はnull。
 * 呼び出し元は、null以外が返ってきたら、確認ダイアログ（promptJoinInvite）を表示し、
 * 選んだ結果を respondToInvite(accept) で確定させること（InviteWatcher.tsx参照）。
 *
 * 招待が無く、かつ自分のaccountIdも空の場合（owner退会後・招待辞退後・脱退直後など）は、
 * 「FireMint Account作成」フローに対応して、自動で自分だけのaccountを作る（決定）。
 */
export function checkForInvite(): Promise<PendingInvite | null> {
  if (!inviteCheckInflight) {
    inviteCheckInflight = doCheckForInvite().finally(() => {
      inviteCheckInflight = null;
    });
  }
  return inviteCheckInflight;
}

async function doCheckForInvite(): Promise<PendingInvite | null> {
  const uid = await getCurrentUid();
  if (!uid) {
    return null;
  }
  const doc = await fetchUserDocument();
  if (!doc?.email) {
    // 匿名のまま（Googleログイン未済）は、招待の対象外
    return null;
  }
  const joined = await joinAccount();
  if (joined.joined) {
    await updateCachedAccountId(joined.accountId);
    return null;
  }
  if (joined.pendingInvite) {
    return joined.pendingInvite;
  }
  if (!doc.accountId) {
    // Googleログイン済みでaccountIdが空。招待も無ければ、自動で自分だけのaccountを作る
    const created = await createAccount();
    await updateCachedAccountId(created.accountId);
  }
  return null;
}
