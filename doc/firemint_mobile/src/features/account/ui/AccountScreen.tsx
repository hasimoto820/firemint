import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  clearAllAppData,
  clearLocalData,
  fetchAccountOwnerUid,
  fetchMembers,
  fetchUserDocument,
  linkWithGoogle,
  signOut,
  updateCachedAccountId,
  updateUserProfile,
} from '../native/auth';
import {purchaseSubscription, restorePurchase} from '../native/billing';
import {checkForInvite, ensureUser, registerThisDevice} from '../native/bootstrap';
import {fetchEntitlement, trialDaysLeft, TRIAL_MS} from '../native/entitlement';
import {setCachedEntitlement} from '../native/entitlementCache';
import {
  addMember,
  createAccount,
  deleteAccount,
  deleteMyData,
  joinAccount,
  removeMember,
  respondToInvite,
  verifyAndroidPurchase,
} from '../native/functions';
import type {Entitlement, MemberEntry, PendingInvite} from '../shared/types';
import {useLocale, type StringKey} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import {signOut as signOutFirestore} from '../../connection/native/google_auth';
import {BusyOverlay} from '../../../shared/ui/BusyOverlay';
import {promptJoinInvite} from './joinInvitePrompt';
import {useScaledStyles} from '../../../shared/settings/text_scale';

// 1つのaccountに入れる人数の上限（ownerを含む。招待中も数える）。
// サーバー側は functions/src/account/addMember.ts の MAX_MEMBERS
const MAX_MEMBERS = 2;

type AccountScreenProps = {
  onBack: () => void;
};

