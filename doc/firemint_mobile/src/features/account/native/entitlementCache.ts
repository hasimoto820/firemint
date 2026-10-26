import type {Entitlement} from '../shared/types';
import {fetchUserDocument} from './auth';
import {ensureUser} from './bootstrap';
import {computeEntitlement, fetchEntitlement} from './entitlement';

/**
 * 003_002_flow.txt「利用状態の判定」のゲート（HomeScreen.tsx）が参照する、
 * プロセス内メモリだけのentitlementの写し（SQLiteやFirestoreではない）。
 *
 * 決定（E4見直し）: ゲートの正はこのメモリ値。多少古くても（1〜2日程度）許容する前提のため、
 * 起動時・フォアグラウンド復帰時・アカウント画面での購入/脱退/合流などの
 * タイミングで必ず上書きすること（サボるとゲートの正が古いままになる＝穴になる）。
 * アプリプロセスが終われば消える（永続化しない）。
 */
let cached: Entitlement | null = null;

export function getCachedEntitlement(): Entitlement | null {
  return cached;
}

export function setCachedEntitlement(value: Entitlement | null): void {
  cached = value;
}

/**
 * entitlementを再計算し、このメモリキャッシュへ書き込む、唯一の実装。
 * HomeScreen.tsx（起動時・フォアグラウンド復帰時・ゲート判定時）と
 * InviteWatcher.tsx（起動時・フォアグラウンド復帰時。招待確認・自動合流の裏で
 * accountIdが変わり得る）の両方から呼ぶ。ロジックを2箇所に重複させると
 * どちらかが更新漏れになるため、必ずここを通す。
 *
 * オフライン・通信失敗時の扱い:
 * 「不明な状態では遮断しない」は、accountId有りの人のsubscription状態
 * （Firestoreに聞かないと分からない）だけに適用する。accountId無し（trialのみ）の人は、
 * SQLiteにある、この端末のfirstUseDateと現在時刻だけで確実に判定できる（ネットワーク
 * 不要）ため、オフラインでも「不明」扱いにせず、trial切れなら必ずexpiredにする。
 */
export async function refreshCachedEntitlement(): Promise<Entitlement | null> {
  const result = await ensureUser().catch(() => null);
  if (!result) {
    // uidか、この端末の日付が分からない（初めての起動がオフラインだった等）。利用不可。
    setCachedEntitlement(null);
    return null;
  }

  // この端末のfirstUseDateは変わらないので、SQLiteの写しをそのまま使う
  const firstUseDate = result.firstUseDate;
  let accountId = result.accountId;
  try {
    // accountIdの正はサーバー（users/{uid}）。取得できれば、そちらを使う
    // （AccountScreen.tsxのbootstrap()と同じ考え方）。
    // オフライン等で失敗しても、下のローカル判定に進む。
    const doc = await fetchUserDocument();
    if (doc) {
      accountId = doc.accountId;
    }
  } catch {
    // サーバーに聞けない（オフライン等）。キャッシュの値で続行する。
  }

  if (!accountId) {
    // trialのみ。ネットワーク不要で確実に判定できる。
    const next = computeEntitlement(firstUseDate, null);
    setCachedEntitlement(next);
    return next;
  }

  try {
    const next = await fetchEntitlement(accountId, firstUseDate);
    setCachedEntitlement(next);
    return next;
  } catch {
    // accountIdはあるが、subscriptionの状態をサーバーに聞けない（オフライン等）。
    // ここだけは本当に「不明」であり、既存の決定通り楽観的にsubscribed扱いで継続する
    // （003_002_flow.txt「起動時の判定順」①の注記と同じ考え方）。
    setCachedEntitlement('subscribed');
    return 'subscribed';
  }
}
