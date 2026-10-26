import {NativeModules} from 'react-native';
import {ensureCloudAccess} from '../../connection/native/google_auth';
import type {QueryDoc, QueryOperator} from '../shared/query';

// query モードの JS に渡す db / admin。admin SDK と同じ書き方の一部
// （001_008_todo「query モードの JS」）。
// 値は、編集欄と同じ形（普通の JSON ＋ __firemint_type）にして Kotlin に渡す。

type JsNative = {
  jsQuery: (
    projectId: string,
    collectionPath: string,
    collectionGroup: boolean,
    specJson: string,
    transaction: string,
  ) => Promise<{documents: QueryDoc[]; partial: boolean}>;
  jsGet: (projectId: string, documentPath: string, transaction: string) => Promise<QueryDoc | null>;
  jsCommit: (projectId: string, writesJson: string, transaction: string) => Promise<null>;
  jsBeginTransaction: (projectId: string) => Promise<string>;
  jsRollback: (projectId: string, transaction: string) => Promise<null>;
};

function native(): JsNative {
  const mod = NativeModules.Query as JsNative | undefined;
  if (!mod) {
    throw new Error('Query missing');
  }
  return mod;
}

// 1 回の呼び出しごとに、権限が切れていたら取り直して、その呼び出しだけをやり直す
// （スクリプト全体をやり直すと、済んだ書き込みが二重になる）
async function call<T>(fn: (mod: JsNative) => Promise<T>): Promise<T> {
  try {
    return await fn(native());
  } catch (e) {
    if ((e as {code?: string}).code !== 'NEED_TOKEN') {
      throw e;
    }
    await ensureCloudAccess();
    return fn(native());
  }
}

const TYPE_KEY = '__firemint_type';
const TRANSACTION_ATTEMPTS = 5;
const CLIENT_OPERATORS: string[] = ['contains', 'exists', 'not-exists'];

type FieldPathSegments = string[];

type Filter = {field: FieldPathSegments; op: QueryOperator; value: unknown};
type Order = {field: FieldPathSegments; direction: 'asc' | 'desc'};
type QuerySpec = {filters: Filter[]; orderBy: Order[]; limit?: number};

type Transform = {
  field: FieldPathSegments;
  kind: 'serverTimestamp' | 'increment' | 'arrayUnion' | 'arrayRemove';
  value?: unknown;
};

type Write =
  | {delete: string}
  | {
      path: string;
      fields: Record<string, unknown>;
      mask?: FieldPathSegments[];
      transforms: Transform[];
      exists?: boolean;
    };

// ---- 値 ----

export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  // 2026-10-12T00:00:00.123456789Z（ナノ秒まで落とさない）
  toISOString(): string {
    const base = new Date(this.seconds * 1000).toISOString().slice(0, 19);
    return `${base}.${String(this.nanoseconds).padStart(9, '0')}Z`;
  }
}

export class GeoPoint {
  constructor(readonly latitude: number, readonly longitude: number) {}
}

class FieldValueSentinel {
  constructor(readonly kind: Transform['kind'] | 'delete', readonly value?: unknown) {}
}

export const FieldValue = {
  serverTimestamp: () => new FieldValueSentinel('serverTimestamp'),
  increment: (n: number) => new FieldValueSentinel('increment', n),
  arrayUnion: (...elements: unknown[]) => new FieldValueSentinel('arrayUnion', elements),
  arrayRemove: (...elements: unknown[]) => new FieldValueSentinel('arrayRemove', elements),
  delete: () => new FieldValueSentinel('delete'),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// JS の値 → 編集欄と同じ形
function encode(value: unknown, where: string): unknown {
  if (value === undefined) {
    throw new Error(`undefined は書けません: ${where}`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    // 整数 → 整数、それ以外 → 小数（admin SDK と同じ）。NaN と無限大は JSON で書けない
    return Number.isFinite(value) ? value : {[TYPE_KEY]: 'double', value: String(value)};
  }
  if (value instanceof Date) {
    return {[TYPE_KEY]: 'timestamp', iso: Timestamp.fromDate(value).toISOString()};
  }
  if (value instanceof Timestamp) {
    return {[TYPE_KEY]: 'timestamp', iso: value.toISOString()};
  }
  if (value instanceof GeoPoint) {
    return {[TYPE_KEY]: 'geopoint', latitude: value.latitude, longitude: value.longitude};
  }
  if (value instanceof DocumentReference) {
    return {[TYPE_KEY]: 'reference', path: value.path};
  }
  if (value instanceof FieldValueSentinel) {
    throw new Error(`FieldValue は、フィールドの値としてだけ使えます: ${where}`);
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => encode(v, `${where}[${i}]`));
  }
  if (isPlainObject(value)) {
    // 編集欄と同じ形（__firemint_type）は、そのまま渡す
    if (TYPE_KEY in value) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = encode(v, where ? `${where}.${k}` : k);
    }
    return out;
  }
  throw new Error(`書けない値です: ${where}`);
}

