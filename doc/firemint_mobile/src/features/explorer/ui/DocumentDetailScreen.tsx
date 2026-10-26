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
import {
  assertWritable,
  confirmDiscard,
  confirmWrite,
} from '../../../shared/safety/confirm_write';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import {insertAt} from '../../query/shared/query';
import {SnippetPickScreen} from '../../snippet/ui/SnippetPickScreen';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listCollections,
  saveDocument,
} from '../native/explorer';
import {assertSegment, fullPath, joinPath, lastSegment} from '../shared/paths';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type DocumentDetailScreenProps = {
  project: WorkspaceProject;
  documentPath: string;
  onBack: () => void;
  onDeleted: () => void;
  onOpenSubcollection: (collectionPath: string) => void;
};

type Form = {
  collectionId: string;
  documentId: string;
};

export function DocumentDetailScreen({
  project,
  documentPath,
  onBack,
  onDeleted,
  onOpenSubcollection,
}: DocumentDetailScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {line, hair, ink, inkQuiet, fill, inkOnFill} = useTheme();
  const {t} = useLocale();
  const [json, setJson] = useState('');
  // 読み込んだ時・保存した時の中身。編集中かどうかの判定に使う
  const [loaded, setLoaded] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(true);
  const [pickSnippets, setPickSnippets] = useState(false);
  const [jsonSel, setJsonSel] = useState({start: 0, end: 0});
  // 編集欄の高さの上限＝見えている範囲。長い JSON は欄の中でスクロールさせて、
  // カーソルの行を入力欄自身に見せさせる（キーボードで見える範囲が縮んでも隠れない）
  const [viewHeight, setViewHeight] = useState(0);

  useEffect(() => {
    load();
  }, [project.projectId, documentPath]);

  async function load() {
    setBusy(true);
    try {
      const [body, ids] = await Promise.all([
        getDocument(project.projectId, documentPath),
        listCollections(project.projectId, documentPath),
      ]);
      setJson(body);
      setLoaded(body);
      setSubs(ids);
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.documentDetail.loadFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReload() {
    if (busy) {
      return;
    }
    if (json !== loaded && !(await confirmDiscard(t))) {
      return;
    }
    await load();
  }

  async function onSave() {
    if (busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
      JSON.parse(json);
    } catch (e) {
      Alert.alert(t('common.saveBlocked'), e instanceof Error ? e.message : String(e));
      return;
    }
    const ok = await confirmWrite(
      t,
      t('explorer.documentDetail.overwriteConfirm', {path: documentPath}),
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await saveDocument(project.projectId, documentPath, json);
      setLoaded(json);
      Alert.alert(t('common.saved'));
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.saveFailed'), err.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
      const ok = await confirmWrite(
        t,
        t('explorer.documentDetail.deleteConfirm', {path: documentPath}),
      );
      if (!ok) {
        return;
      }
      setBusy(true);
      await deleteDocument(project.projectId, documentPath);
      onDeleted();
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.deleteFailed'), err.message ?? String(e));
      setBusy(false);
    }
  }

  async function onCreateSub() {
    if (!form || busy) {
      return;
    }
    try {
      assertWritable(t, project.readOnly);
      const collectionId = assertSegment(t, form.collectionId, t('common.collectionId'));
      const documentId = assertSegment(t, form.documentId, t('common.documentId'));
      const collectionPath = joinPath(documentPath, collectionId);
      const dest = joinPath(collectionPath, documentId);
      const ok = await confirmWrite(t, t('explorer.confirmCreate', {path: dest}));
      if (!ok) {
        return;
      }
      setBusy(true);
      await createDocument(project.projectId, collectionPath, documentId, '{}');
      setForm(null);
      await load();
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('common.createFailed'), err.message ?? String(e));
      setBusy(false);
    }
  }

  if (pickSnippets) {
    return (
      <SnippetPickScreen
        textareaFocused
        onBack={() => setPickSnippets(false)}
        onPicked={body => {
          setJson(insertAt(json, jsonSel, body));
          setPickSnippets(false);
        }}
      />
    );
  }

  return (
    <ScreenFrame
      title={lastSegment(documentPath)}
      path={fullPath(project.label || project.projectId, documentPath)}
      onBack={onBack}
      onReload={onReload}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onLayout={e => setViewHeight(e.nativeEvent.layout.height)}>
        {busy ? <Text style={[styles.meta, inkQuiet]}>{t('common.loading')}</Text> : null}
        <TextInput
          style={[
            styles.editor,
            ink,
            {borderBottomColor: line},
            viewHeight > 0
              ? {maxHeight: viewHeight, minHeight: Math.min(EDITOR_MIN_HEIGHT, viewHeight)}
              : null,
          ]}
          value={json}
          onChangeText={setJson}
          onSelectionChange={e => setJsonSel(e.nativeEvent.selection)}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          editable={!project.readOnly && !busy}
        />
        <Pressable
          onPress={() => setPickSnippets(true)}
          style={styles.snippet}
          disabled={busy}>
          <Text style={[styles.link, ink]}>{t('common.snippets')}</Text>
        </Pressable>
        {project.readOnly ? null : (
          <View style={[styles.row, hair]}>
            <Pressable onPress={onSave} disabled={busy} style={styles.saveHalf}>
              <Text style={[styles.saveLabel, ink]}>{t('common.save')}</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              disabled={busy}
              style={styles.saveHalf}>
              <Text style={[styles.saveLabel, styles.deleteLabel]}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, ink]}>{t('explorer.documentDetail.subcollectionsTitle')}</Text>
          {project.readOnly || form ? null : (
            <Pressable
              onPress={() => setForm({collectionId: '', documentId: ''})}
              style={[styles.add, fill]}
              disabled={busy}>
              <Text style={[styles.addLabel, inkOnFill]}>{t('common.add')}</Text>
            </Pressable>
          )}
        </View>
        {project.readOnly ? null : form ? (
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
            <View style={styles.formRow}>
              <Pressable onPress={() => setForm(null)} hitSlop={8}>
                <Text style={[styles.link, inkQuiet]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={onCreateSub} disabled={busy} hitSlop={8}>
                <Text style={[styles.link, ink]}>{t('common.create')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {subs.map(id => (
          <Pressable
            key={id}
            style={[styles.card, hair]}
            onPress={() => onOpenSubcollection(joinPath(documentPath, id))}>
            <Text style={[styles.cardTitle, ink]}>{id}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenFrame>
  );
}

const EDITOR_MIN_HEIGHT = 240;

const baseStyles = StyleSheet.create({
  meta: {
    fontSize: 13,
    marginBottom: 8,
  },
  editor: {
    minHeight: EDITOR_MIN_HEIGHT,
    paddingVertical: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  snippet: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginBottom: 8,
  },
  saveHalf: {
    width: '48%',
    paddingVertical: 4,
  },
  saveLabel: {
    fontSize: 15,
  },
  deleteLabel: {
    color: '#c62828',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  section: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingRight: 12,
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
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  link: {
    fontSize: 15,
  },
  card: {
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 16,
  },
});
