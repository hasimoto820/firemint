import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {getDeviceLocale, getLanguage, setLanguage as saveLanguage} from '../settings/native';
import {LOCALES, STRINGS, type Locale, type StringKey} from './strings';

export type {Locale, StringKey};

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_OPTIONS: {id: Locale; label: string}[] = [
  {id: 'en', label: 'English'},
  {id: 'ja', label: '日本語'},
  {id: 'zh-Hant', label: '繁體中文'},
  {id: 'zh-Hans', label: '简体中文'},
];

export function parseLocale(raw: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as Locale)
    : DEFAULT_LOCALE;
}

export function mapDeviceLocaleToSupported(tag: string): Locale {
  const lower = tag.toLowerCase();
  if (lower.startsWith('ja')) {
    return 'ja';
  }
  if (lower.startsWith('zh')) {
    if (
      lower.includes('hant') ||
      lower.includes('-tw') ||
      lower.includes('-hk') ||
      lower.includes('-mo')
    ) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }
  if (lower.startsWith('en')) {
    return 'en';
  }
  return DEFAULT_LOCALE;
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;

type LocaleValue = {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  t: TranslateFn;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleRoot({children}: {children: ReactNode}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    getLanguage().then(async raw => {
      if (raw) {
        setLocaleState(parseLocale(raw));
        return;
      }
      const deviceTag = await getDeviceLocale();
      const detected = mapDeviceLocaleToSupported(deviceTag);
      setLocaleState(detected);
      await saveLanguage(detected);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await saveLanguage(next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const table = STRINGS[locale];
      const template = table[key] ?? STRINGS[DEFAULT_LOCALE][key] ?? key;
      return format(template, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({locale, setLocale, t}), [locale, setLocale, t]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('LocaleRoot missing');
  }
  return value;
}