export function AccountScreen({onBack}: AccountScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {color1, ink, inkQuiet, frame, fill, inkOnFill, dangerBg} = useTheme();
  const {t} = useLocale();

  const [uid, setUid] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [firstUseDate, setFirstUseDate] = useState<number | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [busy, setBusy] = useState(false);
  // 操作中の処理の数。招待への応答（checkInviteOnOpen）は、他の操作と重なり得るので、
  // 全部が終わるまで幕（BusyOverlay）を下ろさない
  const busyDepth = useRef(0);
  // 画面を開いた時の読み込み（bootstrap）の状態。終わるまで中身を出さない
  // （初期値のまま出すと、ログイン済みの人が一瞬、匿名に見える）。
  // failed の時は、案内を出した上で、中身は出さない（戻るだけ）。
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  // 購入できるのはownerのみ（決定。003_002_flow.txt「Androidで課金」前提）
  const [isOwner, setIsOwner] = useState(false);
  // ownerかどうかを、一度でも確認し終えたか。「データ削除」は、ownerとそれ以外で消える範囲と
  // 呼ぶ処理が違うので、確認が済むまではボタンを出さない
  // （isOwnerの初期値falseのまま出すと、ownerがmemberとして扱われてしまう）。
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [deleteDataModalVisible, setDeleteDataModalVisible] = useState(false);
  const [deleteDataTypedEmail, setDeleteDataTypedEmail] = useState('');

  async function refreshOwnerFlag(
    nextAccountId: string | null,
    currentUid: string | null,
  ): Promise<boolean> {
    if (!nextAccountId || !currentUid) {
      setIsOwner(false);
      setOwnerChecked(true);
      return false;
    }
    const ownerUid = await fetchAccountOwnerUid(nextAccountId);
    const owner = ownerUid === currentUid;
    setIsOwner(owner);
    setOwnerChecked(true);
    return owner;
  }

  async function refreshMembers(nextAccountId: string | null) {
    if (!nextAccountId) {
      setMembers([]);
      return;
    }
    try {
      setMembers(await fetchMembers(nextAccountId));
    } catch {
      setMembers([]);
    }
  }

  function beginBusy() {
    busyDepth.current += 1;
    setBusy(true);
  }

  function endBusy() {
    busyDepth.current = Math.max(0, busyDepth.current - 1);
    if (busyDepth.current === 0) {
      setBusy(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  // ヘッダーの「↻」。別の端末での変更（招待への応答・購入など）を取り込む。
  // 開いた時と同じ読み込みを、もう一度行う（読み込みに失敗した後の、やり直しにもなる）
  function onReload() {
    if (phase === 'loading' || busy) {
      return;
    }
    setPhase('loading');
    bootstrap();
  }

  async function bootstrap() {
    try {
      // セッションの有効確認（削除されたユーザーの扱い）は ensureUser の先頭で行う
      const result = await ensureUser();
      setUid(result.uid);

      // この端末のfirstUseDateは変わらないので、ensureUserが返す値（SQLiteの写し）を使う。
      // accountId の正はサーバー（users/{uid}）。ensureUserはuid一致時にSQLiteキャッシュを
      // そのまま返すので、キャッシュが古ければここで更新する
      // （003_002_flow.txt「起動時の判定順」参照）。
      const firstUseDate = result.firstUseDate;
      setFirstUseDate(firstUseDate);
      const doc = await fetchUserDocument();
      setEmail(doc?.email ? doc.email : null);
      let accountId = doc ? doc.accountId : result.accountId;

      // Googleログイン済みでaccountIdが空（owner退会・招待辞退・脱退/除外の直後など）の場合、
      // ここでcheckForInviteを呼んで、招待の有無を確認した上で自動でaccountを作る（決定）。
      // これを呼ばないと、既にGoogleログイン済みの画面には「accountを作る」導線が無く、
      // 購入ボタン等がaccountId前提のため何も表示されない状態になってしまう。
      // ここで見つかった招待は、下のcheckInviteOnOpenへ渡す（joinAccountを二重に呼ばない）。
      let checkedInvite: PendingInvite | null | undefined;
      if (doc?.email && !accountId) {
        checkedInvite = await checkForInvite();
        const refreshedDoc = await fetchUserDocument();
        accountId = refreshedDoc ? refreshedDoc.accountId : accountId;
      }

      if (accountId !== result.accountId) {
        await updateCachedAccountId(accountId);
      }
      setAccountId(accountId);
      await refreshOwnerFlag(accountId, result.uid);
      await refreshMembers(accountId);

      const current = await fetchEntitlement(accountId, firstUseDate);
      setEntitlement(current);
      setCachedEntitlement(current);

      // 購入済みなのにFireMint側へ反映できていない場合（検証の失敗・再インストール等）を自動で直す。
      // 中身を出す前に済ませる（出した後に、利用状態の表示が変わらないように）。
      if (accountId && current !== 'subscribed') {
        try {
          await restoreIfAny(accountId, firstUseDate);
        } catch {}
      }
      setPhase('ready');

      // 招待チェック（決定: アカウント画面を開いた時。accountIdの有無に関係なく）。
      // 画面の表示は待たせない（awaitしない）。
      if (doc?.email) {
        checkInviteOnOpen(result.uid, firstUseDate, checkedInvite);
      }
    } catch (e) {
      setPhase('failed');
      Alert.alert(t('account.bootstrapFailed'), errorMessage(e));
    }
  }

  /**
   * 003_002_flow.txt「通常起動：Android」の「招待チェックのタイミング」に対応。
   * アカウント画面を開いた時に、自分宛の招待を確認する（InviteWatcherと同じ流れ）。
   * checked: bootstrap()で既にcheckForInviteを呼んだ場合はその結果（undefinedなら未確認）。
   * 失敗しても画面の表示には影響させない（InviteWatcherと同じく静かに無視する）。
   */
  async function checkInviteOnOpen(
    currentUid: string,
    currentFirstUseDate: number,
    checked: PendingInvite | null | undefined,
  ) {
    try {
      const pending = checked !== undefined ? checked : await checkForInvite();
      if (!pending) {
        return;
      }
      const accepted = await promptJoinInvite(t, pending.ownerEmail);
      if (accepted === null) {
        // InviteWatcher側が既にダイアログを表示中。応答はそちらが確定させる
        return;
      }
      // 確認（招待の有無）は裏で行うが、応答の確定は更新なので、終わるまで幕を出す
      beginBusy();
      try {
        const responded = await respondToInvite(accepted);
        if (!responded.joined) {
          return;
        }
        await updateCachedAccountId(responded.accountId);
        setAccountId(responded.accountId);
        await refreshOwnerFlag(responded.accountId, currentUid);
        await refreshMembers(responded.accountId);
        await refreshEntitlement(responded.accountId, currentFirstUseDate);
      } finally {
        endBusy();
      }
    } catch {
      // オフライン・招待の取り消し等は静かに無視する
    }
  }

  // ホーム画面のゲート（entitlementCache。決定: E4見直し）が参照するメモリ値も、
  // ここで同時に塗り替える。購入・脱退・合流など、entitlementが変わり得る操作の
  // 直後に必ず呼ばれる（003_002_flow.txt「利用状態の判定」参照）。
  async function refreshEntitlement(
    nextAccountId: string | null,
    nextFirstUseDate: number,
  ): Promise<Entitlement> {
    const current = await fetchEntitlement(nextAccountId, nextFirstUseDate);
    setEntitlement(current);
    setCachedEntitlement(current);
    return current;
  }

  // Google Play側に既存の購入があれば、サーバー検証にかけて反映する。あればtrue。
  async function restoreIfAny(nextAccountId: string, nextFirstUseDate: number): Promise<boolean> {
    const existing = await restorePurchase();
    if (!existing) {
      return false;
    }
    const verified = await verifyAndroidPurchase(existing.purchaseToken, existing.productId);
    await refreshEntitlement(nextAccountId, nextFirstUseDate);
    // 期限切れの購入だった場合は復元成功とみなさず、通常の購入に進めるようにする
    return verified.expiryTimeMillis > Date.now();
  }

  async function onLinkGoogle() {
    if (busy) {
      return;
    }
    beginBusy();
    try {
      const linked = await linkWithGoogle();
      setEmail(linked.email);

      // 基本ルール3（合流）: 既存のuidへ切り替わった場合は、端末を登録し直す
      // （合流先の users/{uid}/devices にこの端末を足し、uid / accountId のキャッシュを
      // 作り直す。この端末の firstUseDate は変わらない）
      let currentFirstUseDate = firstUseDate;
      let currentAccountId = accountId;
      if (linked.switched) {
        const synced = await registerThisDevice(linked.uid);
        setUid(synced.uid);
        setFirstUseDate(synced.firstUseDate);
        setAccountId(synced.accountId);
        currentFirstUseDate = synced.firstUseDate;
        currentAccountId = synced.accountId;
      }
      await updateUserProfile();

      const nextAccountId = await joinOrCreateAccount(currentAccountId);
      await updateCachedAccountId(nextAccountId);
      setAccountId(nextAccountId);
      const owner = await refreshOwnerFlag(nextAccountId, linked.uid);
      await refreshMembers(nextAccountId);
      if (currentFirstUseDate != null) {
        const current = await refreshEntitlement(nextAccountId, currentFirstUseDate);
        // 未契約の owner なら、ログインした直後にも購入の復元を行う（アカウント画面を
        // 開いた時と同じ。003_002_flow.txt「購入の復元」）。失敗は表示しない
        if (owner && current !== 'subscribed') {
          try {
            await restoreIfAny(nextAccountId, currentFirstUseDate);
          } catch {}
        }
      }
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('account.linkFailedTitle'), errorMessage(e));
      }
    } finally {
      endBusy();
    }
  }

  /**
   * 003_002_flow.txt「匿名ユーザー→Google認証」の招待確認に対応。
   * joinAccountは確認・照会のみ行う（新規の招待への合流は確定させない。自分が既に
   * 所属しているaccountの検知はしない。それは呼び出し元がexistingAccountIdで持っている）。
   * pendingInviteが返ってきたら、ここで「参加しますか？」を確認し、
   * 応答をrespondToInviteで確定させる。招待が無い場合、既にaccountを持っていればそれを
   * そのまま使い、持っていなければcreateAccountで新規に作る
   * （合流(switched)直後に既にaccountId確定済みの状態でcreateAccountを呼ぶと、
   * サーバー側でalready-existsエラーになってしまうため、既存分岐を先に見る）。
   */
  async function joinOrCreateAccount(existingAccountId: string | null): Promise<string> {
    const joined = await joinAccount();
    if (joined.joined) {
      return joined.accountId;
    }
    if (joined.pendingInvite) {
      const accepted = await promptJoinInvite(t, joined.pendingInvite.ownerEmail);
      // null: InviteWatcher側が既にダイアログを表示中。応答はそちらが確定させる
      if (accepted !== null) {
        try {
          const responded = await respondToInvite(accepted);
          if (responded.joined) {
            return responded.accountId;
          }
        } catch (e) {
          // 例: 確認中に自分のaccountが課金中になった等のレース。自分のaccountで続行する
          Alert.alert(t('account.joinInviteFailedTitle'), errorMessage(e));
        }
      }
    }
    if (existingAccountId) {
      return existingAccountId;
    }
    return (await createAccount()).accountId;
  }

  async function onPurchase() {
    if (busy || !accountId || !isOwner || firstUseDate == null) {
      return;
    }
    beginBusy();
    try {
      if (await restoreIfAny(accountId, firstUseDate)) {
        return;
      }
      const purchase = await purchaseSubscription();
      await verifyAndroidPurchase(purchase.purchaseToken, purchase.productId);
      await refreshEntitlement(accountId, firstUseDate);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('account.purchaseFailedTitle'), errorMessage(e));
      }
    } finally {
      endBusy();
    }
  }

  async function onAddMember() {
    if (busy || !memberEmail.trim()) {
      return;
    }
    beginBusy();
    try {
      await addMember(memberEmail.trim());
      setMemberEmail('');
      await refreshMembers(accountId);
      Alert.alert(t('account.addMemberDone'));
    } catch (e) {
      Alert.alert(t('account.addMemberFailed'), errorMessage(e));
    } finally {
      endBusy();
    }
  }

  // owner操作: member一覧から対象を選んで脱退させる（003_002_flow.txt「メンバー脱退」）
  function onRemoveMember(targetId: string) {
    Alert.alert(t('common.deleteConfirmTitle'), t('account.removeMemberConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('account.removeMemberButton'),
        style: 'destructive',
        onPress: async () => {
          beginBusy();
          try {
            await removeMember(targetId);
            await refreshMembers(accountId);
          } catch (e) {
            Alert.alert(t('account.removeMemberFailed'), errorMessage(e));
          } finally {
            endBusy();
          }
        },
      },
    ]);
  }

  // 自己脱退: member自身がこのaccountから抜ける（owner自身は対象外。owner操作の脱退とは別）
  // この端末のfirstUseDateが既に60日を超えている場合、脱退後すぐに利用不可になる旨を明示する（決定）。
  function onLeaveAccount() {
    if (!uid) {
      return;
    }
    const trialExpired = firstUseDate != null && Date.now() >= firstUseDate + TRIAL_MS;
    const message = trialExpired
      ? t('account.leaveAccountConfirmExpired')
      : t('account.leaveAccountConfirm');
    Alert.alert(t('common.deleteConfirmTitle'), message, [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('account.leaveAccountButton'),
        style: 'destructive',
        onPress: async () => {
          beginBusy();
          try {
            await removeMember(uid);
            // 脱退直後、accountIdが空になる。招待が無ければcheckForInviteが自動で
            // 新しいaccountを作る（決定。bootstrap()と同じ考え方）。招待があれば
            // accountIdは空のままになり、InviteWatcher側の確認ダイアログに委ねる。
            await checkForInvite();
            const doc = await fetchUserDocument();
            const nextAccountId = doc ? doc.accountId : null;
            await updateCachedAccountId(nextAccountId);
            setAccountId(nextAccountId);
            await refreshOwnerFlag(nextAccountId, uid);
            await refreshMembers(nextAccountId);
            if (firstUseDate != null) {
              await refreshEntitlement(nextAccountId, firstUseDate);
            }
          } catch (e) {
            Alert.alert(t('account.leaveAccountFailed'), errorMessage(e));
          } finally {
            endBusy();
          }
        },
      },
    ]);
  }

  // データ削除で、サーバーの削除が済んだ後の、端末側の後始末。
  //   1. FireMintアカウントのセッションを捨てる（サーバー側でAuthのユーザーも削除済み）
  //   2. firestoreアカウント（外部Firestoreへの接続。端末の中だけにあるメールアドレスと
  //      トークン）を消す
  //   3. 端末の中の作業データ（名簿・スニペット・設定・ユーザーの写し・一時ファイル）を消す
  //   4. 完了の案内を出し、OKでアプリのデータを丸ごと消して、アプリを閉じる
  // 3までを案内の前に行う（OKを押さずにアプリを閉じても、端末に残さない）。
  // サーバーの削除は済んでいるので、ここで失敗しても「削除できませんでした」とは出さない。
  // 端末の中を消し切れなかった時だけ、案内の文面を変えて、手動での消去を頼む。
  async function finishDelete() {
    let localCleared = true;
    try {
      await signOut();
    } catch {}
    try {
      await signOutFirestore();
    } catch {
      localCleared = false;
    }
    try {
      await clearLocalData();
    } catch {
      localCleared = false;
    }
    setUid(null);
    setAccountId(null);
    setEmail(null);
    setEntitlement(null);
    setCachedEntitlement(null);
    closeAppAfterDelete(localCleared);
  }

  // アプリを閉じるのは、同じ起動のまま画面を触ると、その場で新しい匿名ユーザーとして
  // 登録し直される（端末の期限 expireAt も消える）ため。次に開いた時は、インストール直後と
  // 同じ流れになる（基本ルール0。トライアルは devices の日付のまま続く。003_011_device.txt）。
  function closeAppAfterDelete(localCleared: boolean) {
    Alert.alert(
      t('account.deletedTitle'),
      t(localCleared ? 'account.deletedMessage' : 'account.deletedLocalFailedMessage'),
      [
        {
          text: t('common.ok'),
          onPress: async () => {
            try {
              await clearAllAppData();
            } catch {}
            // データを消せた時は、ここへ来る前にプロセスが終わる
            BackHandler.exitApp();
          },
        },
      ],
      {cancelable: false},
    );
  }

  // データ削除（003_002_flow.txt「退会・データ削除要請」）。ボタンは、owner・member・匿名で共通。
  // 消える範囲は立場で違うので、確認の文面を変える。
  //   owner  … 契約全体（account・members・購入記録・本人）。契約中なら、先に自動更新を止める
  //   member … 本人の登録だけ（ownerの契約には影響しない）
  //   匿名   … 本人の登録だけ
  // 取り消せないので、二重確認にする（決定）。1回目はこの通常の確認、2回目は下のモーダルで
  // Googleアカウントのメールアドレスを入力させる（誤操作防止の意図的なタイプ動作を挟む）。
  // 匿名はメールアドレスが無いので、1回目の確認だけで実行する（決定）。
  function onDeleteData() {
    const lines: string[] = [];
    if (isOwner) {
      lines.push(
        t(
          entitlement === 'subscribed'
            ? 'account.deleteDataConfirmOwnerSubscribed'
            : 'account.deleteDataConfirmOwner',
        ),
      );
      if (members.length > 1) {
        lines.push(t('account.deleteDataNoteMembers'));
      }
    } else {
      lines.push(t(accountId ? 'account.deleteDataConfirmMember' : 'account.deleteDataConfirm'));
    }
    lines.push(t('account.deleteDataNoteLocal'));
    let message = lines.join('\n');
    if (isOwner && entitlement === 'subscribed') {
      message += '\n\n' + t('account.deleteDataNotePaidPeriod');
    }
    Alert.alert(t('common.deleteConfirmTitle'), message, [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (email) {
            setDeleteDataTypedEmail('');
            setDeleteDataModalVisible(true);
          } else {
            runDeleteData();
          }
        },
      },
    ]);
  }

  function confirmDeleteData() {
    if (!email || deleteDataTypedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return;
    }
    setDeleteDataModalVisible(false);
    runDeleteData();
  }

  // ownerは deleteAccount（Google Play の解約 → 契約全体の削除）、それ以外は deleteMyData。
  async function runDeleteData() {
    if (busy) {
      return;
    }
    beginBusy();
    try {
      if (isOwner) {
        await deleteAccount();
      } else {
        await deleteMyData();
      }
    } catch (e) {
      endBusy();
      Alert.alert(t('account.deleteDataFailed'), errorMessage(e));
      return;
    }
    // 削除できた後は、幕を下ろさない（アプリを閉じるまで）。下ろすと、完了の案内でOKを
    // 押してからアプリが閉じるまでの間、空になった画面（「Googleでログイン」）を触れてしまう。
    await finishDelete();
  }

  const statusText = entitlementLabel(entitlement, firstUseDate, t);

  if (phase !== 'ready') {
    return (
      <ScreenFrame title={t('account.title')} onBack={onBack} onReload={onReload}>
        {phase === 'loading' ? (
          <ActivityIndicator style={styles.loading} size="large" color={ink.color} />
        ) : null}
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame title={t('account.title')} onBack={onBack} onReload={onReload}>
      <ScrollView>
        {uid ? (
          <>
            <Text style={[styles.uid, inkQuiet]}>{uid}</Text>
            <Text style={[styles.status, entitlement === 'subscribed' ? inkOnFill : ink, entitlement === 'subscribed' ? fill : null]}>
              {statusText}
            </Text>
          </>
        ) : null}

        {email ? (
          <Text style={[styles.email, inkQuiet]}>{email}</Text>
        ) : (
          <Pressable
            style={[styles.button, frame, busy ? styles.busy : null]}
            onPress={onLinkGoogle}
            disabled={busy}>
            <Text style={[styles.buttonLabel, ink]}>
              {t('account.linkGoogleButton')}
            </Text>
          </Pressable>
        )}

        {accountId && isOwner && entitlement !== 'subscribed' ? (
          <Pressable
            style={[styles.button, fill, busy ? styles.busy : null]}
            onPress={onPurchase}
            disabled={busy}>
            <Text style={[styles.buttonLabel, inkOnFill]}>
              {t('account.purchaseButton')}
            </Text>
          </Pressable>
        ) : null}

        {accountId && members.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, ink]}>
              {t('account.membersTitle')}
            </Text>
            {members.map(member => (
              <View key={member.id} style={styles.memberRow}>
                <Text style={[styles.memberEmail, ink]}>
                  {member.email ?? member.id}
                  {member.id === uid ? t('account.memberYou') : ''}
                  {member.pending ? t('account.memberPending') : ''}
                </Text>
                {isOwner && member.id !== uid ? (
                  <Pressable
                    onPress={() => onRemoveMember(member.id)}
                    disabled={busy}
                    hitSlop={8}>
                    <Text style={[styles.memberRemove, dangerBg]}>
                      {t('account.removeMemberButton')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 枠が埋まっている間は出さない。もう1人を入れるには、先に上の「外す」が必要 */}
        {accountId && isOwner && members.length < MAX_MEMBERS ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, ink]}>
              {t('account.addMemberButton')}
            </Text>
            <TextInput
              style={[styles.input, frame, ink]}
              value={memberEmail}
              onChangeText={setMemberEmail}
              placeholder={t('account.addMemberPlaceholder')}
              placeholderTextColor={inkQuiet.color}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Pressable
              style={[styles.button, frame, busy ? styles.busy : null]}
              onPress={onAddMember}
              disabled={busy}>
              <Text style={[styles.buttonLabel, ink]}>
                {t('account.addMemberButton')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {accountId && !isOwner ? (
          <View style={styles.section}>
            <Pressable
              style={[styles.button, frame, dangerBg, busy ? styles.busy : null]}
              onPress={onLeaveAccount}
              disabled={busy}>
              <Text style={[styles.buttonLabel, ink]}>
                {t('account.leaveAccountButton')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* ownerかどうかを確認し終えてから出す（ownerとそれ以外で、消える範囲と呼ぶ処理が違う） */}
        {uid && ownerChecked ? (
          <View style={styles.deleteSection}>
            <Pressable
              style={[styles.button, frame, dangerBg, busy ? styles.busy : null]}
              onPress={onDeleteData}
              disabled={busy}>
              <Text style={[styles.buttonLabel, ink]}>
                {t('account.deleteDataButton')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={deleteDataModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteDataModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, {backgroundColor: color1}, frame]}>
            <Text style={[styles.sectionTitle, ink]}>
              {t('account.deleteDataTypeTitle')}
            </Text>
            <Text style={[styles.email, ink]}>
              {t('account.deleteDataTypeMessage', {email: email ?? ''})}
            </Text>
            <TextInput
              style={[styles.input, frame, ink]}
              value={deleteDataTypedEmail}
              onChangeText={setDeleteDataTypedEmail}
              placeholder={t('account.deleteDataTypePlaceholder')}
              placeholderTextColor={inkQuiet.color}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <View style={styles.formRow}>
              <Pressable
                onPress={() => setDeleteDataModalVisible(false)}
                hitSlop={8}>
                <Text style={[styles.buttonLabel, ink]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteData}
                disabled={
                  busy ||
                  !email ||
                  deleteDataTypedEmail.trim().toLowerCase() !== email.trim().toLowerCase()
                }
                hitSlop={8}>
                <Text
                  style={[
                    styles.buttonLabel,
                    email &&
                    deleteDataTypedEmail.trim().toLowerCase() === email.trim().toLowerCase()
                      ? dangerBg
                      : inkQuiet,
                  ]}>
                  {t('common.delete')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <BusyOverlay visible={busy} />
    </ScreenFrame>
  );
}

function entitlementLabel(
  entitlement: Entitlement | null,
  firstUseDate: number | null,
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
): string {
  if (entitlement === 'subscribed') {
    return t('account.statusSubscribed');
  }
  if (entitlement === 'expired') {
    return t('account.trialExpired');
  }
  if (entitlement === 'trial' && firstUseDate != null) {
    return t('account.trialDaysLeft', {days: trialDaysLeft(firstUseDate)});
  }
  return '';
}

function errorMessage(e: unknown): string {
  const err = e as {message?: string};
  return err.message ?? String(e);
}

const baseStyles = StyleSheet.create({
  uid: {
    fontSize: 12,
    marginBottom: 4,
  },
  status: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  email: {
    fontSize: 14,
    marginBottom: 16,
  },
  section: {
    marginTop: 24,
  },
  // アカウント削除は、他の操作から大きく離して置く（取り返しのつかない操作）
  deleteSection: {
    marginTop: 72,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  memberEmail: {
    fontSize: 14,
    flexShrink: 1,
  },
  memberRemove: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  busy: {
    opacity: 0.6,
  },
  loading: {
    marginTop: 48,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
