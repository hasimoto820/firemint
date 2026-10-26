import {NativeModules} from 'react-native';

type DateTimePickerNative = {
  pick: (initial: string) => Promise<string | null>;
};

// カレンダー → 時計の順に開いて、日時を選ぶ。返すのは「2026-01-01 12:00」の形。
// 選んだ数字をそのまま返す（時間帯の調整はしない。検索では、世界標準時（UTC）として使う）。
// initial: 最初に開く日時（いま「値」に入っているもの）。キャンセルした時は null
export function pickDateTime(initial: string): Promise<string | null> {
  const mod = NativeModules.DateTimePicker as DateTimePickerNative | undefined;
  if (!mod) {
    throw new Error('DateTimePicker missing');
  }
  return mod.pick(initial);
}
