import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useLocale} from '../../../../shared/i18n/i18n';
import {useTheme} from '../../../../shared/settings/theme';
import {
  FIELD_KIND_LABEL,
  QUERY_FETCH_MAX,
  QUERY_OPERATORS,
  QUERY_RANGE_OPERATORS,
  QUERY_VALUE_TYPES,
  isRangeOperator,
  type FieldOption,
  type QueryMode,
  type QueryOperator,
  type QueryScope,
  type QueryValueType,
} from '../../shared/query';
import {useScaledStyles} from '../../../../shared/settings/text_scale';

type QueryHeaderProps = {
  mode: QueryMode;
  scope: QueryScope;
  fetchAll: boolean;
  field: string;
  // 「フィールド」の候補（読み込み済みのドキュメントから拾ったもの）
  fieldOptions: FieldOption[];
  operator: QueryOperator;
  value: string;
  // 同じフィールドの、2つ目の条件。足していない時は operator2 が null
  operator2: QueryOperator | null;
  value2: string;
  valueType: QueryValueType;
  jsSource: string;
  totalCount: number | null;
  // サブコレクション（どの深さも）の件数。絞っていない時だけ数える。数えない時は null
  subCount: number | 'loading' | 'failed' | null;
  loadedCount: number;
  // 先頭の一部しか見ていない検索だった時の、コレクション全体の件数。そうでなければ null
  partialOf: number | null;
  // query モードの JS で、limit で取った件数の中だけを端末で絞り込んだ時の limit。そうでなければ null
  partialLimit: number | null;
  busy: boolean;
  onMode: (mode: QueryMode) => void;
  onScope: (scope: QueryScope) => void;
  onFetchAll: (fetchAll: boolean) => void;
  onField: (field: string) => void;
  onPickField: (option: FieldOption) => void;
  onValueType: (valueType: QueryValueType) => void;
  onPickDateTime: (which: 1 | 2) => void;
  onOperator2: (operator: QueryOperator | null) => void;
  onValue2: (value: string) => void;
  onOperator: (operator: QueryOperator) => void;
  onValue: (value: string) => void;
  onJsSource: (source: string) => void;
  onJsSelection: (sel: {start: number; end: number}) => void;
  onOpenSnippets: () => void;
  onRun: () => void;
};

