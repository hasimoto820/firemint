import {ActivityIndicator, Modal, StyleSheet, View} from 'react-native';
import {useTheme} from '../settings/theme';

/**
 * 操作中の幕。処理が終わるまで覆って、他の操作をかぶせさせない。
 * 既定は Modal で、ヘッダーのタブ操作（ScreenFrame）や端末の戻るボタンも止める
 * （戻るボタンは、onRequestClose で何もしないことで止める）。
 * inline の時は、置いた場所（画面のメイン）だけを覆う。ヘッダーは使える。
 * 裏のタブにある画面でも、前に出ている画面を覆わない。
 */
export function BusyOverlay({visible, inline = false}: {visible: boolean; inline?: boolean}) {
  const {frame, ink} = useTheme();
  const body = (
    <View style={[styles.backdrop, inline ? StyleSheet.absoluteFill : null]}>
      <View style={[styles.card, frame]}>
        <ActivityIndicator size="large" color={ink.color} />
      </View>
    </View>
  );
  if (inline) {
    return visible ? body : null;
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
});
