import {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ensureAuthUsersAccess,
  ensureServiceManagementAccess,
} from '../../connection/native/google_auth';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {
  enableIdentityToolkit,
  listUsers,
  onAuthUserChange,
  pickExportLocation,
  writeExport,
} from '../native/auth_users';
import type {AuthUser} from '../shared/auth_users';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type AuthUsersListScreenProps = {
  project: WorkspaceProject;
  onBack: () => void;
  onOpenUser: (uid: string) => void;
};

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[.,)]+$/, '') : null;
}

function matches(user: AuthUser, needle: string): boolean {
  const hay = [user.uid, user.email, user.displayName, user.phoneNumber]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

// 日時（ISO 8601 の UTC）を、端末のタイムゾーンの "2026-09-10 12:12" の形にする。
// 一覧の表示用。書き出しには使わない（書き出しは UTC のまま）。
function formatLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function usersToCsv(users: AuthUser[]): string {
  const header = [
    'uid',
    'email',
    'displayName',
    'phoneNumber',
    'disabled',
    'emailVerified',
    'customAttributes',
    'createdAt',
    'lastLoginAt',
    'providerIds',
  ];
  const rows = users.map(u =>
    [
      u.uid,
      u.email ?? '',
      u.displayName ?? '',
      u.phoneNumber ?? '',
      String(u.disabled),
      String(u.emailVerified),
      u.customAttributes,
      u.createdAt ?? '',
      u.lastLoginAt ?? '',
      u.providerIds.join('|'),
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

export function AuthUsersListScreen({project, onBack, onOpenUser}: AuthUsersListScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {hair, ink, inkQuiet, frame} = useTheme();
  const {t} = useLocale();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [nextPageToken, setNextPageToken] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiDisabledMessage, setApiDisabledMessage] = useState<string | null>(null);

  useEffect(() => {
    loadFirstPage();
  }, [project.projectId]);

  // 詳細で保存・無効化/有効化・削除をしたら、読み込み済みの一覧の、その行だけを合わせる
  // （読み直さない。スクロール位置と、「続きを読む」で読んだ分を残す）
  useEffect(() => {
    return onAuthUserChange(change => {
      if (change.projectId !== project.projectId) {
        return;
      }
      const changed = change.user;
      setUsers(current =>
        changed
          ? current.map(u => (u.uid === change.uid ? changed : u))
          : current.filter(u => u.uid !== change.uid),
      );
    });
  }, [project.projectId]);

  async function loadFirstPage() {
    setLoading(true);
    setApiDisabledMessage(null);
    try {
      await ensureAuthUsersAccess();
      const result = await listUsers(project.projectId, '');
      setUsers(result.users);
      setNextPageToken(result.nextPageToken);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code === 'API_DISABLED') {
        setApiDisabledMessage(err.message ?? '');
      } else if (err.code !== 'CANCELLED') {
        Alert.alert(t('auth.users.listLoadFailed'), err.message ?? String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function onEnableApi() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await ensureServiceManagementAccess();
      await enableIdentityToolkit(project.projectId);
      Alert.alert(t('auth.users.enabledTitle'), t('auth.users.enabledMessage'));
      await loadFirstPage();
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('auth.users.enableFailed'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!nextPageToken || loading) {
      return;
    }
    setLoading(true);
    try {
      // 一覧を開いてから時間がたつと、トークンの期限が切れている。切れていれば、取り直す
      await ensureAuthUsersAccess();
      const result = await listUsers(project.projectId, nextPageToken);
      setUsers(current => [...current, ...result.users]);
      setNextPageToken(result.nextPageToken);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('auth.users.loadMoreFailed'), err.message ?? String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function onExport(format: 'json' | 'csv') {
    if (busy || users.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const suggestedName = `${project.projectId}-auth-users.${format}`;
      const dest = await pickExportLocation(suggestedName);
      const content = format === 'json' ? `${JSON.stringify(users, null, 2)}\n` : usersToCsv(users);
      await writeExport(dest.uri, content);
      Alert.alert(t('auth.users.exportDoneTitle'), dest.path);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('auth.users.exportFailed'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? users.filter(u => matches(u, needle)) : users;
  }, [users, search]);

  return (
    <ScreenFrame
      title={t('auth.users.title')}
      path={`${project.label || project.projectId} / ${t('auth.users.title')}`}
      onBack={onBack}
      onReload={() => {
        if (!loading && !busy) {
          loadFirstPage();
        }
      }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          {apiDisabledMessage !== null ? null : (
            <>
              <Pressable onPress={() => onExport('json')} disabled={busy || users.length === 0} hitSlop={8}>
                <Text style={[styles.link, ink]}>JSON</Text>
              </Pressable>
              <Pressable onPress={() => onExport('csv')} disabled={busy || users.length === 0} hitSlop={8}>
                <Text style={[styles.link, ink]}>CSV</Text>
              </Pressable>
            </>
          )}
        </View>
        {apiDisabledMessage !== null ? (
          <View>
            <Text style={[styles.empty, ink]}>{t('auth.users.apiDisabledMessage')}</Text>
            <Pressable onPress={onEnableApi} disabled={busy} hitSlop={8} style={styles.enableButton}>
              <Text style={[styles.link, styles.enableLink]}>
                {busy ? t('auth.users.enabling') : t('auth.users.enableButton')}
              </Text>
            </Pressable>
            {extractUrl(apiDisabledMessage) ? (
              <Pressable onPress={() => Linking.openURL(extractUrl(apiDisabledMessage)!)} hitSlop={8}>
                <Text style={[styles.link, ink]}>{t('auth.users.openEnablePageLink')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <TextInput
              style={[styles.search, ink, {borderBottomColor: hair.borderBottomColor}]}
              value={search}
              onChangeText={setSearch}
              placeholder={t('auth.users.searchPlaceholder')}
              placeholderTextColor={inkQuiet.color}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.meta, inkQuiet]}>
              {t('auth.users.countMeta', {shown: filtered.length, loaded: users.length})}
            </Text>
            {loading && users.length === 0 ? (
              <Text style={[styles.empty, inkQuiet]}>{t('common.loading')}</Text>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <Text style={[styles.empty, inkQuiet]}>{t('auth.users.empty')}</Text>
            ) : null}
            {filtered.map(user => (
              <Pressable key={user.uid} style={[styles.row, hair]} onPress={() => onOpenUser(user.uid)}>
                <Text style={[styles.rowTitle, ink]} numberOfLines={1}>
                  {user.email || user.uid}
                </Text>
                <Text style={[styles.rowMeta, inkQuiet]} numberOfLines={1}>
                  {user.disabled ? t('auth.users.statusDisabled') : t('auth.users.statusActive')}
                  {user.lastLoginAt
                    ? t('auth.users.lastLoginSuffix', {date: formatLocal(user.lastLoginAt)})
                    : ''}
                </Text>
              </Pressable>
            ))}
            {nextPageToken && !loading ? (
              <Pressable onPress={loadMore} hitSlop={8} style={styles.more}>
                <Text style={[styles.link, ink]}>{t('auth.users.loadMore')}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
      <Modal visible={loading && users.length > 0} transparent animationType="fade">
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 12,
  },
  link: {
    fontSize: 15,
  },
  enableButton: {
    marginBottom: 16,
  },
  enableLink: {
    color: '#378ADD',
    fontWeight: '600',
  },
  search: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    marginBottom: 12,
  },
  empty: {
    fontSize: 15,
    marginBottom: 24,
  },
  row: {
    paddingVertical: 14,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  more: {
    paddingVertical: 20,
    alignItems: 'center',
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
