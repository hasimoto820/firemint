import {Alert} from 'react-native';
import type {StringKey} from '../i18n/i18n';

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;

export function confirmWrite(t: TranslateFn, message: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(t('safety.confirmTitle'), message, [
      {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
      {text: t('common.execute'), onPress: () => resolve(true)},
    ]);
  });
}

// 読み直すと、保存していない編集が消える時の確認
export function confirmDiscard(t: TranslateFn): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(t('safety.discardTitle'), t('safety.discardMessage'), [
      {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
      {text: t('common.reload'), onPress: () => resolve(true)},
    ]);
  });
}

export function assertWritable(t: TranslateFn, readOnly: boolean) {
  if (readOnly) {
    throw new Error(t('safety.readOnlyError'));
  }
}
