/** Firestore ドキュメント ID の簡易チェック。問題なければ null。 */
export function invalidDocumentIdReason(documentId: string): string | null {
  if (documentId.includes('/')) {
    return 'ドキュメント ID に / は使えません'
  }

  if (documentId === '.' || documentId === '..') {
    return 'ドキュメント ID に . や .. は使えません'
  }

  if (/^__.*__$/.test(documentId)) {
    return 'ドキュメント ID に __ で囲んだ名前は使えません'
  }

  return null
}
