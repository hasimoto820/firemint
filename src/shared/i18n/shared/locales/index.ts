import type { MessageTable } from '../messages'
import type { Locale, MessageCatalog } from '../types'
import { featureMessages } from './features'
import { en } from './en'
import { ja } from './ja'
import { zhHant } from './zh_Hant'
import { zhHans } from './zh_Hans'

function mergeTables(base: Record<Locale, MessageCatalog>, tables: MessageTable[]): void {
  for (const table of tables) {
    for (const [key, byLocale] of Object.entries(table)) {
      for (const locale of Object.keys(base) as Locale[]) {
        base[locale][key] = byLocale[locale]
      }
    }
  }
}

export const catalogs: Record<Locale, MessageCatalog> = {
  en: { ...en },
  ja: { ...ja },
  'zh-Hant': { ...zhHant },
  'zh-Hans': { ...zhHans }
}

mergeTables(catalogs, featureMessages)
