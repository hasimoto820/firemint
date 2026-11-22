import type { Locale } from './types'

/** 1 つのキーに、4 つの言語の訳をまとめて書く。どれかが欠けると型エラーになる */
export type MessageTable = Record<string, Record<Locale, string>>

export function defineMessages<T extends MessageTable>(table: T): T {
  return table
}
