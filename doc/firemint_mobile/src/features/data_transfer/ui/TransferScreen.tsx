import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {ensureCloudAccess} from '../../connection/native/google_auth';
import {listCollections} from '../../explorer/native/explorer';
import {listProjects} from '../../workspace/native/workspace';
import type {WorkspaceProject} from '../../workspace/shared/project';
import {assertWritable, confirmWrite} from '../../../shared/safety/confirm_write';
import {useLocale, type StringKey} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {useTheme} from '../../../shared/settings/theme';

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;
import {
  cancelTransfer,
  discardExportLocation,
  exportDump,
  getProgress,
  importSourceProject,
  importDump,
  pickExportLocation,
  pickImportFile,
  verifyDumpDetailed,
  verifyDumpQuick,
} from '../native/transfer';
import type {ImportResult} from '../native/transfer';
import type {ExportScope, ExportTarget, QuickVerifyRow, VerifyRow} from '../shared/transfer';
import {QuickVerifyTable} from './QuickVerifyTable';
import {VerifyTable} from './VerifyTable';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type TransferScreenProps = {
  onBack: () => void;
};

type Step =
  | {kind: 'choice'}
  | {kind: 'export_scope'}
  | {kind: 'export_project'; scope: ExportScope}
  | {kind: 'export_roots'; project: WorkspaceProject}
  | {kind: 'export_collection'; project: WorkspaceProject}
  | {kind: 'export_group'; project: WorkspaceProject}
  | {kind: 'export_go'; project: WorkspaceProject; target: ExportTarget}
  | {kind: 'import_project'}
  | {kind: 'import_go'; project: WorkspaceProject};

// ヘッダーに出す、いまの段階の名前
const STEP_TITLE: Record<Step['kind'], StringKey> = {
  choice: 'common.transferTitle',
  export_scope: 'data_transfer.exportLabel',
  export_project: 'data_transfer.projectLabel',
  export_roots: 'data_transfer.rootsLabel',
  export_collection: 'data_transfer.collectionLabel',
  export_group: 'data_transfer.groupLabel',
  export_go: 'data_transfer.exportLabel',
  import_project: 'data_transfer.projectLabel',
  import_go: 'data_transfer.importLabel',
};

function suggestedExportName(
  project: WorkspaceProject,
  target: ExportTarget,
  json: boolean,
): string {
  const ext = json ? 'jsonl' : 'zip';
  switch (target.kind) {
    case 'project':
      return `export-project-${project.projectId}.${ext}`;
    case 'collection':
      return `export-collection-${target.path.split('/').pop()}.${ext}`;
    case 'group':
      return `export-group-${target.collectionId}.${ext}`;
  }
}

// 「出す」画面に出す、範囲の説明
function targetText(t: TranslateFn, target: ExportTarget): string {
  switch (target.kind) {
    case 'project':
      return t('data_transfer.rootsSelected', {count: target.roots.length});
    case 'collection':
      return target.path;
    case 'group':
      return `${t('data_transfer.groupLabel')}: ${target.collectionId}`;
  }
}

// ファイルが壊れている時（CORRUPT）は、画面の言葉で出す
function errorText(t: TranslateFn, e: unknown): string {
  const err = e as {code?: string; message?: string};
  return err.code === 'CORRUPT' ? t('data_transfer.corrupt') : err.message ?? String(e);
}

function formatImportResult(t: TranslateFn, r: ImportResult): string {
  const lines = [
    t('data_transfer.importResult', {
      total: r.total,
      imported: r.imported,
      skipped: r.skipped,
      failed: r.failed,
    }),
  ];
  if (r.existingSamples.length > 0) {
    lines.push('', t('data_transfer.importExisting'), ...r.existingSamples);
  }
  if (r.stoppedError && !r.cancelled) {
    lines.push('', t('data_transfer.importStoppedReason', {reason: r.stoppedError}));
  }
  return lines.join('\n');
}

function formatProgress(t: TranslateFn, p: {done: number; total: number}): string {
  if (p.total >= 0) {
    return t('data_transfer.progressRange', {done: p.done, total: p.total});
  }
  if (p.done > 0) {
    return t('data_transfer.progressCounting', {done: p.done});
  }
  return t('common.processing');
}

