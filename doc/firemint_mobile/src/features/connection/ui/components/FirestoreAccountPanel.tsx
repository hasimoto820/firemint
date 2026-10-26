import {useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {useLocale} from '../../../../shared/i18n/i18n';
import {useTheme} from '../../../../shared/settings/theme';
import {
  getSession,
  onSessionChange,
  signOut,
  switchAccount,
} from '../../native/google_auth';
import {useScaledStyles} from '../../../../shared/settings/text_scale';

type FirestoreAccountPanelProps = {
  // 置いた画面の「処理中」と共有する（処理中は、画面側の操作もこのパネルの操作も止める）
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSignedOut: () => void;
};

// いまの firestoreアカウントと、切り替え・サインアウト。
// 認証画面とプロジェクト一覧の両方に置く（どちらで操作しても同じ動き）。
export function FirestoreAccountPanel({busy, onBusy, onSignedOut}: FirestoreAccountPanelProps) {
  const styles = useScaledStyles(baseStyles);
  const {ink, inkQuiet, frame} = useTheme();
  const {t} = useLocale();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getSession()
      .then(session => setEmail(session?.email ?? null))
      .catch(() => setEmail(null));
    // この画面での切り替えのほか、別のタブでの切り替え・サインアウトも反映する
    return onSessionChange(session => setEmail(session?.email ?? null));
  }, []);

  async function onSwitchAccount() {
    if (busy) {
      return;
    }
    onBusy(true);
    try {
      await switchAccount();
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('workspace.projectList.switchAccountFailed'), err.message ?? String(e));
      }
    } finally {
      onBusy(false);
    }
  }

  // サインアウトの前に、確認を挟む
  function onSignOutPress() {
    if (busy) {
      return;
    }
    Alert.alert(t('workspace.projectList.signOutConfirmTitle'), email ?? undefined, [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('workspace.projectList.signOut'), style: 'destructive', onPress: onSignOut},
    ]);
  }

  async function onSignOut() {
    if (busy) {
      return;
    }
    onBusy(true);
    try {
      await signOut();
      onSignedOut();
    } catch (e) {
      Alert.alert(t('workspace.projectList.signOutFailed'), String(e));
    } finally {
      onBusy(false);
    }
  }

  return (
    <View style={[styles.panel, frame]}>
      <Text style={[styles.caption, inkQuiet]}>{t('workspace.projectList.accountLabel')}</Text>
      <Text style={[styles.email, ink]} numberOfLines={1}>
        {email ?? '-'}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onSwitchAccount}
          disabled={busy}
          style={[styles.chip, frame, busy ? styles.dim : null]}>
          <Text style={[styles.chipLabel, ink]}>{t('workspace.projectList.switchAccount')}</Text>
        </Pressable>
        <Pressable
          onPress={onSignOutPress}
          disabled={busy}
          style={[styles.chip, frame, busy ? styles.dim : null]}>
          <Text style={[styles.chipLabel, ink]}>{t('workspace.projectList.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  panel: {
    padding: 14,
    marginBottom: 28,
  },
  caption: {
    fontSize: 12,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  dim: {
    opacity: 0.6,
  },
});
