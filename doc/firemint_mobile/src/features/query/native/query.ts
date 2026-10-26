import {NativeModules} from 'react-native';
import {ensureCloudAccess} from '../../connection/native/google_auth';
import type {StringKey} from '../../../shared/i18n/i18n';
import {admin, createDb, toRunOutput} from './js_db';
import type {
  QueryOperator,
  QueryRunResult,
  QueryValueType,
} from '../shared/query';

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;

type QueryNative = {
  runQuery: (
    projectId: string,
    collectionPath: string,
    collectionGroup: boolean,
    field: string,
    operator: string,
    value: string,
    operator2: string,
    value2: string,
    valueType: string,
    fetchAll: boolean,
  ) => Promise<QueryRunResult>;
  countQuery: (
    projectId: string,
    collectionPath: string,
    collectionGroup: boolean,
    field: string,
    operator: string,
    value: string,
    operator2: string,
    value2: string,
    valueType: string,
  ) => Promise<number>;
  countWithDescendants: (projectId: string, collectionPath: string) => Promise<number>;
};

function native(): QueryNative {
  const mod = NativeModules.Query as QueryNative | undefined;
  if (!mod) {
    throw new Error('Query missing');
  }
  return mod;
}

async function withToken<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as {code?: string};
    if (err.code !== 'NEED_TOKEN') {
      throw e;
    }
    await ensureCloudAccess();
    return fn();
  }
}

// 同じフィールドの、2つ目の条件。無い時は operator を空にする
export type QuerySecond = {operator: QueryOperator | ''; value: string};

export const NO_SECOND: QuerySecond = {operator: '', value: ''};

export function runQuery(
  projectId: string,
  collectionPath: string,
  collectionGroup: boolean,
  field: string,
  operator: QueryOperator | '',
  value: string,
  fetchAll = false,
  valueType: QueryValueType = 'auto',
  second: QuerySecond = NO_SECOND,
): Promise<QueryRunResult> {
  return withToken(() =>
    native().runQuery(
      projectId,
      collectionPath,
      collectionGroup,
      field,
      operator,
      value,
      second.operator,
      second.value,
      valueType,
      fetchAll,
    ),
  );
}

// 「全件」で読む前に、読む件数を確かめる
export function countQuery(
  projectId: string,
  collectionPath: string,
  collectionGroup: boolean,
  field: string,
  operator: QueryOperator | '',
  value: string,
  valueType: QueryValueType,
  second: QuerySecond,
): Promise<number> {
  return withToken(() =>
    native().countQuery(
      projectId,
      collectionPath,
      collectionGroup,
      field,
      operator,
      value,
      second.operator,
      second.value,
      valueType,
    ),
  );
}

// コレクションと、その下のサブコレクション（どの深さも）にあるドキュメントの合計
export function countWithDescendants(projectId: string, collectionPath: string): Promise<number> {
  return withToken(() => native().countWithDescendants(projectId, collectionPath));
}

// query モードの JS を実行する。db / admin は、admin SDK と同じ書き方の一部（js_db.ts）
export async function runJsQuery(
  projectId: string,
  source: string,
  t: TranslateFn,
): Promise<QueryRunResult> {
  const run = new Function(
    'db',
    'admin',
    `${source}\n; return (typeof run === 'function') ? run() : undefined;`,
  );
  const raw = await run(createDb(projectId), admin);
  const output = toRunOutput(raw);
  if (!output) {
    throw new Error(t('query.runError'));
  }
  return {
    documents: output.documents,
    totalCount: output.documents.length,
    partialLimit: output.partialLimit ?? undefined,
  };
}
