import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {ensureAuthUsersAccess} from '../../connection/native/google_auth';
import {
  assertWritable,
  confirmDiscard,
  confirmWrite,
} from '../../../shared/safety/confirm_write';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {deleteUser, getUser, setDisabled, updateUser} from '../native/auth_users';
import type {AuthUser} from '../shared/auth_users';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type AuthUserDetailScreenProps = {
  project: WorkspaceProject;
  uid: string;
  onBack: () => void;
  onDeleted: () => void;
};

type Draft = {
  email: string;
  displayName: string;
  phoneNumber: string;
  password: string;
  emailVerified: boolean;
  customAttributesText: string;
};

function toDraft(user: AuthUser): Draft {
  return {
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    phoneNumber: user.phoneNumber ?? '',
    password: '',
    emailVerified: user.emailVerified,
    customAttributesText: user.customAttributes,
  };
}

export function AuthUserDetailScreen({project, uid, onBack, onDeleted}: AuthUserDetailScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {hair, line, ink, inkQuiet, fill, inkOnFill, frame} = useTheme();
  const {t} = useLocale();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [uid]);

  async function load() {
    setLoading(true);
    try {
      await ensureAuthUsersAccess();
      const fetched = await getUser(project.projectId, uid);
      setUser(fetched);
      setDraft(toDraft(fetched));
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('common.loadFailed'), err.message ?? String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function onReload() {
    if (loading || busy) {
      return;
    }
    const dirty =
      user !== null && draft !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(user));
    if (dirty && !(await confirmDiscard(t))) {
      return;
    }
    await load();
  }

  async function onSave() {
    if (!draft || busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
    } catch (e) {
      Alert.alert(t('common.saveBlocked'), String(e));
      return;
    }
    // メールアドレスは、消す手段が無い（Firebase Auth の仕様）。空にする保存は、先に止める。
    // もともとメールアドレスが無いユーザー（電話番号・匿名）は、空のまま保存できる。
    if (user?.email && !draft.email.trim()) {
      Alert.alert(t('common.saveBlocked'), t('auth.userDetail.emailRequired'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft.customAttributesText.trim() || '{}');
    } catch {
      Alert.alert(t('auth.userDetail.invalidClaimsTitle'), t('auth.userDetail.invalidClaimsNotJson'));
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      Alert.alert(t('auth.userDetail.invalidClaimsTitle'), t('auth.userDetail.invalidClaimsNotObject'));
      return;
    }
    setBusy(true);
    try {
      await ensureAuthUsersAccess();
      const updated = await updateUser(project.projectId, uid, {
        email: draft.email.trim(),
        displayName: draft.displayName.trim(),
        phoneNumber: draft.phoneNumber.trim(),
        password: draft.password.trim(),
        emailVerified: draft.emailVerified,
        customAttributesJson: JSON.stringify(parsed),
      });
      setUser(updated);
      setDraft(toDraft(updated));
      Alert.alert(t('common.saved'), updated.email || updated.uid);
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.saveFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleDisabled() {
    if (!user || busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
    } catch (e) {
      Alert.alert(t('common.actionBlocked'), String(e));
      return;
    }
    const willDisable = !user.disabled;
    const message = willDisable
      ? t('auth.userDetail.disableConfirm')
      : t('auth.userDetail.enableConfirm');
    const ok = await confirmWrite(t, message);
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await ensureAuthUsersAccess();
      const updated = await setDisabled(project.projectId, uid, willDisable);
      setUser(updated);
      setDraft(toDraft(updated));
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('auth.userDetail.toggleFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!user || busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
    } catch (e) {
      Alert.alert(t('common.actionBlocked'), String(e));
      return;
    }
    const ok = await confirmWrite(t, t('auth.userDetail.deleteConfirm'));
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await ensureAuthUsersAccess();
      await deleteUser(project.projectId, uid);
      onDeleted();
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.deleteFailed'), err.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <ScreenFrame
      title={user?.email || uid}
      path={`${project.label || project.projectId} / ${t('auth.users.title')} / ${uid}`}
      onBack={onBack}
      onReload={onReload}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {loading && !user ? <Text style={[styles.empty, inkQuiet]}>{t('common.loading')}</Text> : null}
        {user && draft ? (
          <>
            <Text style={[styles.uid, inkQuiet]} numberOfLines={1}>
              {user.uid}
            </Text>
            {project.readOnly ? (
              <Text style={[styles.meta, inkQuiet]}>{t('common.readOnly')}</Text>
            ) : null}

            <Text style={[styles.label, inkQuiet]}>email</Text>
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={draft.email}
              onChangeText={v => setDraft({...draft, email: v})}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!project.readOnly}
            />

            <Text style={[styles.label, inkQuiet]}>displayName</Text>
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={draft.displayName}
              onChangeText={v => setDraft({...draft, displayName: v})}
              editable={!project.readOnly}
            />

            <Text style={[styles.label, inkQuiet]}>phoneNumber</Text>
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={draft.phoneNumber}
              onChangeText={v => setDraft({...draft, phoneNumber: v})}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!project.readOnly}
            />

            <Text style={[styles.label, inkQuiet]}>{t('auth.userDetail.passwordLabel')}</Text>
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={draft.password}
              onChangeText={v => setDraft({...draft, password: v})}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!project.readOnly}
            />

            <View style={styles.switchRow}>
              <Text style={[styles.label, inkQuiet]}>emailVerified</Text>
              <Switch
                value={draft.emailVerified}
                onValueChange={v => setDraft({...draft, emailVerified: v})}
                disabled={project.readOnly}
              />
            </View>

            <Text style={[styles.label, inkQuiet]}>customClaims（JSON）</Text>
            <TextInput
              style={[styles.claims, ink, {borderColor: line}]}
              value={draft.customAttributesText}
              onChangeText={v => setDraft({...draft, customAttributesText: v})}
              multiline
              numberOfLines={6}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!project.readOnly}
            />

            <Pressable
              style={[styles.run, fill, (busy || project.readOnly) ? styles.runDisabled : null]}
              disabled={busy || project.readOnly}
              onPress={onSave}>
              <Text style={[styles.runLabel, inkOnFill]}>{t('common.save')}</Text>
            </Pressable>

            <View style={[styles.dangerZone, hair]}>
              <Pressable
                style={styles.dangerRow}
                disabled={busy || project.readOnly}
                onPress={onToggleDisabled}>
                <Text style={[styles.dangerLabel, project.readOnly ? inkQuiet : ink]}>
                  {user.disabled ? t('auth.userDetail.enable') : t('auth.userDetail.disable')}
                </Text>
              </Pressable>
              <Pressable style={styles.dangerRow} disabled={busy || project.readOnly} onPress={onDelete}>
                <Text style={[styles.dangerLabel, styles.deleteLabel]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
      <Modal visible={busy} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, frame]}>
            <ActivityIndicator size="large" color={ink.color} />
          </View>
        </View>
      </Modal>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  uid: {
    fontSize: 12,
    marginBottom: 16,
  },
  meta: {
    fontSize: 13,
    marginBottom: 16,
  },
  empty: {
    fontSize: 15,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 16,
  },
  claims: {
    fontSize: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    textAlignVertical: 'top',
    minHeight: 120,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  run: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 32,
  },
  runDisabled: {
    opacity: 0.5,
  },
  runLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerZone: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginBottom: 40,
  },
  dangerRow: {
    paddingVertical: 14,
  },
  dangerLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteLabel: {
    color: '#c62828',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
});
