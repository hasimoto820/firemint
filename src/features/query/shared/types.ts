import type { DocumentSummary } from '@features/explorer/shared/types'

export type JsQueryInput = {
  projectId: string
  /** ユーザが書いた JS（async function run() を含む） */
  source: string
}

export type QueryResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type QueryExecuteResult = QueryResult<DocumentSummary[]>

/** 名前付きで保存した JS Query（config/saved_queries.json） */
export type SavedQuery = {
  id: string
  name: string
  projectId: string
  source: string
  /** 保存時のコレクション path（ヒント。なくてもよい） */
  collectionPathHint: string | null
  updatedAt: string
}

export type SavedQueriesStore = {
  version: 1
  queries: SavedQuery[]
}

export type SaveSavedQueryInput = {
  /** 既存 id があれば上書き */
  id?: string
  name: string
  projectId: string
  source: string
  collectionPathHint?: string | null
}

export type SavedQueryResult<T> = QueryResult<T>

/** グループタブ。Query の種が「今の path 1 本」か Collection Group か。 */
export type QueryGroupTab = 'collection' | 'group'

function wrapJsQueryChain(chain: string): string {
  return `// Query with JavaScript using the Firebase Admin SDK
async function run() {
  const query = await ${chain}
    .limit(50)
    .get();
  return query;
}
`
}

export function collectionIdFromPath(collectionPath: string | null | undefined): string {
  const segments = (collectionPath ?? '').split('/').filter(Boolean)
  return segments[segments.length - 1] || 'collection'
}

function sourcesMatch(left: string, right: string): boolean {
  return left.trim() === right.trim()
}

/** ツリー path から初期ソースを生成する。 */
export function buildDefaultJsQuerySource(collectionPath: string | null | undefined): string {
  const segments = (collectionPath ?? '').split('/').filter(Boolean)
  let chain = 'db'

  if (segments.length === 0) {
    chain += '.collection("collection")'
  } else {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (index % 2 === 0) {
        chain += `.collection(${JSON.stringify(segment)})`
      } else {
        chain += `.doc(${JSON.stringify(segment)})`
      }
    }
  }

  return wrapJsQueryChain(chain)
}

/** 同名コレクションを横断する Collection Group の種。 */
export function buildCollectionGroupJsQuerySource(
  collectionPath: string | null | undefined
): string {
  return wrapJsQueryChain(`db.collectionGroup(${JSON.stringify(collectionIdFromPath(collectionPath))})`)
}

export function matchQueryGroupTab(
  source: string,
  collectionPath: string | null | undefined
): QueryGroupTab | null {
  if (sourcesMatch(source, buildDefaultJsQuerySource(collectionPath))) {
    return 'collection'
  }

  if (sourcesMatch(source, buildCollectionGroupJsQuerySource(collectionPath))) {
    return 'group'
  }

  return null
}