export function TransferScreen({onBack}: TransferScreenProps) {
  const styles = useScaledStyles(baseStyles, ['check']);
  const {hair, ink, inkQuiet, fill, inkOnFill, frame} = useTheme();
  const {t} = useLocale();
  const [steps, setSteps] = useState<Step[]>([{kind: 'choice'}]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [zipPath, setZipPath] = useState('');
  // インポートの書き方。最初は追記（002_007 json）
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
  const [zipName, setZipName] = useState('');
  const [quickRows, setQuickRows] = useState<QuickVerifyRow[] | null>(null);
  const [rows, setRows] = useState<VerifyRow[] | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportDestUri, setExportDestUri] = useState('');
  // エクスポートの形式。公式ダンプ（zip）か JSON Lines（.jsonl）か（002_007 json）
  const [exportFormat, setExportFormat] = useState<'dump' | 'json'>('dump');
  const [exportDestName, setExportDestName] = useState('');
  const [progress, setProgress] = useState<{done: number; total: number} | null>(null);
  // 実行中のものが、中止できるもの（エクスポート・インポート）か
  const [cancellable, setCancellable] = useState(false);
  // プロジェクトで出すルートコレクション（初めは全部）
  const [selectedRoots, setSelectedRoots] = useState<string[]>([]);
  // グループの ID（手で入力する分）
  const [groupInput, setGroupInput] = useState('');

  // 選んだ保存先が変わった時（選び直し・戻る）と、画面を離れた時に、前の保存先が空のままなら消す
  // （保存先を選ぶと、その時点で空のファイルができる。001_008_todo 項目 5）
  useEffect(() => {
    if (!exportDestUri) {
      return;
    }
    return () => {
      discardExportLocation(exportDestUri).catch(() => {});
    };
  }, [exportDestUri]);

  useEffect(() => {
    if (!busy) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const id = setInterval(() => {
      getProgress()
        .then(p => {
          if (!cancelled) {
            setProgress(p);
          }
        })
        .catch(() => {});
    }, 800);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [busy]);

  const step = steps[steps.length - 1] ?? {kind: 'choice'};

  useEffect(() => {
    if (step.kind === 'export_project' || step.kind === 'import_project') {
      listProjects()
        .then(setProjects)
        .catch(e => Alert.alert(t('workspace.projectList.loadFailed'), String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  // ルートコレクションの一覧を使う段階（コレクション・ルートの選択・グループの候補）
  const collectionProjectId =
    step.kind === 'export_collection' ||
    step.kind === 'export_roots' ||
    step.kind === 'export_group'
      ? step.project.projectId
      : '';

  useEffect(() => {
    if (!collectionProjectId) {
      return;
    }
    setBusy(true);
    ensureCloudAccess()
      .then(() => listCollections(collectionProjectId, ''))
      .then(ids => {
        setCollectionIds(ids);
        setSelectedRoots(ids);
      })
      .catch(e => {
        const err = e as {code?: string; message?: string};
        if (err.code !== 'CANCELLED') {
          Alert.alert(t('explorer.collectionList.loadFailed'), err.message ?? String(e));
        }
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionProjectId]);

  function go(next: Step) {
    setSteps(cur => [...cur, next]);
  }

  function back() {
    if (steps.length <= 1) {
      onBack();
      return;
    }
    setQuickRows(null);
    setRows(null);
    setVerified(false);
    setZipPath('');
    setZipName('');
    setExportDestUri('');
    setExportDestName('');
    setSteps(cur => cur.slice(0, -1));
  }

  async function onPickExportDest(project: WorkspaceProject, target: ExportTarget) {
    if (busy) {
      return;
    }
    try {
      const json = exportFormat === 'json';
      const picked = await pickExportLocation(suggestedExportName(project, target, json), json);
      // 既に中身のあるファイルを選んだ時は、上書きしてよいか聞く
      if (picked.size > 0 && !(await confirmOverwrite(picked.name))) {
        return;
      }
      setExportDestUri(picked.uri);
      setExportDestName(picked.path);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('common.selectFailed'), err.message ?? String(e));
      }
    }
  }

  function confirmOverwrite(name: string): Promise<boolean> {
    return new Promise(resolve => {
      Alert.alert(
        t('data_transfer.overwriteTitle'),
        t('data_transfer.overwriteMessage', {name}),
        [
          {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
          {text: t('data_transfer.overwrite'), style: 'destructive', onPress: () => resolve(true)},
        ],
        {cancelable: true, onDismiss: () => resolve(false)},
      );
    });
  }

  async function onPickFile() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const picked = await pickImportFile();
      setZipPath(picked.path);
      setZipName(picked.displayPath);
      setVerified(false);
      setQuickRows(null);
      setRows(null);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('common.selectFailed'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onExport(project: WorkspaceProject, target: ExportTarget) {
    if (busy) {
      return;
    }
    setBusy(true);
    setCancellable(true);
    try {
      await ensureCloudAccess();
      const out = await exportDump(
        project.projectId,
        target,
        exportDestUri || null,
        exportFormat === 'json',
      );
      Alert.alert(t('data_transfer.exportDoneTitle'), out.path);
    } catch (e) {
      // 選んだ保存先は、失敗した時に消えている。選び直してもらう
      setExportDestUri('');
      setExportDestName('');
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('data_transfer.exportFailed'), err.message ?? String(e));
      }
    } finally {
      setBusy(false);
      setCancellable(false);
    }
  }

  async function onVerifyQuick(project: WorkspaceProject) {
    if (busy) {
      return;
    }
    const path = zipPath.trim();
    if (!path) {
      Alert.alert(t('data_transfer.noFileTitle'), t('data_transfer.noFileMessage'));
      return;
    }
    const ok = await new Promise<boolean>(resolve => {
      Alert.alert(
        t('data_transfer.quickVerifyButton'),
        t('data_transfer.quickVerifyConfirm'),
        [
          {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
          {text: t('common.execute'), onPress: () => resolve(true)},
        ],
      );
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await ensureCloudAccess();
      setRows(null);
      setQuickRows(await verifyDumpQuick(project.projectId, path));
      setVerified(true);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('data_transfer.verifyFailed'), errorText(t, e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyDetailed(project: WorkspaceProject) {
    if (busy) {
      return;
    }
    const path = zipPath.trim();
    if (!path) {
      Alert.alert(t('data_transfer.noFileTitle'), t('data_transfer.noFileMessage'));
      return;
    }
    const ok = await new Promise<boolean>(resolve => {
      Alert.alert(
        t('data_transfer.detailedVerifyButton'),
        t('data_transfer.detailedVerifyConfirm'),
        [
          {text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false)},
          {text: t('common.execute'), onPress: () => resolve(true)},
        ],
      );
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await ensureCloudAccess();
      setQuickRows(null);
      setRows(await verifyDumpDetailed(project.projectId, path));
      setVerified(true);
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('data_transfer.verifyFailed'), errorText(t, e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onImport(project: WorkspaceProject) {
    if (busy) {
      return;
    }
    const path = zipPath.trim();
    if (!path) {
      Alert.alert(t('data_transfer.noFileTitle'), t('data_transfer.noFileMessage'));
      return;
    }
    try {
      assertWritable(t, project.readOnly);
    } catch (e) {
      Alert.alert(t('common.actionBlocked'), String(e));
      return;
    }
    if (!verified) {
      const skip = await confirmWrite(t, t('data_transfer.skipVerifyConfirm'));
      if (!skip) {
        return;
      }
    }
    // 別のプロジェクトからエクスポートしたファイルの時は、確かめる。
    // JSON の見出しが不正な時は、ここで止める（書き始める前）
    let source = '';
    try {
      source = await importSourceProject(path);
    } catch (e) {
      const err = e as {code?: string};
      if (err.code === 'TRANSFER_FAILED') {
        Alert.alert(t('data_transfer.importFailed'), errorText(t, e));
        return;
      }
      source = '';
    }
    if (source && source !== project.projectId) {
      const other = await confirmWrite(
        t,
        t('data_transfer.otherProjectConfirm', {
          source,
          dest: project.label || project.projectId,
        }),
      );
      if (!other) {
        return;
      }
    }
    const overwrite = importMode === 'overwrite';
    const ok = await confirmWrite(
      t,
      t(overwrite ? 'data_transfer.importConfirmOverwrite' : 'data_transfer.importConfirmAppend', {
        name: project.label || project.projectId,
      }),
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    setCancellable(true);
    try {
      await ensureCloudAccess();
      const result = await importDump(project.projectId, path, overwrite);
      Alert.alert(
        t(
          result.cancelled
            ? 'data_transfer.importCancelledTitle'
            : result.stoppedError
            ? 'data_transfer.importStoppedTitle'
            : 'data_transfer.importDoneTitle',
        ),
        formatImportResult(t, result),
      );
    } catch (e) {
      const err = e as {code?: string; message?: string};
      if (err.code !== 'CANCELLED') {
        Alert.alert(t('data_transfer.importFailed'), errorText(t, e));
      }
    } finally {
      setBusy(false);
      setCancellable(false);
    }
  }

  return (
    <ScreenFrame title={t(STEP_TITLE[step.kind])} onBack={back}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {step.kind === 'choice' ? (
          <>
            <Pressable style={[styles.card, hair]} onPress={() => go({kind: 'import_project'})}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.importLabel')}</Text>
            </Pressable>
            <Pressable style={[styles.card, hair]} onPress={() => go({kind: 'export_scope'})}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.exportLabel')}</Text>
            </Pressable>
          </>
        ) : null}
        {step.kind === 'export_scope' ? (
          <>
            <Pressable
              style={[styles.card, hair]}
              onPress={() => go({kind: 'export_project', scope: 'project'})}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.projectLabel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.card, hair]}
              onPress={() => go({kind: 'export_project', scope: 'collection'})}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.collectionLabel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.card, hair]}
              onPress={() => go({kind: 'export_project', scope: 'group'})}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.groupLabel')}</Text>
            </Pressable>
          </>
        ) : null}
        {step.kind === 'export_project' || step.kind === 'import_project' ? (
          <>
            {projects.map(p => (
              <Pressable
                key={p.projectId}
                style={[styles.card, hair]}
                onPress={() => {
                  if (step.kind === 'import_project') {
                    setZipPath('');
                    setZipName('');
                    setQuickRows(null);
                    setRows(null);
                    setVerified(false);
                    setImportMode('append');
                    go({kind: 'import_go', project: p});
                    return;
                  }
                  setCollectionIds([]);
                  setSelectedRoots([]);
                  setGroupInput('');
                  if (step.scope === 'project') {
                    go({kind: 'export_roots', project: p});
                    return;
                  }
                  if (step.scope === 'group') {
                    go({kind: 'export_group', project: p});
                    return;
                  }
                  go({kind: 'export_collection', project: p});
                }}>
                <Text style={[styles.cardTitle, ink]}>{p.label || p.projectId}</Text>
                {p.readOnly ? <Text style={[styles.meta, inkQuiet]}>{t('common.readOnly')}</Text> : null}
              </Pressable>
            ))}
          </>
        ) : null}
        {step.kind === 'export_collection' ? (
          <>
            <Text style={[styles.project, inkQuiet]} numberOfLines={1}>
              {step.project.label || step.project.projectId}
            </Text>
            {busy ? <Text style={[styles.meta, inkQuiet]}>{t('common.loading')}</Text> : null}
            {collectionIds.map(id => (
              <Pressable
                key={id}
                style={[styles.card, hair]}
                onPress={() =>
                  go({
                    kind: 'export_go',
                    project: step.project,
                    target: {kind: 'collection', path: id, includeSubcollections: false},
                  })
                }>
                <Text style={[styles.cardTitle, ink]}>{id}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
        {step.kind === 'export_roots' ? (
          <>
            <Text style={[styles.project, inkQuiet]} numberOfLines={1}>
              {step.project.label || step.project.projectId}
            </Text>
            {busy ? <Text style={[styles.meta, inkQuiet]}>{t('common.loading')}</Text> : null}
            {collectionIds.length > 0 ? (
              <Pressable
                style={styles.checkRow}
                onPress={() =>
                  setSelectedRoots(
                    selectedRoots.length === collectionIds.length ? [] : collectionIds,
                  )
                }
                hitSlop={4}>
                <Text style={[styles.check, ink]}>
                  {selectedRoots.length === collectionIds.length ? '☑' : '☐'}
                </Text>
                <Text style={[styles.link, ink]}>
                  {t('data_transfer.selectAll', {
                    selected: selectedRoots.length,
                    total: collectionIds.length,
                  })}
                </Text>
              </Pressable>
            ) : null}
            {collectionIds.map(id => {
              const on = selectedRoots.includes(id);
              return (
                <Pressable
                  key={id}
                  style={styles.checkRow}
                  onPress={() =>
                    setSelectedRoots(
                      on ? selectedRoots.filter(r => r !== id) : [...selectedRoots, id],
                    )
                  }
                  hitSlop={4}>
                  <Text style={[styles.check, ink]}>{on ? '☑' : '☐'}</Text>
                  <Text style={[styles.cardTitle, ink]}>{id}</Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.run, fill, selectedRoots.length === 0 ? styles.runBusy : null]}
              disabled={selectedRoots.length === 0}
              onPress={() =>
                go({
                  kind: 'export_go',
                  project: step.project,
                  // 一覧の順に並べる
                  target: {
                    kind: 'project',
                    roots: collectionIds.filter(id => selectedRoots.includes(id)),
                  },
                })
              }>
              <Text style={[styles.runLabel, inkOnFill]}>{t('common.next')}</Text>
            </Pressable>
          </>
        ) : null}
        {step.kind === 'export_group' ? (
          <>
            <Text style={[styles.project, inkQuiet]} numberOfLines={1}>
              {step.project.label || step.project.projectId}
            </Text>
            <Text style={[styles.meta, inkQuiet]}>{t('data_transfer.groupInputCaption')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, frame, ink]}
                value={groupInput}
                onChangeText={setGroupInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.run, fill, !groupInput.trim() || groupInput.includes('/') ? styles.runBusy : null]}
                disabled={!groupInput.trim() || groupInput.includes('/')}
                onPress={() =>
                  go({
                    kind: 'export_go',
                    project: step.project,
                    target: {kind: 'group', collectionId: groupInput.trim()},
                  })
                }>
                <Text style={[styles.runLabel, inkOnFill]}>{t('common.next')}</Text>
              </Pressable>
            </View>
            {busy ? <Text style={[styles.meta, inkQuiet]}>{t('common.loading')}</Text> : null}
            {collectionIds.map(id => (
              <Pressable
                key={id}
                style={[styles.card, hair]}
                onPress={() =>
                  go({
                    kind: 'export_go',
                    project: step.project,
                    target: {kind: 'group', collectionId: id},
                  })
                }>
                <Text style={[styles.cardTitle, ink]}>{id}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
        {step.kind === 'export_go' ? (
          <>
            <Text style={[styles.meta, ink]}>
              {step.project.label || step.project.projectId}
              {` / ${targetText(t, step.target)}`}
            </Text>
            {step.target.kind === 'collection' ? (
              <View style={styles.switchRow}>
                <Text style={[styles.link, ink]}>{t('data_transfer.includeSubcollections')}</Text>
                <Switch
                  value={step.target.includeSubcollections}
                  disabled={busy}
                  onValueChange={v => {
                    const target = step.target;
                    if (target.kind !== 'collection') {
                      return;
                    }
                    setSteps(cur => [
                      ...cur.slice(0, -1),
                      {...step, target: {...target, includeSubcollections: v}},
                    ]);
                  }}
                />
              </View>
            ) : null}
            <Text style={[styles.meta, inkQuiet]}>{t('data_transfer.formatLabel')}</Text>
            {(['dump', 'json'] as const).map(format => (
              <Pressable
                key={format}
                style={styles.checkRow}
                disabled={busy}
                onPress={() => {
                  if (format === exportFormat) {
                    return;
                  }
                  // 選んだ保存先は、形式（拡張子）が変わるので選び直してもらう
                  setExportFormat(format);
                  setExportDestUri('');
                  setExportDestName('');
                }}>
                <Text style={[styles.check, ink]}>{exportFormat === format ? '◉' : '○'}</Text>
                <View style={styles.modeText}>
                  <Text style={[styles.link, ink]}>
                    {t(format === 'dump' ? 'data_transfer.formatDump' : 'data_transfer.formatJson')}
                  </Text>
                  <Text style={[styles.meta, inkQuiet]}>
                    {t(
                      format === 'dump'
                        ? 'data_transfer.formatDumpNote'
                        : 'data_transfer.formatJsonNote',
                    )}
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              style={[styles.card, hair]}
              disabled={busy}
              onPress={() => onPickExportDest(step.project, step.target)}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.pickDestButton')}</Text>
              <Text style={[styles.meta, inkQuiet]} numberOfLines={2} ellipsizeMode="tail">
                {exportDestName || t('data_transfer.defaultSaveFolder')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.run, fill, busy ? styles.runBusy : null]}
              disabled={busy}
              onPress={() => onExport(step.project, step.target)}>
              <Text style={[styles.runLabel, inkOnFill]}>{t('data_transfer.exportRunButton')}</Text>
            </Pressable>
          </>
        ) : null}
        {step.kind === 'import_go' ? (
          <>
            <Text style={[styles.meta, ink]}>
              {step.project.label || step.project.projectId}
            </Text>
            <Pressable style={[styles.card, hair]} disabled={busy} onPress={onPickFile}>
              <Text style={[styles.cardTitle, ink]}>{t('data_transfer.pickFileButton')}</Text>
              <Text style={[styles.meta, inkQuiet]} numberOfLines={2} ellipsizeMode="tail">
                {zipName || t('common.unselected')}
              </Text>
            </Pressable>
            {step.project.readOnly ? null : (
              <>
                <Text style={[styles.meta, inkQuiet]}>{t('data_transfer.modeLabel')}</Text>
                {(['append', 'overwrite'] as const).map(mode => (
                  <Pressable
                    key={mode}
                    style={styles.checkRow}
                    disabled={busy}
                    onPress={() => setImportMode(mode)}>
                    <Text style={[styles.check, ink]}>{importMode === mode ? '◉' : '○'}</Text>
                    <View style={styles.modeText}>
                      <Text style={[styles.link, ink]}>
                        {t(mode === 'append' ? 'data_transfer.modeAppend' : 'data_transfer.modeOverwrite')}
                      </Text>
                      <Text style={[styles.meta, inkQuiet]}>
                        {t(
                          mode === 'append'
                            ? 'data_transfer.modeAppendNote'
                            : 'data_transfer.modeOverwriteNote',
                        )}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
            <View style={styles.actions}>
              <Pressable
                disabled={busy || !zipPath}
                onPress={() => onVerifyQuick(step.project)}
                hitSlop={8}>
                <Text style={[styles.link, !zipPath ? inkQuiet : ink]}>{t('data_transfer.quickVerifyButton')}</Text>
              </Pressable>
              <Pressable
                disabled={busy || !zipPath}
                onPress={() => onVerifyDetailed(step.project)}
                hitSlop={8}>
                <Text style={[styles.link, !zipPath ? inkQuiet : ink]}>{t('data_transfer.detailedVerifyButton')}</Text>
              </Pressable>
              {step.project.readOnly ? (
                <Text style={[styles.link, inkQuiet]}>{t('common.actionBlocked')}</Text>
              ) : (
                <Pressable
                  disabled={busy || !zipPath}
                  onPress={() => onImport(step.project)}
                  hitSlop={8}>
                  <Text style={[styles.link, !zipPath ? inkQuiet : ink]}>{t('common.execute')}</Text>
                </Pressable>
              )}
            </View>
            {quickRows ? <QuickVerifyTable rows={quickRows} /> : null}
            {rows ? <VerifyTable rows={rows} /> : null}
          </>
        ) : null}
      </ScrollView>
      <Modal visible={busy} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, frame]}>
            <ActivityIndicator size="large" color={ink.color} />
            <Text style={[styles.modalText, ink]}>
              {progress ? formatProgress(t, progress) : t('common.processing')}
            </Text>
            {cancellable ? (
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  cancelTransfer().catch(() => {});
                }}
                hitSlop={8}>
                <Text style={[styles.link, ink]}>{t('data_transfer.cancelButton')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  project: {
    fontSize: 13,
    marginBottom: 4,
  },
  card: {
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  link: {
    fontSize: 15,
  },
  run: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  runBusy: {
    opacity: 0.6,
  },
  runLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    minWidth: 200,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  modalText: {
    fontSize: 14,
    marginTop: 16,
  },
  cancel: {
    marginTop: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  check: {
    fontSize: 20,
    width: 32,
  },
  modeText: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
