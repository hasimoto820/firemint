import {en, type StringKey} from './en';
import {ja} from './ja';
import {zhHant} from './zh-Hant';
import {zhHans} from './zh-Hans';

export type {StringKey};

export const LOCALES = ['en', 'ja', 'zh-Hant', 'zh-Hans'] as const;
export type Locale = (typeof LOCALES)[number];

export const STRINGS: Record<Locale, Record<StringKey, string>> = {
  en,
  ja,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans,
};
