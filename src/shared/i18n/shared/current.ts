import { translate } from './translate'
import { DEFAULT_LOCALE, type Locale, type MessageParams } from './types'

/*
 * React の外（main のサービス、renderer の補助関数）から使う翻訳。
 * main は設定を読んだ時・変えた時に、renderer は I18nProvider が言語を合わせる。
 * React のコンポーネントの中では、言語の切り替えで描き直すように useI18n() の t を使う。
 */
let currentLocale: Locale = DEFAULT_LOCALE

export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale
}

export function getCurrentLocale(): Locale {
  return currentLocale
}

export function tr(key: string, params?: MessageParams): string {
  return translate(currentLocale, key, params)
}
