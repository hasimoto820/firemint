import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';
import {Latch} from '../../../shared/ui/Latch';
import {
  assertWritable,
  confirmWrite,
} from '../../../shared/safety/confirm_write';
import {pickDateTime} from '../../query/native/date_picker';
import {
  NO_SECOND,
  countQuery,
  countWithDescendants,
  runJsQuery,
  runQuery,
  type QuerySecond,
} from '../../query/native/query';
import {QueryHeader} from '../../query/ui/components/QueryHeader';
import {BusyOverlay} from '../../../shared/ui/BusyOverlay';
import {
  QUERY_FETCH_MAX,
  QUERY_PAGE_SIZE,
  collectFieldOptions,
  defaultJsSource,
  groupJsSource,
  insertAt,
  isRangeOperator,
  resolveValueType,
  sortFieldOptions,
  type FieldOption,
  type QueryDoc,
  type QueryMode,
  type QueryOperator,
  type QueryScope,
  type QueryValueType,
} from '../../query/shared/query';
import {SnippetPickScreen} from '../../snippet/ui/SnippetPickScreen';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {
  createDocument,
  deleteDocument,
  getDocument,
  onDocumentChange,
} from '../native/explorer';
import {
  assertSegment,
  fullPath,
  joinPath,
  lastSegment,
  type ExplorerDoc,
} from '../shared/paths';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type DocumentListScreenProps = {
  project: WorkspaceProject;
  collectionPath: string;
  onBack: () => void;
  onOpenDocument: (doc: ExplorerDoc) => void;
  onOpenDocumentInNewTab: (doc: ExplorerDoc) => void;
};

type Form =
  | {kind: 'add'; documentId: string}
  | {kind: 'duplicate'; from: ExplorerDoc; documentId: string};

// 一覧の行に出す、値の抜粋。型の名前を添えた値（__firemint_type）は、中身だけを出す
function previewValue(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return String(value);
  }
  const typed = value as Record<string, unknown>;
  switch (typed.__firemint_type) {
    case 'timestamp':
      return String(typed.iso);
    case 'reference':
      return String(typed.path);
    case 'geopoint':
      return `${typed.latitude}, ${typed.longitude}`;
    case 'bytes':
      return '(bytes)';
    case 'double':
      return String(typed.value);
    default:
      return JSON.stringify(value);
  }
}

function previewFields(fieldsJson: string): string {
  try {
    const obj = JSON.parse(fieldsJson) as Record<string, unknown>;
    return Object.keys(obj)
      .slice(0, 4)
      .map(key => `${key}: ${previewValue(obj[key])}`)
      .join('\n');
  } catch {
    return '';
  }
}

