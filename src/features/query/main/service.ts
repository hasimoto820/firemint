import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot
} from 'firebase-admin/firestore'
import admin from 'firebase-admin'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { logError, logInfo } from '@shared/logging/logger'
import type { DocumentSummary } from '@features/explorer/shared/types'
import type { JsQueryInput, QueryExecuteResult } from '@features/query/shared/types'

const MAX_RESULT_DOCS = 1000
const RUN_TIMEOUT_MS = 30_000

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toQueryError(error: unknown): QueryExecuteResult {
  logError('query', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Query operation failed'
  }
}

function toDocumentSummary(snapshot: QueryDocumentSnapshot | DocumentSnapshot): DocumentSummary {
  const data = (snapshot.data() ?? {}) as Record<string, unknown>

  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    data: serializeFirestoreValue(data) as Record<string, unknown>,
    createTime: snapshot.createTime?.toDate().toISOString() ?? null,
    updateTime: snapshot.updateTime?.toDate().toISOString() ?? null
  }
}

function isQuerySnapshotLike(value: unknown): value is QuerySnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const snap = value as Partial<QuerySnapshot>
  return typeof snap.forEach === 'function' && typeof snap.size === 'number'
}

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'exists' in value &&
    'ref' in value &&
    typeof (value as DocumentSnapshot).data === 'function'
  )
}

function looksLikeUnevaluatedQuery(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { get?: unknown }).get === 'function' &&
    !isQuerySnapshotLike(value)
  )
}

function normalizeRunResult(value: unknown): DocumentSummary[] {
  if (value == null) {
    return []
  }

  if (looksLikeUnevaluatedQuery(value)) {
    throw new Error(
      'Query オブジェクトが返されました。.get() した結果（QuerySnapshot）を return してください'
    )
  }

  if (isQuerySnapshotLike(value)) {
    const documents: DocumentSummary[] = []
    value.forEach((doc) => {
      documents.push(toDocumentSummary(doc))
    })
    return documents.slice(0, MAX_RESULT_DOCS)
  }

  if (isDocumentSnapshot(value)) {
    if (!value.exists) {
      return []
    }

    return [toDocumentSummary(value)]
  }

  if (Array.isArray(value)) {
    const documents: DocumentSummary[] = []

    for (const item of value) {
      if (isDocumentSnapshot(item)) {
        if (item.exists) {
          documents.push(toDocumentSummary(item))
        }
        continue
      }

      throw new Error(
        '配列の要素は DocumentSnapshot である必要があります（QuerySnapshot を return する方が簡単です）'
      )
    }

    return documents.slice(0, MAX_RESULT_DOCS)
  }

  throw new Error(
    'run() は QuerySnapshot / DocumentSnapshot / それらの配列を return してください'
  )
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`クエリがタイムアウトしました（${ms / 1000} 秒）`))
        }, ms)
      })
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function buildRunner(source: string): (db: unknown, adminSdk: unknown) => Promise<unknown> {
  // 同期 Function が async IIFE を返す形にする（AsyncFunction 直書きより安定）
  const factory = new Function(
    'db',
    'admin',
    `"use strict";
return (async () => {
${source}
if (typeof run !== 'function') {
  throw new Error('async function run() を定義してください');
}
return await run();
})();`
  ) as (db: unknown, adminSdk: unknown) => Promise<unknown>

  return factory
}

/**
 * ユーザー JS（async function run）を main で実行する。
 * 注入するのは db（Admin Firestore）と admin のみ。
 */
export async function executeJsQuery(input: JsQueryInput): Promise<QueryExecuteResult> {
  try {
    if (!input || typeof input.projectId !== 'string') {
      throw new Error('projectId がありません')
    }

    if (!input.source || typeof input.source !== 'string') {
      throw new Error('クエリコードが空です')
    }

    ensureConnected(input.projectId)

    const source = input.source.trim()
    if (!source) {
      throw new Error('クエリコードが空です')
    }

    logInfo('query', `executeJsQuery projectId=${input.projectId} sourceLength=${source.length}`)

    const db = getFirestore(input.projectId)
    const runner = buildRunner(source)
    const raw = await withTimeout(Promise.resolve().then(() => runner(db, admin)), RUN_TIMEOUT_MS)
    const documents = normalizeRunResult(raw)

    logInfo('query', `executeJsQuery ok docs=${documents.length}`)
    return { ok: true, data: documents }
  } catch (error) {
    return toQueryError(error)
  }
}
