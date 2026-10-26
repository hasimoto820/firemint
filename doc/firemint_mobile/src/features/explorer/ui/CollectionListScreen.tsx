import {useEffect, useState} from 'react';
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
import {
  assertWritable,
  confirmWrite,
} from '../../../shared/safety/confirm_write';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {createDocument, listCollections} from '../native/explorer';
import {assertSegment} from '../shared/paths';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type CollectionListScreenProps = {
  project: WorkspaceProject;
  onBack: () => void;
  onOpenCollection: (collectionPath: string) => void;
  onOpenAuthUsers: () => void;
};

type Form = {
  collectionId: string;
  documentId: string;
};

export function CollectionListScreen({
  project,
  onBack,
  onOpenCollection,
  onOpenAuthUsers,
}: CollectionListScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {line, hair, ink, inkQuiet, fill, inkOnFill} = useTheme();
  const {t} = useLocale();
  const [ids, setIds] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    load();
  }, [project.projectId]);

  async function load() {
    setBusy(true);
    try {
      setIds(await listCollections(project.projectId, ''));
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.collectionList.loadFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!form || busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
      const collectionId = assertSegment(t, form.collectionId, t('common.collectionId'));
      const documentId = assertSegment(t, form.documentId, t('common.documentId'));
      const ok = await confirmWrite(
        t,
        t('explorer.confirmCreate', {path: `${collectionId}/${documentId}`}),
      );
      if (!ok) {
        return;
      }
      setBusy(true);
      await createDocument(project.projectId, collectionId, documentId, '{}');
      setForm(null);
      await load();
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.createFailed'), err.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <ScreenFrame
      title={project.label || project.projectId}
      path={project.label && project.label !== project.projectId ? project.projectId : undefined}
      onBack={onBack}
      onReload={() => {
        if (!busy) {
          load();
        }
      }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          {project.readOnly || form ? null : (
            <Pressable
              onPress={() => setForm({collectionId: '', documentId: ''})}
              style={[styles.add, fill]}
              disabled={busy}>
              <Text style={[styles.addLabel, inkOnFill]}>{t('common.add')}</Text>
            </Pressable>
          )}
        </View>
        {project.readOnly ? (
          <Text style={[styles.meta, inkQuiet]}>{t('common.readOnly')}</Text>
        ) : form ? (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={form.collectionId}
              onChangeText={collectionId => setForm({...form, collectionId})}
              placeholder={t('common.collectionId')}
              placeholderTextColor={inkQuiet.color}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.input, ink, {borderBottomColor: line}]}
              value={form.documentId}
              onChangeText={documentId => setForm({...form, documentId})}
              placeholder={t('explorer.collectionList.firstDocumentIdPlaceholder')}
              placeholderTextColor={inkQuiet.color}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.row}>
              <Pressable onPress={() => setForm(null)} hitSlop={8}>
                <Text style={[styles.link, inkQuiet]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={onCreate} disabled={busy} hitSlop={8}>
                <Text style={[styles.link, ink]}>{t('common.create')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {busy ? <Text style={[styles.empty, inkQuiet]}>{t('common.loading')}</Text> : null}
        {!busy && ids.length === 0 ? (
          <Text style={[styles.empty, inkQuiet]}>{t('explorer.collectionList.empty')}</Text>
        ) : null}
        {ids.map(id => (
          <Pressable
            key={id}
            style={[styles.card, hair]}
            onPress={() => onOpenCollection(id)}>
            <Text style={[styles.cardTitle, ink]}>{id}</Text>
          </Pressable>
        ))}
        <View style={styles.authDivider} />
        <View style={[styles.dividerLine, {backgroundColor: line}]} />
        <Pressable style={[styles.card, hair]} onPress={onOpenAuthUsers}>
          <Text style={[styles.cardTitle, ink]}>{t('explorer.authEntry')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  meta: {
    fontSize: 13,
    marginBottom: 16,
  },
  empty: {
    fontSize: 15,
    marginBottom: 24,
  },
  add: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  form: {
    marginBottom: 8,
    paddingVertical: 8,
  },
  input: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  link: {
    fontSize: 15,
  },
  card: {
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  authDivider: {
    height: 32,
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
});
