import {Pressable, StyleSheet, Text} from 'react-native';
import {useTheme} from '../settings/theme';
import {useScaledStyles} from '../settings/text_scale';

export const LATCH_HEIGHT = 22;

type LatchProps = {
  side: 'left' | 'right';
  label: string;
  onPress: () => void;
};

// 区切り線からぶら下げる開閉のつまみ。親の上辺（線の位置）に密着させる
export function Latch({side, label, onPress}: LatchProps) {
  const styles = useScaledStyles(baseStyles, ['latch']);
  const {color2, inkOnFill} = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.latch,
        side === 'left' ? styles.left : styles.right,
        {backgroundColor: color2},
      ]}
      hitSlop={8}>
      <Text style={[styles.label, inkOnFill]}>{label}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  latch: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
    minWidth: 36,
    height: LATCH_HEIGHT,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {
    left: 16,
  },
  right: {
    right: 16,
  },
  label: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
  },
});
