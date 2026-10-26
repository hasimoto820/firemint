import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {StyleSheet} from 'react-native';
import {getTheme, setTheme as saveTheme} from './native';

export type Color1 = 'white' | 'black' | 'gray';

export type Color2 =
  | 'orange'
  | 'green'
  | 'vscode_blue'
  | 'light_gray'
  | 'pink';

export type ThemeChoice = {
  color1: Color1;
  color2: Color2;
};

export const COLOR1_OPTIONS: {id: Color1; hex: string}[] = [
  {id: 'white', hex: '#ffffff'},
  {id: 'black', hex: '#000000'},
  {id: 'gray', hex: '#2a3038'},
];

export const COLOR2_OPTIONS: {id: Color2; hex: string}[] = [
  {id: 'orange', hex: '#e07a2f'},
  {id: 'green', hex: '#37d67a'},
  {id: 'vscode_blue', hex: '#0098ff'},
  {id: 'light_gray', hex: '#9aa3af'},
  {id: 'pink', hex: '#ff80ab'},
];

export const DEFAULT_THEME: ThemeChoice = {
  color1: 'white',
  color2: 'orange',
};

const COLOR1_HEX: Record<Color1, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#2a3038',
};

const COLOR2_HEX: Record<Color2, string> = {
  orange: '#e07a2f',
  green: '#37d67a',
  vscode_blue: '#0098ff',
  light_gray: '#9aa3af',
  pink: '#ff80ab',
};

const PAIR_ADJUST: Partial<
  Record<`${Color1}_${Color2}`, {color1?: string; color2?: string}>
> = {};

export function parseTheme(raw: {color1?: string; color2?: string}): ThemeChoice {
  const color1 = COLOR1_OPTIONS.some(o => o.id === raw.color1)
    ? (raw.color1 as Color1)
    : DEFAULT_THEME.color1;
  const color2 = COLOR2_OPTIONS.some(o => o.id === raw.color2)
    ? (raw.color2 as Color2)
    : DEFAULT_THEME.color2;
  return {color1, color2};
}

export function resolveTheme(choice: ThemeChoice) {
  const adjust = PAIR_ADJUST[`${choice.color1}_${choice.color2}`];
  const color1 = adjust?.color1 ?? COLOR1_HEX[choice.color1];
  const color2 = adjust?.color2 ?? COLOR2_HEX[choice.color2];
  const light = choice.color1 === 'white';
  const ink = light ? '#111111' : '#f2f2f2';
  const inkQuiet = light ? '#8a8a8a' : '#9aa3af';
  const line = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)';
  const frameLine = light ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.5)';
  const onFill = choice.color2 === 'light_gray' ? '#111111' : '#ffffff';
  const dangerBg = {
    backgroundColor: light ? 'rgba(198,40,40,0.12)' : 'rgba(239,83,80,0.22)',
  };
  return {
    color1,
    color2,
    line,
    frameLine,
    ink: {color: ink},
    inkQuiet: {color: inkQuiet},
    fill: {backgroundColor: color2},
    inkOnFill: {color: onFill},
    dangerBg,
    hair: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: line,
    },
    frame: {
      backgroundColor: color1,
      borderColor: frameLine,
      borderWidth: 1,
      borderRadius: 12,
    },
  };
}

type ThemeValue = ReturnType<typeof resolveTheme> & {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => Promise<void>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeRoot({children}: {children: ReactNode}) {
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_THEME);

  useEffect(() => {
    getTheme().then(raw => setChoiceState(parseTheme(raw)));
  }, []);

  const resolved = useMemo(() => resolveTheme(choice), [choice]);

  const setChoice = useCallback(async (next: ThemeChoice) => {
    setChoiceState(next);
    await saveTheme(next.color1, next.color2);
  }, []);

  const value = useMemo(
    () => ({...resolved, choice, setChoice}),
    [resolved, choice, setChoice],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('ThemeRoot missing');
  }
  return value;
}
