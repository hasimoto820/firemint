import {Alert} from 'react-native';
import type {StringKey} from '../../../shared/i18n/i18n';

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

// 確認ダイアログを表示中か。起動直後にアカウント画面を開くと、InviteWatcherと
// AccountScreenの招待チェックが同時に動き得るため、重ねて出さない（決定）。
let showing = false;

/**
 * 003_002_flow.txt「匿名ユーザー→Google認証」の「〇〇さんのFireMintに参加しますか？」に対応。
 * AccountScreen（Googleログイン直後・画面を開いた時）とInviteWatcher（起動・フォアグラウンド
 * 復帰時）から使う共通の確認ダイアログ。
 *
 * 戻り値: 参加するならtrue、参加しないならfalse。
 * 既に別の呼び出し元がダイアログを表示中ならnull（何も表示しない）。nullを受け取った
 * 呼び出し元は、respondToInviteを呼ばずに何もしないこと（応答は表示した側が確定させる）。
 */
export function promptJoinInvite(
  t: Translate,
  ownerEmail: string | null,
): Promise<boolean | null> {
  if (showing) {
    return Promise.resolve(null);
  }
  showing = true;
  return new Promise(resolve => {
    const done = (accepted: boolean) => {
      showing = false;
      resolve(accepted);
    };
    Alert.alert(
      t('account.joinInviteTitle'),
      t('account.joinInviteMessage', {ownerEmail: ownerEmail ?? '?'}),
      [
        {text: t('account.joinInviteDecline'), style: 'cancel', onPress: () => done(false)},
        {text: t('account.joinInviteAccept'), onPress: () => done(true)},
      ],
      {cancelable: false},
    );
  });
}