function splitFieldPath(field: string): FieldPathSegments {
  const segments = field.split('.');
  if (segments.some(s => s === '')) {
    throw new Error(`フィールドの書き方が正しくありません: ${field}`);
  }
  return segments;
}

function setNested(obj: Record<string, unknown>, path: FieldPathSegments, value: unknown) {
  let cur = obj;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

// set の data を、書くフィールド・FieldValue・消すフィールドに分ける。
// leaves: merge の時に書くフィールドの一覧（マップの中まで降りた、末端）
function splitData(
  data: Record<string, unknown>,
  prefix: FieldPathSegments,
  out: {transforms: Transform[]; deletes: FieldPathSegments[]; leaves: FieldPathSegments[]},
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const path = [...prefix, key];
    if (value instanceof FieldValueSentinel) {
      if (value.kind === 'delete') {
        out.deletes.push(path);
      } else {
        out.transforms.push(transformOf(path, value));
      }
      continue;
    }
    if (isPlainObject(value) && !(TYPE_KEY in value) && Object.keys(value).length > 0) {
      fields[key] = splitData(value, path, out);
      continue;
    }
    fields[key] = encode(value, path.join('.'));
    out.leaves.push(path);
  }
  return fields;
}

function transformOf(path: FieldPathSegments, sentinel: FieldValueSentinel): Transform {
  const kind = sentinel.kind as Transform['kind'];
  return kind === 'serverTimestamp'
    ? {field: path, kind}
    : {field: path, kind, value: encode(sentinel.value, path.join('.'))};
}

function requireData(data: unknown, method: string): Record<string, unknown> {
  if (!isPlainObject(data)) {
    throw new Error(`${method} の data はオブジェクトで書いてください`);
  }
  return data;
}

function setWrite(path: string, data: unknown, options?: {merge?: boolean}): Write {
  const out = {transforms: [] as Transform[], deletes: [] as FieldPathSegments[], leaves: [] as FieldPathSegments[]};
  const fields = splitData(requireData(data, 'set'), [], out);
  if (options?.merge) {
    return {path, fields, mask: [...out.leaves, ...out.deletes], transforms: out.transforms};
  }
  if (out.deletes.length > 0) {
    throw new Error('FieldValue.delete() は、set では merge の時だけ使えます');
  }
  return {path, fields, transforms: out.transforms};
}

function createWrite(path: string, data: unknown): Write {
  const write = setWrite(path, data);
  return {...write, exists: false} as Write;
}

// update のキーは、フィールドのパス（'a.b'）。値はそのパスの値を丸ごと置き換える
function updateWrite(path: string, data: unknown): Write {
  const fields: Record<string, unknown> = {};
  const mask: FieldPathSegments[] = [];
  const transforms: Transform[] = [];
  for (const [key, value] of Object.entries(requireData(data, 'update'))) {
    const fieldPath = splitFieldPath(key);
    if (value instanceof FieldValueSentinel) {
      if (value.kind === 'delete') {
        mask.push(fieldPath);
      } else {
        transforms.push(transformOf(fieldPath, value));
      }
      continue;
    }
    mask.push(fieldPath);
    if (isPlainObject(value) && !(TYPE_KEY in value)) {
      const inner = {transforms, deletes: [] as FieldPathSegments[], leaves: [] as FieldPathSegments[]};
      setNested(fields, fieldPath, splitData(value, fieldPath, inner));
    } else {
      setNested(fields, fieldPath, encode(value, key));
    }
  }
  return {path, fields, mask, transforms, exists: true};
}

// admin SDK と同じ、20 文字の自動 ID
function autoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function joinPath(...parts: string[]): string {
  return parts
    .join('/')
    .split('/')
    .filter(s => s !== '')
    .join('/');
}

function segmentCount(path: string): number {
  return joinPath(path).split('/').length;
}

