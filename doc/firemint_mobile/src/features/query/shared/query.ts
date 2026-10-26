import type {StringKey} from '../../../shared/i18n/i18n';

export type QueryMode = 'simple' | 'query';

export type QueryScope = 'collection' | 'group';

export type QueryOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'contains'
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'array-contains-any'
  | 'exists'
  | 'not-exists';

export const QUERY_OPERATORS: {value: QueryOperator; labelKey: StringKey | null; label: string | null}[] = [
  {value: '==', labelKey: null, label: '=='},
  {value: '!=', labelKey: null, label: '!='},
  {value: '<', labelKey: null, label: '<'},
  {value: '<=', labelKey: null, label: '<='},
  {value: '>', labelKey: null, label: '>'},
  {value: '>=', labelKey: null, label: '>='},
  {value: 'contains', labelKey: 'query.operatorContains', label: null},
  {value: 'in', labelKey: null, label: 'in'},
  {value: 'not-in', labelKey: null, label: 'not in'},
  {value: 'array-contains', labelKey: null, label: 'array contains'},
  {value: 'array-contains-any', labelKey: null, label: 'array contains any'},
  {value: 'exists', labelKey: 'query.operatorExists', label: null},
  {value: 'not-exists', labelKey: 'query.operatorNotExists', label: null},
];

// simple の「値」を、どの型として検索するか（FirestoreClient.kt の TYPE_* と同じ）。
// auto: そのフィールドに入っている型に合わせる（resolveValueType）。
//       分からない時は、見た目から決める（true / false → 真偽値、数字 → 数値、他 → 文字列）
export type QueryValueType = 'auto' | 'string' | 'number' | 'boolean' | 'timestamp';

export const QUERY_VALUE_TYPES: {value: QueryValueType; labelKey: StringKey}[] = [
  {value: 'auto', labelKey: 'query.typeAuto'},
  {value: 'string', labelKey: 'query.typeString'},
  {value: 'number', labelKey: 'query.typeNumber'},
  {value: 'boolean', labelKey: 'query.typeBoolean'},
  {value: 'timestamp', labelKey: 'query.typeTimestamp'},
];

// 「フィールド」の候補。読み込み済みのドキュメントから拾う。
// kind: 検索の型に対応するものは QueryValueType。他は、表示用の種類
export type FieldKind = Exclude<QueryValueType, 'auto'> | 'array' | 'map' | 'other';

export type FieldOption = {field: string; kind: FieldKind};

export const FIELD_KIND_LABEL: Record<FieldKind, StringKey | null> = {
  string: 'query.typeString',
  number: 'query.typeNumber',
  boolean: 'query.typeBoolean',
  timestamp: 'query.typeTimestamp',
  array: 'query.typeArray',
  map: 'query.typeMap',
  other: null,
};

function fieldKind(value: unknown): FieldKind | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  const typed = (value as Record<string, unknown>).__firemint_type;
  if (typed === 'timestamp') {
    return 'timestamp';
  }
  if (typed === 'double') {
    return 'number';
  }
  return typed === undefined ? 'map' : 'other';
}

// 読み込み済みのドキュメントの、一番上の階層のフィールドと、その型。
// 同じフィールドに型が複数あれば、型ごとに1件ずつ並べる。null だけのフィールドは出さない
export function collectFieldOptions(docs: QueryDoc[]): FieldOption[] {
  const seen = new Set<string>();
  const options: FieldOption[] = [];
  for (const doc of docs) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(doc.fieldsJson) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const field of Object.keys(obj)) {
      const kind = fieldKind(obj[field]);
      if (kind === null) {
        continue;
      }
      const key = `${field}\n${kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({field, kind});
      }
    }
  }
  return sortFieldOptions(options);
}

// フィールド名の順。同じ名前なら型の順
export function sortFieldOptions(options: FieldOption[]): FieldOption[] {
  return options.sort((a, b) =>
    a.field === b.field ? a.kind.localeCompare(b.kind) : a.field.localeCompare(b.field),
  );
}

// 「自動」の時、そのフィールドに入っている型を返す。読み込み済みのドキュメントで、
// そのフィールドの型が 1 つに決まる時だけ（文字列・数値・真偽値・日時）。
// 決まらない（無い・型が混ざっている・配列やマップ）時は 'auto' のまま（Kotlin が見た目から決める）
export function resolveValueType(
  valueType: QueryValueType,
  field: string,
  options: FieldOption[],
): QueryValueType {
  if (valueType !== 'auto') {
    return valueType;
  }
  const name = field.trim();
  const kinds = new Set(options.filter(o => o.field === name).map(o => o.kind));
  if (kinds.size !== 1) {
    return 'auto';
  }
  const [kind] = [...kinds];
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'timestamp'
    ? kind
    : 'auto';
}

// 同じフィールドに、2つ目の条件を足せる演算子（範囲）。
// 例: createdAt >= A かつ createdAt < B
export const QUERY_RANGE_OPERATORS: QueryOperator[] = ['<', '<=', '>', '>='];

export function isRangeOperator(operator: QueryOperator | ''): boolean {
  return operator !== '' && QUERY_RANGE_OPERATORS.includes(operator);
}

export type QueryDoc = {
  id: string;
  path: string;
  fieldsJson: string;
};

// partial: 「部分一致」「存在する」「存在しない」で、コレクションの先頭の一部しか見ていない時に true
// sourceCount: 絞り込む前の、コレクション（またはグループ）全体の件数
export type QueryRunResult = {
  documents: QueryDoc[];
  totalCount: number;
  partial?: boolean;
  sourceCount?: number;
  // query モードの JS で、limit で取った件数の中だけを端末で絞り込んだ時の、その limit
  partialLimit?: number;
};

export const QUERY_PAGE_SIZE = 20;
export const QUERY_FETCH_MAX = 500;

export function insertAt(
  text: string,
  sel: {start: number; end: number},
  insert: string,
): string {
  const start = Math.min(sel.start, text.length);
  const end = Math.min(sel.end, text.length);
  if (start === 0 && end === 0 && text.length > 0) {
    return `${text}\n${insert}`;
  }
  return text.slice(0, start) + insert + text.slice(end);
}

export function collectionIdFromPath(collectionPath: string): string {
  const parts = collectionPath.split('/').filter(p => p.length > 0);
  return parts[parts.length - 1] ?? collectionPath;
}

export function defaultJsSource(collectionPath: string): string {
  return `async function run() {
  const query = await db.collection(${JSON.stringify(collectionPath)})
    .limit(50)
    .get();
  return query;
}
`;
}

export function groupJsSource(collectionPath: string): string {
  const id = collectionIdFromPath(collectionPath);
  return `async function run() {
  const query = await db.collectionGroup(${JSON.stringify(id)})
    .limit(50)
    .get();
  return query;
}
`;
}
