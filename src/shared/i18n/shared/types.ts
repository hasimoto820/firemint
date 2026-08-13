export const LOCALES = ['en', 'ja', 'zh-Hant', 'zh-Hans'] as const

export type Locale = (typeof LOCALES)[number]

export type MessageParams = Record<string, string | number>

/** フラット辞書（キーはドット区切り） */
export type MessageCatalog = Record<string, string>

export type TranslateFn = (key: string, params?: MessageParams) => string

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_LABEL_KEYS: Record<Locale, string> = {
  en: 'menu.language.en',
  ja: 'menu.language.ja',
  'zh-Hant': 'menu.language.zh_Hant',
  'zh-Hans': 'menu.language.zh_Hans'
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
