import {useEffect, useState} from 'react';
import {Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {connectWithGoogle} from '../features/connection/native/connect';
import {getSession, onSessionChange} from '../features/connection/native/google_auth';
import {getCachedEntitlement, refreshCachedEntitlement} from '../features/account/native/entitlementCache';
import type {Entitlement} from '../features/account/shared/types';
import {useLocale, type StringKey} from '../shared/i18n/i18n';
import {ScreenFrame} from '../shared/shell/chrome';
import {useTheme} from '../shared/settings/theme';
import {useScaledStyles} from '../shared/settings/text_scale';

// 「アカウント」（firemintアカウント。課金・トライアル）を左上（一番目立つ位置）に置く。
// 「認証」（firestoreアカウント。外部Firestore接続）は下の方へ。ここが逆だったため、
// どちらがFireMint本体のログインか混同が起きた（決定。位置の入れ替えのみで、各カードの
// 処理ロジック自体（onCardでのid分岐）は変えない）。
const CARDS: {id: string; key: StringKey}[] = [
  {id: 'account', key: 'home.card.account'},
  {id: 'projects', key: 'home.card.projects'},
  {id: 'transfer', key: 'home.card.transfer'},
  {id: 'snippets', key: 'home.card.snippets'},
  {id: 'auth', key: 'home.card.auth'},
  {id: 'settings', key: 'home.card.settings'},
];

// FireMint本体の機能（Firestoreプロジェクトへの接続・閲覧・転送）は、
// 利用権（trial/subscribed）が無いと使えない。account/settingsは対象外
// （課金するためにaccount画面へは常に行けないといけない）。見落とし対応（決定）。
const GATED_CARD_IDS = new Set(['auth', 'projects', 'transfer', 'snippets']);

type HomeScreenProps = {
  onOpenConnection: () => void;
  onOpenProjects: () => void;
  onOpenSnippets: () => void;
  onOpenTransfer: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
};

export function HomeScreen({
  onOpenConnection,
  onOpenProjects,
  onOpenSnippets,
  onOpenTransfer,
  onOpenSettings,
  onOpenAccount,
}: HomeScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {color2, ink, inkQuiet} = useTheme();
  const {t} = useLocale();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(getCachedEntitlement);

  useEffect(() => {
    getSession()
      .then(session => setEmail(session?.email ?? null))
      .catch(() => setEmail(null));
    // プロジェクト一覧でのアカウント切り替え・サインアウトを、ここの表示にも反映する
    const unsubscribe = onSessionChange(session => setEmail(session?.email ?? null));
    // 利用状態は、起動時にロゴ画面で確定済み（App.tsx）。取れていない時だけ、ここで取り直す
    if (getCachedEntitlement() === null) {
      refreshEntitlement();
    }

    // メモリ上のentitlement（ゲートの正）は、起動時だけでなくフォアグラウンド復帰時にも
    // 塗り替える（決定。E4見直し）。App.tsxのタブスタックはHomeScreenを常駐させ続け
    // （画面遷移してもunmountされない）ため、起動時の1回だけでは古くなっていく。
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshEntitlement();
      }
    });
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);

  // 003_002_flow.txt「利用状態の判定」に対応。実際の計算・メモリキャッシュの更新は
  // entitlementCache.ts#refreshCachedEntitlementに一本化している（InviteWatcher.tsxも
  // 同じ関数を使う。ロジックを画面ごとに重複させると更新漏れの元になるため）。
  // ここでは、その結果を画面のstateにも反映するだけ。
  async function refreshEntitlement(): Promise<Entitlement | null> {
    const next = await refreshCachedEntitlement();
    setEntitlement(next);
    return next;
  }

  // 外部Firestoreを触る画面（認証・プロジェクト一覧・インポート/エクスポート）は、入口で
  // firestoreアカウントのサインインを済ませる（決定。3つのカードで動きを揃える）。
  // サインイン済みなら、Googleの画面は出ない。キャンセルしたら、ホームに留まる。
  async function connectThen(open: () => void) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await connectWithGoogle();
      const after = await getSession();
      setEmail(after?.email ?? null);
      open();
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('home.authFailedTitle'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  // 決定（E4見直し）: 「不明なら遮断しない」はやめる。許可（trial/subscribed）の時だけ
  // 進む。門の正はメモリ上のentitlementCache。
  //   ・メモリで通過（trial/subscribed）→ そのまま進む（ネット待たない）
  //   ・メモリでNG（expired）→ サーバーで確認し直す。復活していれば通す。切れなら止める
  //   ・メモリが無い（null）→ サーバーで取得する。許可が取れなければ入れない
  // 一覧画面などページ内でのentitlement再判定は必須にしない。機内モードで入り込む穴は、
  // ここ（門）で塞ぐ。
  async function onCard(id: string) {
    if (GATED_CARD_IDS.has(id)) {
      let current = getCachedEntitlement();
      if (current !== 'trial' && current !== 'subscribed') {
        current = await refreshEntitlement();
      }
      if (current !== 'trial' && current !== 'subscribed') {
        Alert.alert(t('home.trialExpiredTitle'), t('home.trialExpiredMessage'), [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('home.card.account'), onPress: onOpenAccount},
        ]);
        return;
      }
    }
    if (id === 'auth') {
      connectThen(onOpenConnection);
    }
    if (id === 'projects') {
      connectThen(onOpenProjects);
    }
    if (id === 'snippets') {
      onOpenSnippets();
    }
    if (id === 'transfer') {
      connectThen(onOpenTransfer);
    }
    if (id === 'settings') {
      onOpenSettings();
    }
    if (id === 'account') {
      onOpenAccount();
    }
  }

  return (
    <ScreenFrame title="FireMint">
      <ScrollView>
        {email ? <Text style={[styles.email, inkQuiet]}>{email}</Text> : null}
        <View style={styles.grid}>
          {CARDS.map(card => (
            <Pressable
              key={card.id}
              style={[styles.card, busy ? styles.cardBusy : null]}
              onPress={() => onCard(card.id)}>
              <View style={[styles.bar, {backgroundColor: color2}]} />
              <Text style={[styles.cardLabel, ink]}>{t(card.key)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  email: {
    fontSize: 13,
    marginBottom: 12,
    marginTop: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  card: {
    width: '48%',
    minHeight: 88,
    marginBottom: 12,
    paddingVertical: 16,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardBusy: {
    opacity: 0.6,
  },
  bar: {
    width: 3,
    height: 28,
    marginRight: 12,
    borderRadius: 1,
  },
  cardLabel: {
    fontSize: 15,
    flexShrink: 1,
  },
});
