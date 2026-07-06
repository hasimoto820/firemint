import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import { getCollectionRef } from '@shared/firestore/paths'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { parseQueryLiteral } from '@shared/firestore/value_parse'
import { logError, logInfo } from '@shared/logging/logger'
import type { DocumentSummary } from '@features/explorer/shared/types'
import type {
  QueryExecuteResult,
  QueryWhereClause,
  SimpleQueryInput
} from '@features/query/shared/types'

const MAX_WHERE_CLAUSES = 3
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

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

function validateWheres(wheres: QueryWhereClause[]): void {
  if (wheres.length > MAX_WHERE_CLAUSES) {
    throw new Error(`where 条件は最大 ${MAX_WHERE_CLAUSES} 件までです`)
  }

  for (const where of wheres) {
    if (!where.field.trim()) {
      throw new Error('where 条件のフィールド名を入力してください')
    }
  }
}

function buildQuery(input: SimpleQueryInput): Query {
  validateWheres(input.wheres)

  const collectionPath = input.collectionPath.trim()
  if (!collectionPath) {
    throw new Error('コレクション path を入力してください')
  }

  let query: Query

  if (input.collectionGroup) {
    if (collectionPath.includes('/')) {
      throw new Error('Collection Group ではコレクション ID のみ指定してください（例: user）')
    }

    query = getFirestore(input.projectId).collectionGroup(collectionPath)
  } else {
    query = getCollectionRef(collectionPath, input.projectId)
  }

  for (const where of input.wheres) {
    query = query.where(where.field.trim(), where.operator, parseQueryLiteral(where.value))
  }

  if (input.orderBy) {
    if (!input.orderBy.field.trim()) {
      throw new Error('orderBy のフィールド名を入力してください')
    }

    query = query.orderBy(input.orderBy.field.trim(), input.orderBy.direction)
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  return query.limit(limit)
}

function toDocumentSummary(snapshot: QueryDocumentSnapshot): DocumentSummary {
  const data = snapshot.data() as Record<string, unknown>

  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    data: serializeFirestoreValue(data) as Record<string, unknown>,
    createTime: snapshot.createTime?.toDate().toISOString() ?? null,
    updateTime: snapshot.updateTime?.toDate().toISOString() ?? null
  }
}

export async function executeQuery(input: SimpleQueryInput): Promise<QueryExecuteResult> {
  try {
    ensureConnected(input.projectId)
    logInfo(
      'query',
      `executeQuery projectId=${input.projectId} path=${input.collectionPath} group=${input.collectionGroup} wheres=${input.wheres.length}`
    )

    const snapshot = await buildQuery(input).get()
    const documents = snapshot.docs.map(toDocumentSummary)

    return { ok: true, data: documents }
  } catch (error) {
    return toQueryError(error)
  }
}