export function DocumentListScreen({
  project,
  collectionPath,
  onBack,
  onOpenDocument,
  onOpenDocumentInNewTab,
}: DocumentListScreenProps) {
  const styles = useScaledStyles(baseStyles, ['pageInput']);
  const {line, frameLine, hair, frame, ink, inkQuiet, fill, inkOnFill} =
    useTheme();
  const {t} = useLocale();
  const [headerOpen, setHeaderOpen] = useState(true);
  const [mode, setMode] = useState<QueryMode>('simple');
  const [scope, setScope] = useState<QueryScope>('collection');
  // simple で、サーバーから取ってくる件数。false: 500件まで / true: 全件
  const [fetchAll, setFetchAll] = useState(false);
  const [field, setField] = useState('');
  const [operator, setOperator] = useState<QueryOperator>('==');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState<QueryValueType>('auto');
  // 同じフィールドの、2つ目の条件（範囲の時だけ）。足していない時は null
  const [operator2, setOperator2] = useState<QueryOperator | null>(null);
  const [value2, setValue2] = useState('');
  const second: QuerySecond =
    isRangeOperator(operator) && operator2 !== null
      ? {operator: operator2, value: value2}
      : NO_SECOND;
  const [jsSource, setJsSource] = useState(() => defaultJsSource(collectionPath));
  const [docs, setDocs] = useState<QueryDoc[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [partialOf, setPartialOf] = useState<number | null>(null);
  const [partialLimit, setPartialLimit] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(true);
  const [pickSnippets, setPickSnippets] = useState(false);
  const [jsSel, setJsSel] = useState({start: 0, end: 0});

  // このコレクションで、これまでに読み込んだドキュメントのフィールドと型（「自動」の型を決めるため、
  // と「フィールド」の候補）。検索で 0 件になっても、前に見えていたものを忘れないよう、ためておく
  const knownFields = useRef<FieldOption[]>([]);

  // サブコレクション（どの深さも）の件数。条件なしで、このコレクションを開いた時だけ数える
  // （親の条件はサブコレクションに効かないので、絞った時は出さない）。
  // 古い数え直しの結果は捨てる
  const [subCount, setSubCount] = useState<number | 'loading' | 'failed' | null>(null);
  const subRequest = useRef(0);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);

  useEffect(() => {
    setMode('simple');
    setScope('collection');
    setField('');
    setOperator('==');
    setValue('');
    setValueType('auto');
    setOperator2(null);
    setValue2('');
    setJsSource(defaultJsSource(collectionPath));
    setPage(1);
    setPageInput('1');
    knownFields.current = [];
    setFieldOptions([]);
    runSimple();
  }, [project.projectId, collectionPath]);

  // 「フィールド」の候補。読み込み済みの分から拾う（読み込んでいないドキュメントにしか無い
  // フィールドは出ない。その時は、手で打つ）
  const loadedOptions = useMemo(() => collectFieldOptions(docs), [docs]);

  useEffect(() => {
    const seen = new Set(knownFields.current.map(o => `${o.field}\n${o.kind}`));
    let added = false;
    for (const option of loadedOptions) {
      if (!seen.has(`${option.field}\n${option.kind}`)) {
        knownFields.current.push(option);
        added = true;
      }
    }
    if (added) {
      setFieldOptions(sortFieldOptions([...knownFields.current]));
    }
  }, [loadedOptions]);

  // 候補を押した時。フィールドと一緒に、型も合わせる（配列・マップなどは「自動」）
  function onPickField(option: FieldOption) {
    setField(option.field);
    setValueType(
      option.kind === 'string' ||
        option.kind === 'number' ||
        option.kind === 'boolean' ||
        option.kind === 'timestamp'
        ? option.kind
        : 'auto',
    );
  }

  async function onPickDateTime(which: 1 | 2) {
    try {
      const picked = await pickDateTime(which === 1 ? value : value2);
      if (picked !== null) {
        (which === 1 ? setValue : setValue2)(picked);
      }
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.documentList.genericFailed'), err.message ?? String(e));
    }
  }

  const docsRef = useRef(docs);
  docsRef.current = docs;

  // 詳細で保存・削除をしたら、読み込み済みの一覧の、その行だけを合わせる
  // （読み直さない。検索の条件・ページ・スクロール位置を残す）
  useEffect(() => {
    return onDocumentChange(change => {
      if (change.projectId !== project.projectId) {
        return;
      }
      const fieldsJson = change.fieldsJson;
      if (fieldsJson !== null) {
        setDocs(current =>
          current.map(doc => (doc.path === change.documentPath ? {...doc, fieldsJson} : doc)),
        );
        return;
      }
      if (!docsRef.current.some(doc => doc.path === change.documentPath)) {
        return;
      }
      setDocs(current => current.filter(doc => doc.path !== change.documentPath));
      setTotalCount(count => (count === null ? count : Math.max(0, count - 1)));
    });
  }, [project.projectId]);

  const pageCount = Math.max(1, Math.ceil(docs.length / QUERY_PAGE_SIZE));

  // 最後のページの最後の1件が消えた時は、1つ前のページへ下がる
  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
      setPageInput(String(pageCount));
    }
  }, [page, pageCount]);
  const pageDocs = useMemo(() => {
    const start = (page - 1) * QUERY_PAGE_SIZE;
    return docs.slice(start, start + QUERY_PAGE_SIZE);
  }, [docs, page]);

  // 検索を1回実行する。keepPage: 読み直しの時は、いまのページに留まる
  // （件数が減ってページが無くなった時は、上の効果が最後のページへ下げる）
  async function execute(query: boolean, keepPage: boolean) {
    setBusy(true);
    subRequest.current += 1;
    setSubCount(null);
    try {
      const result = query
        ? await runJsQuery(project.projectId, jsSource, t)
        : await runQuery(
            project.projectId,
            collectionPath,
            scope === 'group',
            field,
            operator,
            value,
            fetchAll,
            resolveValueType(valueType, field, knownFields.current),
            second,
          );
      setDocs(result.documents);
      setTotalCount(result.totalCount);
      if (!query && scope === 'collection' && field.trim() === '') {
        countSubcollections(result.totalCount);
      }
      setPartialOf(result.partial ? result.sourceCount ?? null : null);
      setPartialLimit(result.partialLimit ?? null);
      if (!keepPage) {
        setPage(1);
        setPageInput('1');
      }
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(
        t(query ? 'explorer.documentList.runFailed' : 'explorer.documentList.searchFailed'),
        err.message ?? String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  // own: このコレクション自体の件数。全体（このコレクション＋サブコレクション）から引く
  function countSubcollections(own: number | null) {
    const id = subRequest.current;
    setSubCount('loading');
    countWithDescendants(project.projectId, collectionPath)
      .then(all => {
        if (id === subRequest.current) {
          setSubCount(own == null ? 'failed' : Math.max(0, all - own));
        }
      })
      .catch(() => {
        if (id === subRequest.current) {
          setSubCount('failed');
        }
      });
  }

  // 「全件」で、読む件数が上限（500件）を超える時だけ、件数を見せて確かめる
  async function confirmFetchAll(): Promise<boolean> {
    let count: number;
    setBusy(true);
    try {
      count = await countQuery(
        project.projectId,
        collectionPath,
        scope === 'group',
        field,
        operator,
        value,
        resolveValueType(valueType, field, knownFields.current),
        second,
      );
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.documentList.searchFailed'), err.message ?? String(e));
      return false;
    } finally {
      setBusy(false);
    }
    if (count <= QUERY_FETCH_MAX) {
      return true;
    }
    return new Promise(resolve => {
      Alert.alert(t('query.fetchAllConfirmTitle'), t('query.fetchAllConfirm', {count}), [
        {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
        {text: t('common.execute'), onPress: () => resolve(true)},
      ]);
    });
  }

  // 「Run」と、ヘッダーの「↻」の共通の入口。
  // queryモードの確認は、どちらから来ても同じ（read-only は止める → 確認 → 実行）。
  // 違いは、「↻」はいまのページに留まることだけ
  async function run(keepPage: boolean) {
    if (busy) {
      return;
    }
    if (mode === 'query') {
      if (project.readOnly) {
        Alert.alert(t('safety.readOnlyError'));
        return;
      }
      const ok = await confirmWrite(t, t('explorer.documentList.jsRunConfirm'));
      if (!ok) {
        return;
      }
    }
    if (mode === 'simple' && fetchAll && !(await confirmFetchAll())) {
      return;
    }
    await execute(mode === 'query', keepPage);
  }

  // 書き込みの後・画面を開いた時の読み込み。モードに関係なく、simple の条件で読む
  function runSimple() {
    return execute(false, false);
  }

  function goPage(next: number) {
    const n = Math.min(pageCount, Math.max(1, next));
    setPage(n);
    setPageInput(String(n));
  }

  async function runWrite(message: string, fn: () => Promise<void>) {
    try {
      assertWritable(t, project.readOnly);
      const ok = await confirmWrite(t, message);
      if (!ok) {
        return;
      }
      setBusy(true);
      await fn();
      setForm(null);
      await runSimple();
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.documentList.writeFailed'), err.message ?? String(e));
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!form || busy) {
      return;
    }
    try {
      const id = assertSegment(t, form.documentId, t('common.documentId'));
      const dest = joinPath(collectionPath, id);
      if (form.kind === 'add') {
        await runWrite(t('explorer.confirmCreate', {path: dest}), () =>
          createDocument(project.projectId, collectionPath, id, '{}'),
        );
        return;
      }
      if (form.from.path === dest) {
        Alert.alert(t('explorer.documentList.sameIdError'));
        return;
      }
      const json = await getDocument(project.projectId, form.from.path);
      await runWrite(
        t('explorer.documentList.duplicateConfirm', {from: form.from.path, to: dest}),
        () => createDocument(project.projectId, collectionPath, id, json),
      );
    } catch (e) {
      const err = e as {message?: string};
      Alert.alert(t('explorer.documentList.genericFailed'), err.message ?? String(e));
    }
  }

  function onDelete(doc: ExplorerDoc) {
    if (busy) {
      return;
    }
    runWrite(t('explorer.documentList.deleteConfirm', {path: doc.path}), () =>
      deleteDocument(project.projectId, doc.path),
    );
  }

  function onScope(next: QueryScope) {
    setScope(next);
    setJsSource(
      next === 'group'
        ? groupJsSource(collectionPath)
        : defaultJsSource(collectionPath),
    );
  }

  const rangeFrom = docs.length === 0 ? 0 : (page - 1) * QUERY_PAGE_SIZE + 1;
  const rangeTo = Math.min(page * QUERY_PAGE_SIZE, docs.length);

  if (pickSnippets) {
    return (
      <SnippetPickScreen
        textareaFocused
        onBack={() => setPickSnippets(false)}
        onPicked={body => {
          setJsSource(insertAt(jsSource, jsSel, body));
          setPickSnippets(false);
        }}
      />
    );
  }

  return (
    <ScreenFrame
      title={lastSegment(collectionPath)}
      path={fullPath(project.label || project.projectId, collectionPath)}
      onBack={onBack}
      onReload={() => run(true)}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.panelWrap}>
          <View style={[styles.panel, frame]}>
          <Latch
            side="right"
            label={headerOpen ? '−' : '+'}
            onPress={() => setHeaderOpen(v => !v)}
          />
          {headerOpen ? (
            <>
              <View style={styles.panelBody}>
                <QueryHeader
                  mode={mode}
                  scope={scope}
                  fetchAll={fetchAll}
                  field={field}
                  fieldOptions={fieldOptions}
                  operator={operator}
                  value={value}
                  operator2={operator2}
                  value2={value2}
                  valueType={valueType}
                  jsSource={jsSource}
                  totalCount={totalCount}
                  subCount={subCount}
                  loadedCount={docs.length}
                  partialOf={partialOf}
                  partialLimit={partialLimit}
                  busy={busy}
                  onMode={setMode}
                  onScope={onScope}
                  onFetchAll={setFetchAll}
                  onField={setField}
                  onPickField={onPickField}
                  onValueType={setValueType}
                  onPickDateTime={onPickDateTime}
                  onOperator2={setOperator2}
                  onValue2={setValue2}
                  onOperator={setOperator}
                  onValue={setValue}
                  onJsSource={setJsSource}
                  onJsSelection={setJsSel}
                  onOpenSnippets={() => setPickSnippets(true)}
                  onRun={() => run(false)}
                />
              </View>
              {project.readOnly ? null : (
                <>
                  <View style={[styles.rule, {backgroundColor: frameLine}]} />
                  <View style={styles.panelBody}>
                    {form ? (
                      <View>
                        <TextInput
                          style={[
                            styles.input,
                            ink,
                            {borderBottomColor: line},
                          ]}
                          value={form.documentId}
                          onChangeText={documentId =>
                            setForm({...form, documentId})
                          }
                          placeholder={t('common.documentId')}
                          placeholderTextColor={inkQuiet.color}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <View style={styles.row}>
                          <Pressable onPress={() => setForm(null)} hitSlop={8}>
                            <Text style={[styles.link, inkQuiet]}>{t('common.cancel')}</Text>
                          </Pressable>
                          <Pressable
                            onPress={onSubmit}
                            disabled={busy}
                            hitSlop={8}>
                            <Text style={[styles.link, inkQuiet]}>
                              {form.kind === 'add' ? t('common.create') : t('common.duplicate')}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setForm({kind: 'add', documentId: ''})}
                        style={[styles.add, fill]}
                        disabled={busy}>
                        <Text style={[styles.addLabel, inkOnFill]}>{t('common.add')}</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={styles.panelBody}>
              <Text style={[styles.summary, inkQuiet]}>
                {mode === 'simple' ? 'simple' : 'query'}
                {' · '}
                {scope === 'group' ? 'collection group' : t('common.thisCollection')}
                {' · '}
                {totalCount == null ? '—' : t('common.resultCount', {count: totalCount})}
                {docs.length >= QUERY_FETCH_MAX
                  ? t('common.maxReached', {max: QUERY_FETCH_MAX})
                  : ''}
              </Text>
            </View>
          )}
          </View>
        </View>

        <View style={styles.pager}>
          <Pressable onPress={() => goPage(1)} disabled={page <= 1}>
            <Text style={[styles.link, inkQuiet]}>{'<<'}</Text>
          </Pressable>
          <Pressable onPress={() => goPage(page - 1)} disabled={page <= 1}>
            <Text style={[styles.link, inkQuiet]}>{'<'}</Text>
          </Pressable>
          <TextInput
            style={[styles.pageInput, ink, {borderBottomColor: line}]}
            value={pageInput}
            onChangeText={setPageInput}
            onSubmitEditing={() => goPage(Number(pageInput) || 1)}
            keyboardType="number-pad"
          />
          <Pressable onPress={() => goPage(Number(pageInput) || page)}>
            <Text style={[styles.link, inkQuiet]}>{t('common.move')}</Text>
          </Pressable>
          <Pressable onPress={() => goPage(page + 1)} disabled={page >= pageCount}>
            <Text style={[styles.link, inkQuiet]}>{'>'}</Text>
          </Pressable>
          <Pressable onPress={() => goPage(pageCount)} disabled={page >= pageCount}>
            <Text style={[styles.link, inkQuiet]}>{'>>'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.range, inkQuiet]}>
          {docs.length === 0
            ? busy
              ? t('common.loading')
              : t('explorer.documentList.emptyNoDocuments')
            : t('explorer.documentList.rangeSuffix', {
                from: rangeFrom,
                to: rangeTo,
                total: totalCount ?? docs.length,
              })}
        </Text>

        {pageDocs.map(doc => (
          <View key={doc.path} style={[styles.card, hair]}>
            <Pressable onPress={() => onOpenDocument({id: doc.id, path: doc.path})}>
              <Text style={[styles.cardTitle, ink]}>{doc.id}</Text>
              {doc.fieldsJson ? (
                <Text style={[styles.fields, inkQuiet]}>
                  {previewFields(doc.fieldsJson)}
                </Text>
              ) : null}
            </Pressable>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  onOpenDocumentInNewTab({id: doc.id, path: doc.path})
                }
                hitSlop={8}>
                <Text style={[styles.link, inkQuiet]}>{t('common.openInNewTab')}</Text>
              </Pressable>
              {project.readOnly ? null : (
                <>
                  <Pressable
                    onPress={() => {
                      setHeaderOpen(true);
                      setForm({
                        kind: 'duplicate',
                        from: {id: doc.id, path: doc.path},
                        documentId: `${doc.id}_copy`,
                      });
                    }}
                    hitSlop={8}>
                    <Text style={[styles.link, inkQuiet]}>{t('common.duplicate')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete({id: doc.id, path: doc.path})}
                    hitSlop={8}>
                    <Text style={[styles.link, inkQuiet]}>{t('common.delete')}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
      <BusyOverlay visible={busy} inline />
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  panelWrap: {
    marginBottom: 16,
  },
  panel: {
    overflow: 'hidden',
  },
  panelBody: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
  },
  rule: {
    height: 1,
    marginHorizontal: 0,
  },
  summary: {
    fontSize: 15,
  },
  add: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  link: {
    fontSize: 15,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pageInput: {
    width: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    textAlign: 'center',
    fontSize: 15,
    paddingVertical: 4,
  },
  range: {
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 16,
  },
  fields: {
    marginTop: 8,
    fontSize: 12,
  },
});
