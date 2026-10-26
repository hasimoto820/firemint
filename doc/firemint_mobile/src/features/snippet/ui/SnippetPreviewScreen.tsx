import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import type {Snippet} from '../shared/snippet';
import {snippetLabel} from '../shared/snippet';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type SnippetPreviewScreenProps = {
  snippet: Snippet;
  onBack: () => void;
  onCopy: () => void;
};

export function SnippetPreviewScreen({
  snippet,
  onBack,
  onCopy,
}: SnippetPreviewScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {hair, ink, inkQuiet} = useTheme();
  const {t} = useLocale();
  return (
    <ScreenFrame title={snippetLabel(snippet)} onBack={onBack}>
      <ScrollView>
        <Text style={[styles.body, inkQuiet]}>{snippet.body}</Text>
        <Pressable onPress={onCopy} style={[styles.copy, hair]}>
          <Text style={[styles.copyText, ink]}>{t('common.copy')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  body: {
    fontSize: 14,
    marginBottom: 24,
  },
  copy: {
    paddingVertical: 14,
    marginBottom: 24,
  },
  copyText: {
    fontSize: 15,
  },
});
