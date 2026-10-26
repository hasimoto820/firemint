import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {updateCachedAccountId} from '../native/auth';
import {checkForInvite} from '../native/bootstrap';
import {refreshCachedEntitlement} from '../native/entitlementCache';
import {respondToInvite} from '../native/functions';
import {useLocale} from '../../../shared/i18n/i18n';
import {promptJoinInvite} from './joinInvitePrompt';

/**
 * 003_002_flow.txt「通常起動：Android」「匿名ユーザー→Google認証」の
 * 「招待チェックは非同期」に対応する、画面を持たない常駐コンポーネント。
 *
 * コールドスタート時（マウント時）と、アプリがフォアグラウンドに復帰した時にだけ、
 * 裏でjoinAccountを呼んで招待をチェックする。画面はブロックしない。
 * 招待が見つかった場合だけ「参加しますか？」の確認ダイアログを出し、
 * 応答をrespondToInviteで確定させる。通信エラー等は静かに無視する
 * （次のフォアグラウンド復帰で再試行される）。
 *
 * App.tsxのLocaleRoot/ThemeRootの内側（useLocaleが使える位置）に配置すること。
 */
export function InviteWatcher() {
  const {t} = useLocale();
  // 起動直後は、保存済みの言語を読み込む前（既定の英語）のtが渡ってくる。
  // ダイアログを出す時点の言語で表示するため、最新のtを参照する
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    run();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        run();
      }
    });
    return () => subscription.remove();

    async function run() {
      try {
        const pending = await checkForInvite();
        if (pending) {
          const accepted = await promptJoinInvite(tRef.current, pending.ownerEmail);
          // null: アカウント画面側が既にダイアログを表示中。応答はそちらが確定させる
          if (accepted !== null) {
            const responded = await respondToInvite(accepted);
            if (responded.joined) {
              await updateCachedAccountId(responded.accountId);
            }
          }
        }
        // checkForInviteの中では、招待への合流だけでなく、招待が無い場合の自動account
        // 作成（accountId空の人。bootstrap.ts#doCheckForInvite参照）も静かに起きうる。
        // どちらもentitlementが変わり得るため、ホーム画面のゲートが参照するメモリ
        // （entitlementCache）をここで必ず塗り替える（決定: 合流時は必ず塗り替える）。
        await refreshCachedEntitlement();
      } catch {
        // オフライン・招待の取り消し等は静かに無視する
      }
    }
  }, []);

  return null;
}
