import type { Locale, MessageCatalog } from '../types'
import { en } from './en'
import { ja } from './ja'
import { zhHant } from './zh_Hant'
import { zhHans } from './zh_Hans'

export const catalogs: Record<Locale, MessageCatalog> = {
  en,
  ja,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans
}
