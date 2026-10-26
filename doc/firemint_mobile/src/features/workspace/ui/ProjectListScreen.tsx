import {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import {ensureCloudAccess, onSessionChange} from '../../connection/native/google_auth';
import {FirestoreAccountPanel} from '../../connection/ui/components/FirestoreAccountPanel';
import {
  addProject,
  listProjects,
  removeProject,
  updateProject,
} from '../native/workspace';
import type {WorkspaceProject} from '../shared/project';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type ProjectListScreenProps = {
  onBack: () => void;
  onOpenProject: (project: WorkspaceProject) => void;
};

type Form = {
  projectId: string;
  label: string;
  readOnly: boolean;
  editingId: string | null;
};

const emptyForm: Form = {
  projectId: '',
  label: '',
  readOnly: false,
  editingId: null,
};

export function ProjectListScreen({
  onBack,
  onOpenProject,
}: ProjectListScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {hair, ink, inkQuiet, fill, inkOnFill, frame, dangerBg} = useTheme();
  const {t} = useLocale();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const formOpen = form !== null;

  // 入力欄は一覧の下に出るので、開いた時に下まで送る
  useEffect(() => {
    if (formOpen) {
      scrollRef.current?.scrollToEnd({animated: true});
    }
  }, [formOpen]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(e => Alert.alert(t('workspace.projectList.loadFailed'), String(e)));
    // 名簿は、いまの firestoreアカウントの分だけが並ぶ（WorkspaceDb.kt）。
    // アカウントが変わったら（この画面での切り替えのほか、別のタブでの切り替え・サインアウト）、
    // そのアカウントの名簿に並べ直す
    return onSessionChange(() => {
      setForm(null);
      listProjects()
        .then(setProjects)
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setProjects(await listProjects());
  }

  async function openProject(project: WorkspaceProject) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await ensureCloudAccess();
      onOpenProject(project);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('workspace.projectList.openFailed'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!form || busy) {
      return;
    }
    const id = form.projectId.trim();
    if (!id) {
      Alert.alert(t('workspace.projectList.idRequired'));
      return;
    }
    setBusy(true);
    try {
      if (form.editingId) {
        await updateProject(form.editingId, id, form.label, form.readOnly);
      } else {
        await addProject(id, form.label, form.readOnly);
      }
      await reload();
      setForm(null);
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.saveFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function onDelete(project: WorkspaceProject) {
    Alert.alert(t('common.deleteConfirmTitle'), project.projectId, [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          removeProject(project.projectId)
            .then(reload)
            .catch(e => Alert.alert(t('common.deleteFailed'), String(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <ScreenFrame title={t('workspace.projectList.title')} onBack={onBack}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
        {/* いまの firestoreアカウント。下の一覧は、このアカウントの分だけ */}
        <FirestoreAccountPanel busy={busy} onBusy={setBusy} onSignedOut={onBack} />
        {projects.length === 0 && !form ? (
          <Text style={[styles.empty, inkQuiet]}>{t('workspace.projectList.empty')}</Text>
        ) : null}

        {projects.map(project => (
          <View key={project.projectId} style={[styles.card, hair]}>
            <Pressable onPress={() => openProject(project)} style={styles.cardMain}>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, ink]} numberOfLines={1}>
                  {project.label || project.projectId}
                </Text>
                {project.label ? (
                  <Text style={[styles.cardId, inkQuiet]} numberOfLines={1}>
                    {project.projectId}
                  </Text>
                ) : null}
                {project.readOnly ? (
                  <Text style={[styles.badge, frame, inkQuiet]}>{t('common.readOnly')}</Text>
                ) : null}
              </View>
              <Text style={[styles.chevron, inkQuiet]}>＞</Text>
            </Pressable>
            <View style={styles.cardActions}>
              <Pressable
                onPress={() =>
                  setForm({
                    projectId: project.projectId,
                    label: project.label,
                    readOnly: project.readOnly,
                    editingId: project.projectId,
                  })
                }
                style={[styles.chip, frame]}>
                <Text style={[styles.chipLabel, ink]}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(project)} style={[styles.chip, dangerBg]}>
                <Text style={[styles.chipLabel, ink]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {form ? (
          <View style={[styles.panel, styles.formPanel, frame]}>
            <Text style={[styles.panelTitle, ink]}>
              {t(
                form.editingId
                  ? 'workspace.projectList.editTitle'
                  : 'workspace.projectList.addTitle',
              )}
            </Text>
            <Text style={[styles.caption, inkQuiet]}>
              {t('workspace.projectList.projectIdPlaceholder')}
            </Text>
            <TextInput
              style={[styles.input, frame, ink]}
              value={form.projectId}
              onChangeText={projectId => setForm({...form, projectId})}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.caption, inkQuiet]}>
              {t('workspace.projectList.labelPlaceholder')}
            </Text>
            <TextInput
              style={[styles.input, frame, ink]}
              value={form.label}
              onChangeText={label => setForm({...form, label})}
            />
            <View style={styles.segment}>
              {[false, true].map(readOnly => {
                const on = form.readOnly === readOnly;
                return (
                  <Pressable
                    key={String(readOnly)}
                    onPress={() => setForm({...form, readOnly})}
                    style={[styles.segmentItem, frame, on ? fill : null]}>
                    <Text style={[styles.chipLabel, on ? inkOnFill : inkQuiet]}>
                      {t(readOnly ? 'common.readOnly' : 'common.readWrite')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.formActions}>
              <Pressable onPress={() => setForm(null)} style={[styles.button, frame]}>
                <Text style={[styles.buttonLabel, ink]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={busy}
                style={[styles.button, fill, busy ? styles.dim : null]}>
                <Text style={[styles.buttonLabel, inkOnFill]}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setForm(emptyForm)}
            disabled={busy}
            style={[styles.addButton, fill, busy ? styles.dim : null]}>
            <Text style={[styles.buttonLabel, inkOnFill]}>
              {t('workspace.projectList.addButton')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  panel: {
    padding: 14,
    marginBottom: 16,
  },
  formPanel: {
    marginTop: 32,
    marginBottom: 32,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  caption: {
    fontSize: 12,
    marginBottom: 4,
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
  input: {
    fontSize: 15,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 32,
    marginBottom: 32,
  },
  empty: {
    fontSize: 15,
    marginBottom: 4,
  },
  card: {
    paddingVertical: 14,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardId: {
    fontSize: 13,
    marginBottom: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 4,
  },
  chevron: {
    fontSize: 16,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
});