export function QueryHeader(props: QueryHeaderProps) {
  const styles = useScaledStyles(baseStyles);
  const {line, ink, inkQuiet, fill, inkOnFill} = useTheme();
  const {t} = useLocale();
  const unary = props.operator === 'exists' || props.operator === 'not-exists';
  // 「部分一致」は文字として含むかを見るだけなので、型は関係ない
  const typed = !unary && props.operator !== 'contains';
  const countLabel =
    props.totalCount == null ? '—' : t('common.resultCount', {count: props.totalCount});

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          style={[styles.tab, props.mode === 'simple' ? fill : null]}
          onPress={() => props.onMode('simple')}>
          <Text style={[styles.tabText, props.mode === 'simple' ? inkOnFill : ink]}>
            simple
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, props.mode === 'query' ? fill : null]}
          onPress={() => props.onMode('query')}>
          <Text style={[styles.tabText, props.mode === 'query' ? inkOnFill : ink]}>
            query
          </Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          style={[styles.tab, props.scope === 'collection' ? fill : null]}
          onPress={() => props.onScope('collection')}>
          <Text
            style={[
              styles.tabText,
              props.scope === 'collection' ? inkOnFill : ink,
            ]}>
            {t('common.thisCollection')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, props.scope === 'group' ? fill : null]}
          onPress={() => props.onScope('group')}>
          <Text
            style={[
              styles.tabText,
              props.scope === 'group' ? inkOnFill : ink,
            ]}>
            collection group
          </Text>
        </Pressable>
      </View>
      {props.mode === 'simple' ? (
        <View>
          {/* サーバーから取ってくる件数の上限。query は、コードの limit() で決める */}
          <View style={styles.row}>
            <Pressable
              style={[styles.tab, props.fetchAll ? null : fill]}
              onPress={() => props.onFetchAll(false)}>
              <Text style={[styles.tabText, props.fetchAll ? ink : inkOnFill]}>
                {t('query.fetchLimited', {max: QUERY_FETCH_MAX})}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, props.fetchAll ? fill : null]}
              onPress={() => props.onFetchAll(true)}>
              <Text style={[styles.tabText, props.fetchAll ? inkOnFill : ink]}>
                {t('query.fetchAll')}
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.input, ink, {borderBottomColor: line}]}
            value={props.field}
            onChangeText={props.onField}
            placeholder={t('query.fieldPlaceholder')}
            placeholderTextColor={inkQuiet.color}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {props.fieldOptions.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.options}>
              {props.fieldOptions.map(option => {
                const labelKey = FIELD_KIND_LABEL[option.kind];
                return (
                  <Pressable
                    key={`${option.field}:${option.kind}`}
                    style={[styles.option, {borderColor: line}]}
                    onPress={() => props.onPickField(option)}>
                    <Text style={[styles.opText, ink]}>{option.field}</Text>
                    {labelKey ? (
                      <Text style={[styles.optionKind, inkQuiet]}>{t(labelKey)}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <View style={styles.ops}>
            {QUERY_OPERATORS.map(op => (
              <Pressable
                key={op.value}
                style={[styles.op, props.operator === op.value ? fill : null]}
                onPress={() => props.onOperator(op.value)}>
                <Text
                  style={[
                    styles.opText,
                    props.operator === op.value ? inkOnFill : ink,
                  ]}>
                  {op.labelKey ? t(op.labelKey) : op.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {typed ? (
            <View style={styles.ops}>
              {QUERY_VALUE_TYPES.map(type => (
                <Pressable
                  key={type.value}
                  style={[styles.op, props.valueType === type.value ? fill : null]}
                  onPress={() => props.onValueType(type.value)}>
                  <Text
                    style={[styles.opText, props.valueType === type.value ? inkOnFill : ink]}>
                    {t(type.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {unary ? null : (
            <View style={styles.valueRow}>
              <TextInput
                style={[styles.input, styles.valueInput, ink, {borderBottomColor: line}]}
                value={props.value}
                onChangeText={props.onValue}
                placeholder={
                  typed && props.valueType === 'timestamp'
                    ? '2026-01-01 12:00'
                    : t('query.valuePlaceholder')
                }
                placeholderTextColor={inkQuiet.color}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {typed && props.valueType === 'timestamp' ? (
                <Pressable
                  onPress={() => props.onPickDateTime(1)}
                  style={styles.calendar}
                  hitSlop={8}>
                  <Text style={styles.calendarText}>📅</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {/* 2つ目の条件。同じフィールドの範囲（例: >= A かつ < B）の時だけ足せる */}
          {isRangeOperator(props.operator) ? (
            props.operator2 === null ? (
              <Pressable
                onPress={() =>
                  props.onOperator2(props.operator.startsWith('>') ? '<' : '>=')
                }
                style={styles.addCondition}
                hitSlop={8}>
                <Text style={[styles.opText, ink]}>{t('query.addCondition')}</Text>
              </Pressable>
            ) : (
              <View>
                <View style={styles.secondHead}>
                  <Pressable onPress={() => props.onOperator2(null)} hitSlop={8}>
                    <Text style={[styles.opText, ink]}>{t('query.removeCondition')}</Text>
                  </Pressable>
                </View>
                <View style={styles.ops}>
                  {QUERY_RANGE_OPERATORS.map(op => (
                    <Pressable
                      key={op}
                      style={[styles.op, props.operator2 === op ? fill : null]}
                      onPress={() => props.onOperator2(op)}>
                      <Text style={[styles.opText, props.operator2 === op ? inkOnFill : ink]}>
                        {op}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.valueRow}>
                  <TextInput
                    style={[styles.input, styles.valueInput, ink, {borderBottomColor: line}]}
                    value={props.value2}
                    onChangeText={props.onValue2}
                    placeholder={
                      props.valueType === 'timestamp'
                        ? '2026-01-01 12:00'
                        : t('query.valuePlaceholder')
                    }
                    placeholderTextColor={inkQuiet.color}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {props.valueType === 'timestamp' ? (
                    <Pressable
                      onPress={() => props.onPickDateTime(2)}
                      style={styles.calendar}
                      hitSlop={8}>
                      <Text style={styles.calendarText}>📅</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )
          ) : null}
        </View>
      ) : (
        <View>
          <TextInput
            style={[styles.js, ink, {borderBottomColor: line}]}
            value={props.jsSource}
            onChangeText={props.onJsSource}
            onSelectionChange={e => props.onJsSelection(e.nativeEvent.selection)}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={props.onOpenSnippets} style={styles.snippet}>
            <Text style={[styles.tabText, ink]}>{t('common.snippets')}</Text>
          </Pressable>
        </View>
      )}
      <Text style={[styles.count, inkQuiet]}>
        {t('query.hitLabel', {count: countLabel})}
        {props.loadedCount > 0
          ? t('query.shownSuffix', {count: props.loadedCount})
          : ''}
      </Text>
      {props.subCount === 'loading' ? (
        <Text style={[styles.count, inkQuiet]}>{t('query.subCounting')}</Text>
      ) : props.subCount === 'failed' ? (
        <Text style={[styles.count, inkQuiet]}>{t('query.subCountFailed')}</Text>
      ) : typeof props.subCount === 'number' && props.subCount > 0 && props.totalCount != null ? (
        <Text style={[styles.count, inkQuiet]}>
          {t('query.subCount', {
            sub: props.subCount,
            total: props.totalCount + props.subCount,
          })}
        </Text>
      ) : null}
      {props.totalCount != null &&
      props.loadedCount >= QUERY_FETCH_MAX &&
      props.totalCount > props.loadedCount ? (
        <Text style={[styles.count, inkQuiet]}>
          {t('common.maxReached', {max: QUERY_FETCH_MAX}).replace(/^ · /, '')}
        </Text>
      ) : null}
      {props.partialOf != null ? (
        <Text style={[styles.count, ink]}>
          {t('query.partialNotice', {max: QUERY_FETCH_MAX, total: props.partialOf})}
        </Text>
      ) : null}
      {props.partialLimit != null ? (
        <Text style={[styles.count, ink]}>
          {t('query.partialLimitNotice', {limit: props.partialLimit})}
        </Text>
      ) : null}
      <Pressable
        style={[styles.run, fill]}
        onPress={props.onRun}
        disabled={props.busy}>
        <Text style={[styles.runText, inkOnFill]}>Run</Text>
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
  },
  input: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginBottom: 12,
  },
  ops: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  op: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 6,
    borderRadius: 8,
  },
  opText: {
    fontSize: 12,
  },
  options: {
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionKind: {
    fontSize: 11,
    marginLeft: 6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueInput: {
    flex: 1,
  },
  calendar: {
    paddingLeft: 12,
    paddingBottom: 12,
  },
  calendarText: {
    fontSize: 20,
  },
  secondHead: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  addCondition: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  js: {
    minHeight: 160,
    fontSize: 13,
    textAlignVertical: 'top',
    paddingVertical: 10,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  snippet: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 12,
  },
  count: {
    fontSize: 13,
    marginBottom: 12,
  },
  run: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  runText: {
    fontSize: 15,
  },
});
