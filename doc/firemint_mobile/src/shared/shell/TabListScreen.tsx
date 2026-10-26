import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useLocale} from '../i18n/i18n';
import {useTheme} from '../settings/theme';
import {ScreenFrame} from './chrome';
import {pageLabel, type Page} from './tabs';
import {useScaledStyles} from '../settings/text_scale';

type TabListScreenProps = {
  pages: Page[];
  activeId: string;
  onBack: () => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TabListScreen({
  pages,
  activeId,
  onBack,
  onActivate,
  onDelete,
}: TabListScreenProps) {
  const styles = useScaledStyles(baseStyles);
  const {color2, ink, inkQuiet, hair} = useTheme();
  const {t} = useLocale();
  return (
    <ScreenFrame title={t('shell.tabsTitle')} onBack={onBack}>
      <ScrollView>
        {pages.map(page => {
          const on = page.id === activeId;
          return (
            <View key={page.id} style={[styles.card, hair]}>
              <Pressable onPress={() => onActivate(page.id)} style={styles.labelRow}>
                <Text style={[styles.mark, {color: on ? color2 : ink.color}]}>
                  {on ? '●' : ' '}
                </Text>
                <Text
                  style={[styles.cardTitle, ink]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {pageLabel(page, t)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onDelete(page.id)}
                style={styles.trash}
                hitSlop={TRASH_SLOP}>
                <Text style={[styles.link, inkQuiet]}>🗑</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </ScreenFrame>
  );
}

// 削除は右へだけ広げる。左へ広げると、選択の範囲に重なって誤って消す
const TRASH_SLOP = {right: 8};

// 上下の余白は、行ではなく押せる部品の側に持たせる（行の高さ全体が反応する）
const baseStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 12,
  },
  trash: {
    paddingVertical: 14,
    paddingLeft: 8,
  },
  mark: {
    width: 22,
    fontSize: 15,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
  },
  link: {
    fontSize: 15,
  },
});
