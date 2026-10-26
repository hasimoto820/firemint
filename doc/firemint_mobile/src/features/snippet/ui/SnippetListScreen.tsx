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
  addGroup,
  addSnippet,
  copySnippet,
  listSnippets,
  removeGroup,
  removeSnippet,
  updateGroup,
  updateSnippet,
} from '../native/snippets';
import type {Snippet, SnippetGroup, SnippetStore} from '../shared/snippet';
import {snippetLabel} from '../shared/snippet';
import {SnippetPreviewScreen} from './SnippetPreviewScreen';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type SnippetListScreenProps = {
  onBack: () => void;
};

type Form =
  | {kind: 'group'; id: number | null; name: string}
  | {kind: 'snippet'; id: number | null; groupId: number | null; name: string; body: string};

export function SnippetListScreen({onBack}: SnippetListScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {line, frame, ink, inkQuiet, fill, inkOnFill} = useTheme();
  const {t} = useLocale();
  const [store, setStore] = useState<SnippetStore>({groups: [], snippets: []});
  const [form, setForm] = useState<Form | null>(null);
  const [preview, setPreview] = useState<Snippet | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    reload().catch(e => Alert.alert(t('common.loadFailed'), String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setStore(await listSnippets());
  }

  async function onCopy(snippet: Snippet) {
    try {
      await copySnippet(snippet.id);
      setPreview(null);
    } catch (e) {
      Alert.alert(t('common.copyFailed'), String(e));
    }
  }

  async function onSave() {
    if (!form || busy) {
      return;
    }
    setBusy(true);
    try {
      if (form.kind === 'group') {
        if (form.id == null) {
          await addGroup(form.name);
        } else {
          await updateGroup(form.id, form.name);
        }
      } else if (form.id == null) {
        await addSnippet(form.groupId, form.name, form.body);
      } else {
        await updateSnippet(form.id, form.groupId, form.name, form.body);
      }
      await reload();
      setForm(null);
    } catch (e) {
      Alert.alert(t('common.saveFailed'), String(e));
    } finally {
      setBusy(false);
    }
  }

  if (preview) {
    return (
      <SnippetPreviewScreen
        snippet={preview}
        onBack={() => setPreview(null)}
        onCopy={() => onCopy(preview)}
      />
    );
  }

  const root = store.snippets.filter(s => s.groupId == null);

  return (
    <ScreenFrame title={t('common.snippets')} onBack={onBack}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          {form ? null : (
            <View style={styles.addRow}>
              <Pressable
                style={[styles.add, fill]}
                onPress={() =>
                  setForm({kind: 'snippet', id: null, groupId: null, name: '', body: ''})
                }>
                <Text style={[styles.addLabel, inkOnFill]}>{t('snippet.list.addSnippet')}</Text>
              </Pressable>
              <Pressable
                style={[styles.add, fill]}
                onPress={() => setForm({kind: 'group', id: null, name: ''})}>
                <Text style={[styles.addLabel, inkOnFill]}>{t('snippet.list.addGroup')}</Text>
              </Pressable>
            </View>
          )}
        </View>
        {form ? (
          <View style={[styles.form, frame]}>
            {form.kind === 'group' ? (
              <TextInput
                style={[styles.input, ink, {borderBottomColor: line}]}
                value={form.name}
                onChangeText={name => setForm({...form, name})}
                placeholder={t('snippet.list.groupNamePlaceholder')}
                placeholderTextColor={inkQuiet.color}
              />
            ) : (
              <>
                <TextInput
                  style={[styles.input, ink, {borderBottomColor: line}]}
                  value={form.name}
                  onChangeText={name => setForm({...form, name})}
                  placeholder={t('snippet.list.aliasPlaceholder')}
                  placeholderTextColor={inkQuiet.color}
                />
                <TextInput
                  style={[styles.js, ink, {borderBottomColor: line}]}
                  value={form.body}
                  onChangeText={body => setForm({...form, body})}
                  placeholder={t('snippet.list.bodyPlaceholder')}
                  placeholderTextColor={inkQuiet.color}
                  multiline
                  autoCapitalize="none"
                />
              </>
            )}
            <View style={styles.row}>
              <Pressable onPress={() => setForm(null)}>
                <Text style={[styles.link, inkQuiet]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={onSave} disabled={busy}>
                <Text style={[styles.link, ink]}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {root.map((s, i) => (
          <SnippetRow
            key={s.id}
            snippet={s}
            last={i === root.length - 1 && store.groups.length > 0}
            onOpen={() => setPreview(s)}
            onEdit={() =>
              setForm({
                kind: 'snippet',
                id: s.id,
                groupId: s.groupId,
                name: s.name,
                body: s.body,
              })
            }
            onDelete={() => {
              Alert.alert(t('common.deleteConfirmTitle'), snippetLabel(s), [
                {text: t('common.cancel'), style: 'cancel'},
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () =>
                    removeSnippet(s.id)
                      .then(reload)
                      .catch(e => Alert.alert(t('common.deleteFailed'), String(e))),
                },
              ]);
            }}
          />
        ))}
        {store.groups.map(g => (
          <GroupBlock
            key={g.id}
            group={g}
            snippets={store.snippets.filter(s => s.groupId === g.id)}
            onOpen={setPreview}
            onEditGroup={() => setForm({kind: 'group', id: g.id, name: g.name})}
            onDeleteGroup={() => {
              Alert.alert(t('snippet.list.groupDeleteConfirmTitle'), g.name, [
                {text: t('common.cancel'), style: 'cancel'},
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () =>
                    removeGroup(g.id)
                      .then(reload)
                      .catch(e => Alert.alert(t('common.deleteFailed'), String(e))),
                },
              ]);
            }}
            onAddInGroup={() =>
              setForm({kind: 'snippet', id: null, groupId: g.id, name: '', body: ''})
            }
            onEditSnippet={s =>
              setForm({
                kind: 'snippet',
                id: s.id,
                groupId: s.groupId,
                name: s.name,
                body: s.body,
              })
            }
            onDeleteSnippet={s => {
              Alert.alert(t('common.deleteConfirmTitle'), snippetLabel(s), [
                {text: t('common.cancel'), style: 'cancel'},
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () =>
                    removeSnippet(s.id)
                      .then(reload)
                      .catch(e => Alert.alert(t('common.deleteFailed'), String(e))),
                },
              ]);
            }}
          />
        ))}
      </ScrollView>
    </ScreenFrame>
  );
}

function SnippetRow({
  snippet,
  last,
  onOpen,
  onEdit,
  onDelete,
}: {
  snippet: Snippet;
  last?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const {hair, ink, inkQuiet} = useTheme();
  const {t} = useLocale();
  return (
    <View style={[styles.card, last ? null : hair]}>
      <Pressable onPress={onOpen}>
        <Text style={[styles.cardTitle, ink]}>{snippetLabel(snippet)}</Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable onPress={onEdit}>
          <Text style={[styles.link, inkQuiet]}>{t('common.edit')}</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={[styles.link, inkQuiet]}>{t('common.delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GroupBlock({
  group,
  snippets,
  onOpen,
  onEditGroup,
  onDeleteGroup,
  onAddInGroup,
  onEditSnippet,
  onDeleteSnippet,
}: {
  group: SnippetGroup;
  snippets: Snippet[];
  onOpen: (s: Snippet) => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onAddInGroup: () => void;
  onEditSnippet: (s: Snippet) => void;
  onDeleteSnippet: (s: Snippet) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const {ink, inkQuiet, frameLine} = useTheme();
  const {t} = useLocale();
  return (
    <View style={[styles.group, {borderTopColor: frameLine}]}>
      <Text style={[styles.sectionLabel, inkQuiet]}>{t('snippet.list.groupLabel')}</Text>
      <View style={styles.groupHead}>
        <Text style={[styles.groupTitle, ink]}>{group.name}</Text>
        <Pressable onPress={onAddInGroup} hitSlop={8}>
          <Text style={[styles.groupLink, inkQuiet]}>{t('snippet.list.addInGroup')}</Text>
        </Pressable>
        <Pressable onPress={onEditGroup} hitSlop={8}>
          <Text style={[styles.groupLink, inkQuiet]}>{t('common.edit')}</Text>
        </Pressable>
        <Pressable onPress={onDeleteGroup} hitSlop={8}>
          <Text style={[styles.groupLink, inkQuiet]}>{t('common.delete')}</Text>
        </Pressable>
      </View>
      <View style={styles.nested}>
        {snippets.map((s, i) => (
          <SnippetRow
            key={s.id}
            snippet={s}
            last={i === snippets.length - 1}
            onOpen={() => onOpen(s)}
            onEdit={() => onEditSnippet(s)}
            onDelete={() => onDeleteSnippet(s)}
          />
        ))}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  link: {
    fontSize: 15,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addRow: {
    flexDirection: 'row',
  },
  add: {
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  input: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 12,
  },
  js: {
    minHeight: 120,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: {
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 15,
    marginBottom: 8,
  },
  group: {
    marginTop: 8,
    paddingTop: 16,
    marginBottom: 8,
    borderTopWidth: 2,
  },
  sectionLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  groupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingRight: 12,
  },
  groupLink: {
    fontSize: 15,
    marginLeft: 16,
  },
  nested: {
    paddingLeft: 20,
  },
});