// ---- 読み ----

type Ctx = {projectId: string};

export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly doc: QueryDoc | null,
  ) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.doc !== null;
  }

  data(): Record<string, unknown> | undefined {
    return this.doc ? (JSON.parse(this.doc.fieldsJson) as Record<string, unknown>) : undefined;
  }

  get(field: string): unknown {
    let cur: unknown = this.data();
    for (const key of splitFieldPath(field)) {
      if (!isPlainObject(cur)) {
        return undefined;
      }
      cur = cur[key];
    }
    return cur;
  }

  // 一覧に出す形
  toQueryDoc(): QueryDoc | null {
    return this.doc;
  }
}

export class QuerySnapshot {
  constructor(
    readonly docs: DocumentSnapshot[],
    // limit で取った件数の中だけを、端末で絞り込んだ時の limit
    readonly partialLimit: number | null,
  ) {}

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  forEach(fn: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(fn);
  }
}

export class Query {
  constructor(
    protected readonly ctx: Ctx,
    protected readonly collectionPath: string,
    protected readonly collectionGroup: boolean,
    protected readonly spec: QuerySpec,
  ) {}

  where(field: string, op: QueryOperator, value?: unknown): Query {
    const encoded = CLIENT_OPERATORS.includes(op) ? (value === undefined ? '' : String(value)) : encode(value, field);
    return this.next({...this.spec, filters: [...this.spec.filters, {field: splitFieldPath(field), op, value: encoded}]});
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return this.next({...this.spec, orderBy: [...this.spec.orderBy, {field: splitFieldPath(field), direction}]});
  }

  limit(n: number): Query {
    return this.next({...this.spec, limit: n});
  }

  get(): Promise<QuerySnapshot> {
    return this.read('');
  }

  async read(transaction: string): Promise<QuerySnapshot> {
    const result = await call(mod =>
      mod.jsQuery(
        this.ctx.projectId,
        this.collectionPath,
        this.collectionGroup,
        JSON.stringify(this.spec),
        transaction,
      ),
    );
    const docs = result.documents.map(
      d => new DocumentSnapshot(new DocumentReference(this.ctx, d.path), d),
    );
    return new QuerySnapshot(docs, result.partial ? this.spec.limit ?? null : null);
  }

  private next(spec: QuerySpec): Query {
    return new Query(this.ctx, this.collectionPath, this.collectionGroup, spec);
  }
}

const EMPTY_SPEC: QuerySpec = {filters: [], orderBy: []};

export class CollectionReference extends Query {
  constructor(ctx: Ctx, readonly path: string) {
    if (segmentCount(path) % 2 !== 1) {
      throw new Error(`コレクションのパスではありません: ${path}`);
    }
    super(ctx, joinPath(path), false, EMPTY_SPEC);
  }

  get id(): string {
    return this.path.split('/').pop() ?? '';
  }

  doc(id?: string): DocumentReference {
    return new DocumentReference(this.ctx, joinPath(this.path, id ?? autoId()));
  }

  async add(data: unknown): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class DocumentReference {
  readonly path: string;

  constructor(private readonly ctx: Ctx, path: string) {
    this.path = joinPath(path);
    if (segmentCount(this.path) % 2 !== 0) {
      throw new Error(`ドキュメントのパスではありません: ${path}`);
    }
  }

  get id(): string {
    return this.path.split('/').pop() ?? '';
  }

  get parent(): CollectionReference {
    return new CollectionReference(this.ctx, this.path.split('/').slice(0, -1).join('/'));
  }

  collection(id: string): CollectionReference {
    return new CollectionReference(this.ctx, joinPath(this.path, id));
  }

  get(): Promise<DocumentSnapshot> {
    return this.read('');
  }

  async read(transaction: string): Promise<DocumentSnapshot> {
    const doc = await call(mod => mod.jsGet(this.ctx.projectId, this.path, transaction));
    return new DocumentSnapshot(this, doc);
  }

  create(data: unknown) {
    return commit(this.ctx, [createWrite(this.path, data)], '');
  }

  set(data: unknown, options?: {merge?: boolean}) {
    return commit(this.ctx, [setWrite(this.path, data, options)], '');
  }

  update(data: unknown) {
    return commit(this.ctx, [updateWrite(this.path, data)], '');
  }

  delete() {
    return commit(this.ctx, [{delete: this.path}], '');
  }
}

async function commit(ctx: Ctx, writes: Write[], transaction: string): Promise<void> {
  await call(mod => mod.jsCommit(ctx.projectId, JSON.stringify(writes), transaction));
}

// ---- まとめて書く ----

export class WriteBatch {
  private readonly writes: Write[] = [];

