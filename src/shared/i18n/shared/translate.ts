import { catalogs } from './locales'
import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageParams,
  type TranslateFn
} from './types'

function applyParams(template: string, params?: MessageParams): string {
  if (!params) {
    return template
  }

  let text = template
  for (const [key, value] of Object.entries(params)) {
    text = text.split(`{${key}}`).join(String(value))
  }
  return text
}

export function translate(
  locale: Locale,
  key: string,
  params?: MessageParams
): string {
  const primary = catalogs[locale]?.[key]
  const fallback = catalogs[DEFAULT_LOCALE]?.[key]
  const template = primary ?? fallback ?? key
  return applyParams(template, params)
}

export function createTranslator(locale: Locale): TranslateFn {
  return (key, params) => translate(locale, key, params)
}
