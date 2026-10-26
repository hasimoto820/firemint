import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {getTextScale, setTextScale} from './native';

// 文字の倍率。設定画面の 4 段階から選ぶ
export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.5;
export const DEFAULT_TEXT_SCALE = 1;

export type TextScaleStep = 'small' | 'normal' | 'large' | 'xlarge';

export const TEXT_SCALE_OPTIONS: {id: TextScaleStep; scale: number}[] = [
  {id: 'small', scale: 0.85},
  {id: 'normal', scale: 1},
  {id: 'large', scale: 1.15},
  {id: 'xlarge', scale: 1.3},
];

export function clampTextScale(scale: number): number {
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, scale));
}

function parseTextScale(raw: string): number {
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) ? clampTextScale(n) : DEFAULT_TEXT_SCALE;
}

// いまの倍率に一番近い段階（設定画面で、選ばれている段階を示すため）
export function nearestTextScaleStep(scale: number): TextScaleStep {
  let best = TEXT_SCALE_OPTIONS[0];
  for (const opt of TEXT_SCALE_OPTIONS) {
    if (Math.abs(opt.scale - scale) < Math.abs(best.scale - scale)) {
      best = opt;
    }
  }
  return best.id;
}

type TextScaleValue = {
  scale: number;
  setScale: (next: number) => Promise<void>;
};

const TextScaleContext = createContext<TextScaleValue | null>(null);

export function TextScaleRoot({children}: {children: ReactNode}) {
  const [scale, setScaleState] = useState(DEFAULT_TEXT_SCALE);

  useEffect(() => {
    getTextScale().then(raw => setScaleState(parseTextScale(raw)));
  }, []);

  const setScale = useCallback(async (next: number) => {
    const clamped = clampTextScale(next);
    setScaleState(clamped);
    await setTextScale(String(clamped));
  }, []);

  const value = useMemo(() => ({scale, setScale}), [scale, setScale]);

  return (
    <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>
  );
}

export function useTextScale(): TextScaleValue {
  const value = useContext(TextScaleContext);
  if (!value) {
    throw new Error('TextScaleRoot missing');
  }
  return value;
}

type StyleRecord = Record<string, object>;

const TEXT_PROPS = ['fontSize', 'lineHeight'];

// 文字を固定の大きさの中に置くスタイル（sizedKeys に名前を渡したもの）で、文字と一緒に広げる値
const SIZE_PROPS = ['width', 'height', 'minWidth', 'minHeight', 'paddingTop'];

// StyleSheet.create の結果の fontSize / lineHeight に、いまの倍率を掛けた写しを返す。
// sizedKeys のスタイルは、幅・高さにも掛ける
export function useScaledStyles<T extends StyleRecord>(
  styles: T,
  sizedKeys: (keyof T)[] = [],
): T {
  const {scale} = useTextScale();
  return useMemo(() => {
    if (scale === 1) {
      return styles;
    }
    const scaled: StyleRecord = {};
    for (const key of Object.keys(styles)) {
      const style = styles[key] as Record<string, unknown>;
      const props = sizedKeys.includes(key) ? [...TEXT_PROPS, ...SIZE_PROPS] : TEXT_PROPS;
      let next: Record<string, unknown> | null = null;
      for (const prop of props) {
        const v = style[prop];
        if (typeof v === 'number') {
          next = next ?? {...style};
          next[prop] = v * scale;
        }
      }
      scaled[key] = next ?? style;
    }
    return scaled as T;
    // sizedKeys は呼び出し側で固定の配列
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, scale]);
}