  constructor(private readonly ctx: Ctx) {}

  create(ref: DocumentReference, data: unknown): WriteBatch {
    this.writes.push(createWrite(ref.path, data));
    return this;
  }

  set(ref: DocumentReference, data: unknown, options?: {merge?: boolean}): WriteBatch {
    this.writes.push(setWrite(ref.path, data, options));
    return this;
  }

  update(ref: DocumentReference, data: unknown): WriteBatch {
    this.writes.push(updateWrite(ref.path, data));
    return this;
  }

  delete(ref: DocumentReference): WriteBatch {
    this.writes.push({delete: ref.path});
    return this;
  }

  commit(): Promise<void> {
    return commit(this.ctx, this.writes, '');
  }
}

export class Transaction {
  readonly writes: Write[] = [];

  constructor(private readonly id: string) {}

  get<T extends DocumentReference | Query>(
    target: T,
  ): Promise<T extends DocumentReference ? DocumentSnapshot : QuerySnapshot> {
    if (this.writes.length > 0) {
      throw new Error('transaction の読みは、書きより前に行ってください');
    }
    return target.read(this.id) as Promise<
      T extends DocumentReference ? DocumentSnapshot : QuerySnapshot
    >;
  }

  create(ref: DocumentReference, data: unknown): Transaction {
    this.writes.push(createWrite(ref.path, data));
    return this;
  }

  set(ref: DocumentReference, data: unknown, options?: {merge?: boolean}): Transaction {
    this.writes.push(setWrite(ref.path, data, options));
    return this;
  }

  update(ref: DocumentReference, data: unknown): Transaction {
    this.writes.push(updateWrite(ref.path, data));
    return this;
  }

  delete(ref: DocumentReference): Transaction {
    this.writes.push({delete: ref.path});
    return this;
  }
}

// ---- db / admin ----

export function createDb(projectId: string) {
  const ctx: Ctx = {projectId};
  return {
    collection: (path: string) => new CollectionReference(ctx, path),
    collectionGroup: (id: string) => {
      if (id.includes('/')) {
        throw new Error(`collectionGroup には / を含まない ID を書いてください: ${id}`);
      }
      return new Query(ctx, id, true, EMPTY_SPEC);
    },
    doc: (path: string) => new DocumentReference(ctx, path),
    batch: () => new WriteBatch(ctx),
    // 競合（ABORTED）した時は、fn からやり直す（admin SDK と同じ）
    async runTransaction<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
      for (let attempt = 1; ; attempt++) {
        const id = await call(mod => mod.jsBeginTransaction(projectId));
        const t = new Transaction(id);
        let result: T;
        try {
          result = await fn(t);
        } catch (e) {
          await call(mod => mod.jsRollback(projectId, id)).catch(() => null);
          throw e;
        }
        try {
          await commit(ctx, t.writes, id);
          return result;
        } catch (e) {
          const code = (e as {code?: string}).code;
          if (code !== 'ABORTED' || attempt >= TRANSACTION_ATTEMPTS) {
            throw e;
          }
        }
      }
    },
  };
}

export const admin = {
  firestore: {FieldValue, Timestamp, GeoPoint},
};

// ---- run() の戻り値 → 一覧 ----

export type JsRunOutput = {documents: QueryDoc[]; partialLimit: number | null};

// null: 一覧にできない値
export function toRunOutput(raw: unknown): JsRunOutput | null {
  if (raw === undefined || raw === null) {
    return {documents: [], partialLimit: null};
  }
  if (raw instanceof QuerySnapshot) {
    return {documents: docsOf(raw.docs), partialLimit: raw.partialLimit};
  }
  if (raw instanceof DocumentSnapshot) {
    return {documents: docsOf([raw]), partialLimit: null};
  }
  if (Array.isArray(raw) && raw.every(item => item instanceof DocumentSnapshot)) {
    return {documents: docsOf(raw as DocumentSnapshot[]), partialLimit: null};
  }
  return null;
}

function docsOf(snaps: DocumentSnapshot[]): QueryDoc[] {
  return snaps.map(s => s.toQueryDoc()).filter((d): d is QueryDoc => d !== null);
}
