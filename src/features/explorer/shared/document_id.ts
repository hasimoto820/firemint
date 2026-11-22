import { tr } from '@shared/i18n/shared/current'
/** Firestore ドキュメント ID の簡易チェック。問題なければ null。 */
export function invalidDocumentIdReason(documentId: string): string | null {
  if (documentId.includes('/')) {
    return tr('explorer.docid_no_slash')
  }

  if (documentId === '.' || documentId === '..') {
    return tr('explorer.docid_no_dots')
  }

  if (/^__.*__$/.test(documentId)) {
    return tr('explorer.docid_no_dunder')
  }

  return null
}
