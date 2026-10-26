import {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import {copySnippet, listSnippets} from '../native/snippets';
import type {Snippet, SnippetStore} from '../shared/snippet';
import {snippetLabel} from '../shared/snippet';
import {SnippetPreviewScreen} from './SnippetPreviewScreen';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type SnippetPickScreenProps = {
  textareaFocused: boolean;
  onBack: () => void;
  onPicked: (body: string) => void;
};

export function SnippetPickScreen({
  textareaFocused,
  onBack,
  onPicked,
}: SnippetPickScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {hair, ink} = useTheme();
  const {t} = useLocale();
  const [store, setStore] = useState<SnippetStore>({groups: [], snippets: []});
  const [preview, setPreview] = useState<Snippet | null>(null);

  useEffect(() => {
    listSnippets()
      .then(setStore)
      .catch(e => Alert.alert(t('common.loadFailed'), String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCopy(snippet: Snippet) {
    try {
      const body = await copySnippet(snippet.id);
      if (textareaFocused) {
        onPicked(body);
      }
      setPreview(null);
      onBack();
    } catch (e) {
      Alert.alert(t('common.copyFailed'), String(e));
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
      <ScrollView>
        {root.map(s => (
          <Pressable key={s.id} style={[styles.card, hair]} onPress={() => setPreview(s)}>
            <Text style={[styles.cardTitle, ink]}>{snippetLabel(s)}</Text>
          </Pressable>
        ))}
        {store.groups.map(g => (
          <View key={g.id} style={styles.group}>
            <Text style={[styles.groupTitle, ink]}>{g.name}</Text>
            {store.snippets
              .filter(s => s.groupId === g.id)
              .map(s => (
                <Pressable
                  key={s.id}
                  style={[styles.card, hair]}
                  onPress={() => setPreview(s)}>
                  <Text style={[styles.cardTitle, ink]}>{snippetLabel(s)}</Text>
                </Pressable>
              ))}
          </View>
        ))}
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 15,
  },
  group: {
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
});
