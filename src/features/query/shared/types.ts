import type { DocumentSummary } from '@features/explorer/shared/types'

export type QueryWhereOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'array-contains'
  | 'in'
  | 'array-contains-any'
  | 'not-in'

export type QueryWhereClause = {
  field: string
  operator: QueryWhereOperator
  value: string
}

export type QueryOrderByClause = {
  field: string
  direction: 'asc' | 'desc'
}

export type SimpleQueryInput = {
  projectId: string
  collectionPath: string
  collectionGroup: boolean
  wheres: QueryWhereClause[]
  orderBy?: QueryOrderByClause
  limit?: number
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
