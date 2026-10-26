import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocale} from '../i18n/i18n';
import {useTheme} from '../settings/theme';
import {Latch, LATCH_HEIGHT} from '../ui/Latch';
import {useScaledStyles} from '../settings/text_scale';

type ShellActions = {
  onPlus: () => void;
  onTabs: () => void;
};

const ShellContext = createContext<ShellActions | null>(null);

// ヘッダー右の「＋」「タブ」の動作を、全画面の ScreenFrame へ配る
export function ShellRoot({
  onPlus,
  onTabs,
  children,
}: ShellActions & {children: ReactNode}) {
  return (
    <ShellContext.Provider value={{onPlus, onTabs}}>{children}</ShellContext.Provider>
  );
}

type ScreenFrameProps = {
  // いまのページの対象だけ（パスの末尾、または画面名）
  title: string;
  // フルパス。渡すと、区切り線のつまみで2行目に開ける
  path?: string;
  // 渡すと左に「＜」を出す
  onBack?: () => void;
  // 渡すと右に「↻」を出す（読み直すものがある画面だけ）
  onReload?: () => void;
  children: ReactNode;
};

// 画面の枠。ヘッダー（固定）とメイン（各画面がスクロールさせる）を分けて描く
export function ScreenFrame({title, path, onBack, onReload, children}: ScreenFrameProps) {
  const styles = useScaledStyles(baseStyles, ['mainUnderLatch']);
  const {color1, color2, ink, inkQuiet} = useTheme();
  const {t} = useLocale();
  const shell = useContext(ShellContext);
  const [open, setOpen] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  if (!shell) {
    throw new Error('ShellRoot missing');
  }
  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: color1}]}>
      <View style={[styles.header, {borderBottomColor: color2}]}>
        <View style={styles.row}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
              <Text style={[styles.backMark, ink]}>＜</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.title, ink]} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          {onReload ? (
            <Pressable onPress={onReload} style={styles.btn} hitSlop={8}>
              <Text style={[styles.label, ink]}>↻</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={shell.onPlus} style={styles.btn} hitSlop={8}>
            <Text style={[styles.label, ink]}>＋</Text>
          </Pressable>
          <Pressable onPress={shell.onTabs} style={styles.btn} hitSlop={8}>
            <Text style={[styles.label, ink]}>{t('common.tabs')}</Text>
          </Pressable>
        </View>
        {path && open ? (
          <Text style={[styles.path, inkQuiet]} selectable>
            {path}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.main,
          path ? styles.mainUnderLatch : null,
          {paddingBottom: keyboardHeight},
        ]}>
        {children}
        {path ? (
          <Latch side="left" label={open ? '▲' : '▼'} onPress={() => setOpen(v => !v)} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// キーボードが覆っている高さ（ナビゲーションバーの分は除く。そこは SafeAreaView が空ける）。
// edge-to-edge では adjustResize で画面が縮まないので、この分だけメインの下を空けて、
// 各画面の ScrollView を縮める。縮むと、入力中の欄が見える位置まで ScrollView が動く
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setHeight(Math.max(0, e.endCoordinates.height)),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

const baseStyles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  back: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backMark: {
    fontSize: 15,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    paddingVertical: 6,
  },
  btn: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 15,
  },
  path: {
    fontSize: 13,
    paddingBottom: 8,
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  mainUnderLatch: {
    paddingTop: LATCH_HEIGHT + 8,
  },
});
