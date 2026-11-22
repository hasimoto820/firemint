import { tr } from '@shared/i18n/shared/current'
import { useEffect, useMemo, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import {
  fileNameOf,
  folderOf,
  formatLabel,
  joinFilePath,
  lastPathSegment,
  writeModeHint
} from '@features/data_transfer/shared/imp_exp'
import type {
  ImportFileInfo,
  ImportVerifyLevel,
  ImportWriteMode,
  OfficialExportInput,
  OfficialImportValidation
} from '@features/data_transfer/shared/official'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import ImportVerifyTable from '@features/data_transfer/renderer/ui/ImportVerifyTable'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import {
  emulatorPageIntent,
  emulatorPageModeFromIntent,
  type EmulatorPageDirection,
  type EmulatorPageMode,
  type EmulatorPageTarget
} from '@features/emulator/shared/types'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'
import JobSplitLayout from '@shared/ui/JobSplitLayout'
import { confirmAction } from '@shared/ui/confirmAction'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type EmulatorPageProps = {
  mode: EmulatorPageMode
  onModeChange?: (mode: EmulatorPageMode) => void
  onClose: () => void
  onWorkspaceChanged: () => void | Promise<void>
  defaultHost?: string
  destinationPoolId?: string | null
  destinationLabel?: string | null
  job?: ScriptJobSnapshot | null
  onCancelJob?: () => void
}

function statusLabel(job: ScriptJobSnapshot): string {
  switch (job.status) {
    case 'running':
      return tr('dt.status_running')
    case 'succeeded':
      return tr('dt.status_done')
    case 'failed':
      return tr('dt.status_failed')
    case 'canceled':
      return tr('dt.status_canceled')
  }
}

function formatLogTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return date.toLocaleTimeString()
}

function ToggleBar<T extends string>({
  value,
  options,
  disabled,
  ariaLabel,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  disabled: boolean
  ariaLabel: string
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <nav className="app-nav" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
          disabled={disabled}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </nav>
  )
}

/** インポート先の「新規 ID」 */
const NEW_TARGET = '__new__'

/** Emulator のプロジェクト ID。英小文字・数字・ハイフン */
const EMULATOR_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function emulatorProjectName(entry: WorkspaceEntry): string {
  return entry.emulatorProjectId ?? entry.id
}

/** 新規 ID の最初の値。demo-import-1 から、使っていない番号 */
function nextNewProjectId(entries: WorkspaceEntry[]): string {
  const used = new Set(entries.map(emulatorProjectName))
  let index = 1
  while (used.has(`demo-import-${index}`)) {
    index += 1
  }
  return `demo-import-${index}`
}

function emulatorOptionLabel(entry: WorkspaceEntry): string {
  const name = emulatorProjectName(entry)
  return entry.label !== name ? `${entry.label} — ${name}` : name
}

function EmulatorPage({
  mode,
  onModeChange,
  defaultHost = DEFAULT_EMULATOR_HOST,
  destinationPoolId = null,
  job = null,
  onCancelJob
}: EmulatorPageProps): React.JSX.Element {
  const t = useT()
  const autocomplete = useOptionalAutocompleteApi()
  const host = defaultHost
  const { direction, target } = emulatorPageIntent(mode)
  const jobRunning = job?.status === 'running'
  /** つないでいる Emulator のプロジェクト */
  const [emulatorEntries, setEmulatorEntries] = useState<WorkspaceEntry[]>([])
  /** インポート先・エクスポートに出すもの。中にデータがある（ルートのコレクションがある）プロジェクトだけ */
  const [entriesWithData, setEntriesWithData] = useState<WorkspaceEntry[]>([])
  /** エクスポートするプロジェクト。null は左の一覧で選んでいるもの（データが無ければ先頭） */
  const [exportProjectId, setExportProjectId] = useState<string | null>(null)
  const poolId =
    entriesWithData.find((entry) => entry.id === exportProjectId)?.id ??
    entriesWithData.find((entry) => entry.id === destinationPoolId)?.id ??
    entriesWithData[0]?.id ??
    null
  /** インポート先。NEW_TARGET は新規 ID */
  const [importTarget, setImportTarget] = useState<string>(NEW_TARGET)
  const [newProjectId, setNewProjectId] = useState('')
  /** インポート先を自分で選んだ・ID を入れた。選んでいない時だけ、ファイルに合わせる */
  const [importTargetChosen, setImportTargetChosen] = useState(false)
  const formDisabled = jobRunning
  const [filePath, setFilePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [exportRoots, setExportRoots] = useState<string[]>([])
  const [selectedRoots, setSelectedRoots] = useState<string[]>([])
  const [collectionPath, setCollectionPath] = useState('')
  const [includeSubcollections, setIncludeSubcollections] = useState(true)
  /** エクスポートの保存先のフォルダとファイル名。null は Documents/FireMint・自動の名前 */
  const [exportDirectory, setExportDirectory] = useState<string | null>(null)
  const [exportFileName, setExportFileName] = useState<string | null>(null)
  const [defaultExportPath, setDefaultExportPath] = useState<string | null>(null)
  /** インポートするファイルの形式とエクスポート元、書き方、検証の結果 */
  const [fileInfo, setFileInfo] = useState<ImportFileInfo | null>(null)
  const [writeMode, setWriteMode] = useState<ImportWriteMode>('append')
  const [validation, setValidation] = useState<OfficialImportValidation | null>(null)
  const [validateProgress, setValidateProgress] = useState<ImportProjectProgress | null>(null)

  const buildExportInput = (): OfficialExportInput => {
    const common = {
      projectId: poolId ?? '',
      format: 'official' as const,
      directory: exportDirectory ?? undefined,
      fileName: exportFileName ?? undefined
    }
    if (target === 'group') {
      return { ...common, kind: 'group', collectionId: lastPathSegment(collectionPath) }
    }
    if (target === 'collection') {
      return { ...common, kind: 'collection', collectionPath: collectionPath.trim() }
    }
    return { ...common, kind: 'project', rootCollectionIds: selectedRoots }
  }

  useEffect(() => {
    if (direction !== 'export' || !poolId) {
      return
    }

    let cancelled = false
    // 自動のファイル名（時刻つき）。選ばない時はこの名前で保存する
    void window.api.dataTransfer
      .defaultExportPath({ ...buildExportInput(), fileName: undefined })
      .then((path) => {
        if (!cancelled) {
          setDefaultExportPath(path)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, target, poolId, collectionPath, selectedRoots, exportDirectory])

  useEffect(() => {
    setFilePath(null)
    setFileInfo(null)
    setValidation(null)
    setError(null)
    setSuccess(null)
  }, [mode])

  // インポートで新しいプロジェクトができた後も、一覧を読み直す
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const state = await window.api.workspace.getState()
      if (cancelled) {
        return
      }
      const loaded = new Set(state.loadedProjectIds)
      const entries = state.entries.filter(
        (entry) => entry.authType === 'emulator' && loaded.has(entry.id)
      )
      setEmulatorEntries(entries)
      if (!importTargetChosen) {
        setNewProjectId((current) => current || nextNewProjectId(entries))
      }

      const withData: WorkspaceEntry[] = []
      for (const entry of entries) {
        const roots = await window.api.explorer.listRootCollections(entry.id)
        if (roots.ok && roots.data.length > 0) {
          withData.push(entry)
        }
      }
      if (!cancelled) {
        setEntriesWithData(withData)
      }
    })()

    return () => {
      cancelled = true
    }
    // 自分で選んだかどうかで、一覧を読み直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, job?.status])

  useEffect(() => {
    if (!busy || direction !== 'import') {
      return
    }

    return window.api.dataTransfer.onImportProjectProgress(setValidateProgress)
  }, [busy, direction])

  useEffect(() => {
    if (direction !== 'export' || !poolId) {
      setExportRoots([])
      return
    }

    let cancelled = false
    setExportRoots([])

    void (async () => {
      const loaded = await window.api.workspace.loadProject(poolId)
      if (!loaded.ok || cancelled) {
        if (!loaded.ok && !cancelled) {
          setError(loaded.error)
        }
        return
      }

      const result = await window.api.explorer.listRootCollections(poolId)
      if (!result.ok || cancelled) {
        if (!result.ok && !cancelled) {
          setError(result.error)
        }
        return
      }

      autocomplete.addCollectionPaths(poolId, result.data)
      setExportRoots(result.data)
    })()

    return () => {
      cancelled = true
    }
    // addCollectionPaths は安定。revision を依存に入れると選択がリセットされる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, poolId])

  useEffect(() => {
    if (mode !== 'export-project') {
      return
    }

    setSelectedRoots([...exportRoots])
  }, [mode, exportRoots])

  const collectionItems = useMemo(() => {
    void autocomplete.revision
    if (!poolId) {
      return []
    }

    const fromPool = autocomplete.query(poolId, collectionPath, ['collection_path'])
    const seen = new Set(fromPool.map((item) => item.value))
    const needle = collectionPath.trim().toLowerCase()
    const extras: AutocompleteItem[] = []

    for (const rootId of exportRoots) {
      if (seen.has(rootId)) {
        continue
      }

      if (needle && !matchesAutocompleteNeedle(rootId, needle)) {
        continue
      }

      extras.push({ kind: 'collection_path', value: rootId })
    }

    return extras.length === 0 ? fromPool : [...fromPool, ...extras]
  }, [autocomplete, collectionPath, exportRoots, poolId])

  const groupItems = useMemo(() => {
    const seen = new Set<string>()
    const items: AutocompleteItem[] = []
    for (const item of collectionItems) {
      const id = lastPathSegment(item.value)
      if (!id || seen.has(id)) {
        continue
      }
      seen.add(id)
      items.push({ kind: 'collection_path', value: id })
    }
    return items
  }, [collectionItems])

  const setDirection = (next: EmulatorPageDirection): void => {
    const nextTarget = next === 'import' ? 'project' : target
    onModeChange?.(emulatorPageModeFromIntent(next, nextTarget))
  }

  const setTarget = (next: EmulatorPageTarget): void => {
    if (next === 'group') {
      const id = lastPathSegment(collectionPath)
      if (id && id !== collectionPath) {
        setCollectionPath(id)
      }
    }
    onModeChange?.(emulatorPageModeFromIntent(direction, next))
  }

  const sourceProjectId = fileInfo?.sourceProjectId ?? null
  const trimmedNewProjectId = newProjectId.trim()
  /** 選んだプロジェクトが空になって一覧から消えた時は、新規 ID */
  const selectedImportTarget = entriesWithData.some((entry) => entry.id === importTarget)
    ? importTarget
    : NEW_TARGET
  /** 新規 ID に、もうある ID を入れた時は、そのプロジェクトに入れる */
  const importEntry =
    selectedImportTarget === NEW_TARGET
      ? (emulatorEntries.find((entry) => emulatorProjectName(entry) === trimmedNewProjectId) ??
        null)
      : (entriesWithData.find((entry) => entry.id === selectedImportTarget) ?? null)
  const importTargetName = importEntry ? emulatorProjectName(importEntry) : trimmedNewProjectId
  const newProjectIdError =
    !importEntry && trimmedNewProjectId && !EMULATOR_PROJECT_ID_PATTERN.test(trimmedNewProjectId)
      ? t('emu.err_id_format')
      : null

  /** 検証・インポートに渡す書き込み先 */
  const importTargetInput = (): {
    projectId: string
    emulatorHost?: string
    emulatorProjectId?: string
  } =>
    importEntry
      ? { projectId: importEntry.id }
      : { projectId: '', emulatorHost: host, emulatorProjectId: trimmedNewProjectId }

  const handleSelectFile = async (): Promise<void> => {
    const selected = await window.api.dataTransfer.selectOfficialDump()

    if (selected.canceled || !selected.filePath) {
      return
    }

    setFilePath(selected.filePath)
    setFileInfo(null)
    setValidation(null)
    setValidateProgress(null)
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const info = await window.api.dataTransfer.inspectImportFile(selected.filePath)
      if (!info.ok) {
        setFilePath(null)
        setError(info.error)
        return
      }
      setFileInfo(info.data)
      // 選んでいない時は、エクスポート元と同じ ID があればそれ、無ければ新規 ID（値はエクスポート元）
      if (!importTargetChosen) {
        const source = info.data.sourceProjectId
        const match = entriesWithData.find((entry) => emulatorProjectName(entry) === source)
        setImportTarget(match ? match.id : NEW_TARGET)
        if (source) {
          setNewProjectId(source)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const handleValidate = async (level: ImportVerifyLevel): Promise<void> => {
    if (!filePath) {
      return
    }

    setBusy(true)
    setValidateProgress(null)
    setValidation(null)
    setError(null)

    try {
      const result = await window.api.dataTransfer.validateOfficialImport({
        ...importTargetInput(),
        dumpPath: filePath,
        level
      })

      if (!result.ok) {
        if (!result.canceled) {
          setError(result.error)
        }
        return
      }

      setValidation(result.data)
    } finally {
      setBusy(false)
    }
  }

  /** 実行前の確認。検証なしの警告 → 別のプロジェクトの確認 → 書き方ごとの確認 */
  const confirmImport = async (): Promise<boolean> => {
    if (!validation) {
      const proceed = await confirmAction(t('dt.not_validated_confirm'), {
        detail: t('emu.not_validated_detail'),
        confirmLabel: t('dt.proceed')
      })
      if (!proceed) {
        return false
      }
    }

    const name = t('emu.target_name', { name: importTargetName })
    if (sourceProjectId && sourceProjectId !== importTargetName) {
      const proceed = await confirmAction(
        t('dt.source_mismatch_confirm', { source: sourceProjectId, name }),
        { confirmLabel: t('dt.import_it') }
      )
      if (!proceed) {
        return false
      }
    }

    return writeMode === 'overwrite'
      ? confirmAction(t('dt.overwrite_confirm', { name }), {
          detail: t('emu.overwrite_detail'),
          confirmLabel: t('dt.run_overwrite')
        })
      : confirmAction(t('emu.append_confirm', { name }), { confirmLabel: t('dt.run_append') })
  }

  const handleImport = async (): Promise<void> => {
    if (!filePath) {
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      if (!(await confirmImport())) {
        return
      }

      const result = await window.api.scriptRunner.start({
        kind: 'import_official',
        ...importTargetInput(),
        dumpPath: filePath,
        writeMode
      })

      if (!result.ok && !result.canceled) {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  /** 場所とファイル名を一緒に選ぶ。押した時は保存しない（保存はエクスポートの時） */
  const handleChooseExportPath = async (): Promise<void> => {
    if (!poolId) {
      return
    }
    const chosen = await window.api.dataTransfer.chooseExportPath(buildExportInput())
    if (chosen) {
      setExportDirectory(folderOf(chosen))
      setExportFileName(fileNameOf(chosen))
    }
  }

  /** エクスポートを始めた後は、次のために自動のファイル名へ戻す（フォルダは残す） */
  const afterExportStart = (result: { ok: boolean; canceled?: boolean; error?: string }): void => {
    if (result.ok) {
      setExportFileName(null)
    } else if (!result.canceled && result.error) {
      setError(result.error)
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!poolId) {
      setError(t('emu.no_projects_with_data'))
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const loaded = await window.api.workspace.loadProject(poolId)
      if (!loaded.ok) {
        setError(loaded.error)
        return
      }

      if (target === 'collection') {
        const path = collectionPath.trim()
        if (!path) {
          setError(t('explorer.err_collection_path_required'))
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_collection',
          projectId: poolId,
          collectionPath: path,
          format: 'official',
          includeSubcollections,
          directory: exportDirectory ?? undefined,
          fileName: exportFileName ?? undefined
        })

        afterExportStart(result)
        return
      }

      if (target === 'group') {
        const collectionId = lastPathSegment(collectionPath)
        if (!collectionId) {
          setError(t('dt.err_group_required'))
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_group',
          projectId: poolId,
          collectionId,
          format: 'official',
          directory: exportDirectory ?? undefined,
          fileName: exportFileName ?? undefined
        })

        afterExportStart(result)
        return
      }

      if (selectedRoots.length === 0) {
        setError(t('dt.err_select_roots'))
        return
      }

      const result = await window.api.scriptRunner.start({
        kind: 'export_project',
        projectId: poolId,
        rootCollectionIds: selectedRoots,
        includeSubcollections: true,
        format: 'official',
        directory: exportDirectory ?? undefined,
        fileName: exportFileName ?? undefined
      })

      afterExportStart(result)
    } finally {
      setBusy(false)
    }
  }

  const lead =
    mode === 'import-project'
      ? t('emulator.import_project_lead')
      : mode === 'export-project'
        ? t('emulator.export_project_lead')
        : mode === 'export-group'
          ? t('emulator.export_group_lead')
          : t('emulator.export_collection_lead')

  const selectedCount = selectedRoots.length
  const allSelected = exportRoots.length > 0 && selectedCount === exportRoots.length
  const canStartExportCollection =
    Boolean(poolId) && Boolean(collectionPath.trim()) && !busy && !formDisabled
  const canStartExportGroup =
    Boolean(poolId) && Boolean(lastPathSegment(collectionPath)) && !busy && !formDisabled
  const canStartExportProject =
    Boolean(poolId) && selectedRoots.length > 0 && !busy && !formDisabled
  const togglesDisabled = busy || formDisabled
  const canValidate =
    Boolean(filePath && fileInfo && importTargetName) &&
    !newProjectIdError &&
    !busy &&
    !formDisabled
  const validateProgressLabel = validateProgress
    ? `${validateProgress.processedCount}/${validateProgress.totalCount}${
        validateProgress.detail ? ` / ${validateProgress.detail}` : ''
      }`
    : null

  return (
    <section className="connection-panel emulator-page">
      <JobSplitLayout
        form={
          <>
            <div className="imp-exp-form">
              <h1 className="imp-exp-form__title">{t('menu.emulator')}</h1>
              <div className="imp-exp-form__toggles">
                <ToggleBar
                  ariaLabel={t('dt.direction')}
                  value={direction}
                  disabled={togglesDisabled}
                  options={[
                    { id: 'import', label: t('menu.import') },
                    { id: 'export', label: t('menu.export') }
                  ]}
                  onChange={setDirection}
                />
                {direction === 'export' ? (
                  <ToggleBar
                    ariaLabel={t('dt.target')}
                    value={target}
                    disabled={togglesDisabled}
                    options={[
                      { id: 'collection', label: t('explorer.kind_collection') },
                      { id: 'group', label: t('dt.kind_group') },
                      { id: 'project', label: t('dt.project') }
                    ]}
                    onChange={setTarget}
                  />
                ) : null}
              </div>
              <p className="imp-exp-form__lead">{lead}</p>

              {mode === 'import-project' && (
                <>
                  <label className="imp-exp-form__field">
                    {t('dt.import_destination')}
                    <select
                      className="bulk-actions__input"
                      value={selectedImportTarget}
                      disabled={formDisabled}
                      onChange={(event) => {
                        setImportTarget(event.target.value)
                        setImportTargetChosen(true)
                        setValidation(null)
                      }}
                    >
                      <option value={NEW_TARGET}>{t('emu.new_id')}</option>
                      {entriesWithData.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {emulatorOptionLabel(entry)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedImportTarget === NEW_TARGET && (
                    <label className="imp-exp-form__field">
                      {t('emu.new_project_id')}
                      <input
                        className="bulk-actions__input"
                        value={newProjectId}
                        disabled={formDisabled}
                        onChange={(event) => {
                          setNewProjectId(event.target.value)
                          setImportTargetChosen(true)
                          setValidation(null)
                        }}
                      />
                    </label>
                  )}
                  {selectedImportTarget === NEW_TARGET && importEntry && (
                    <p className="imp-exp-form__hint">{t('emu.id_exists')}</p>
                  )}
                  {newProjectIdError && <p className="simple-main__error">{newProjectIdError}</p>}

                  <div className="imp-exp-form__file">
                    <Button onClick={() => void handleSelectFile()} disabled={formDisabled || busy}>
                      {t('dt.select_file_or_folder', { kind: t('dt.file_zip_jsonl') })}
                    </Button>
                    {filePath && <span className="imp-exp-form__path">{filePath}</span>}
                  </div>
                  {fileInfo && (
                    <p className="imp-exp-form__hint">
                      {t('dt.file_info', {
                        format: formatLabel(fileInfo.format),
                        source: fileInfo.sourceProjectId ?? t('dt.unknown')
                      })}
                    </p>
                  )}

                  <div className="imp-exp-form__section">
                    <p className="imp-exp-form__label">{t('dt.write_mode')}</p>
                    <ToggleBar
                      ariaLabel={t('dt.write_mode')}
                      value={writeMode}
                      disabled={formDisabled}
                      options={[
                        { id: 'append', label: t('dt.append') },
                        { id: 'overwrite', label: t('dt.overwrite') }
                      ]}
                      onChange={setWriteMode}
                    />
                    <p className="imp-exp-form__hint">{writeModeHint(writeMode, 'Emulator ')}</p>
                  </div>

                  <div className="imp-exp-form__actions">
                    <Button onClick={() => void handleValidate('quick')} disabled={!canValidate}>
                      {busy && !jobRunning ? t('dt.validating') : t('dt.quick_validate')}
                    </Button>
                    <Button onClick={() => void handleValidate('detailed')} disabled={!canValidate}>
                      {t('dt.detailed_validate')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void handleImport()}
                      disabled={!canValidate}
                    >
                      {t('dt.run_import')}
                    </Button>
                  </div>

                  {validateProgressLabel && busy && (
                    <p className="imp-exp-form__hint">
                      {t('dt.validating_progress', { progress: validateProgressLabel })}
                    </p>
                  )}

                  {validation && (
                    <ImportVerifyTable validation={validation} targetLabel="Emulator " />
                  )}
                </>
              )}

              {direction === 'export' && (
                <label className="imp-exp-form__field">
                  {t('dt.project')}
                  <select
                    className="bulk-actions__input"
                    value={poolId ?? ''}
                    disabled={formDisabled || entriesWithData.length === 0}
                    onChange={(event) => setExportProjectId(event.target.value)}
                  >
                    {entriesWithData.length === 0 && (
                      <option value="">{t('emu.no_projects_with_data')}</option>
                    )}
                    {entriesWithData.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {emulatorOptionLabel(entry)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {mode === 'export-collection' && (
                <>
                  <label className="imp-exp-form__field">
                    {t('explorer.kind_collection')}
                    <AutocompleteInput
                      value={collectionPath}
                      items={collectionItems}
                      disabled={formDisabled || !poolId}
                      placeholder="equipment / users/uid/posts"
                      aria-label={t('dt.collection_path')}
                      onChange={setCollectionPath}
                    />
                  </label>
                </>
              )}

              {mode === 'export-group' && (
                <>
                  <label className="imp-exp-form__field">
                    {t('dt.group_collection_id')}
                    <AutocompleteInput
                      value={collectionPath}
                      items={groupItems}
                      disabled={formDisabled || !poolId}
                      placeholder="posts"
                      aria-label={t('dt.collection_id')}
                      onChange={(value) => {
                        setCollectionPath(value.includes('/') ? lastPathSegment(value) : value)
                      }}
                    />
                  </label>
                </>
              )}

              {mode === 'export-project' && (
                <>
                  <div className="imp-exp-form__roots">
                    {exportRoots.length === 0 ? (
                      <p className="imp-exp-form__hint">{t('dt.no_roots')}</p>
                    ) : (
                      <>
                        <label className="imp-exp-form__check">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={formDisabled}
                            onChange={() => setSelectedRoots(allSelected ? [] : [...exportRoots])}
                          />
                          {t('dt.select_all_count', {
                            selected: selectedCount,
                            total: exportRoots.length
                          })}
                        </label>
                        <ul className="imp-exp-form__root-list">
                          {exportRoots.map((rootId) => (
                            <li key={rootId}>
                              <label className="imp-exp-form__check">
                                <input
                                  type="checkbox"
                                  checked={selectedRoots.includes(rootId)}
                                  disabled={formDisabled}
                                  onChange={() => {
                                    const selected = new Set(selectedRoots)
                                    if (selected.has(rootId)) {
                                      selected.delete(rootId)
                                    } else {
                                      selected.add(rootId)
                                    }
                                    setSelectedRoots(Array.from(selected))
                                  }}
                                />
                                {rootId}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </>
              )}

              {direction === 'export' && (
                <>
                  {target === 'collection' && (
                    <label className="imp-exp-form__check">
                      <input
                        type="checkbox"
                        checked={includeSubcollections}
                        disabled={formDisabled}
                        onChange={(event) => setIncludeSubcollections(event.target.checked)}
                      />
                      {t('explorer.include_subcollections')}
                    </label>
                  )}
                  <div className="imp-exp-form__section">
                    <p className="imp-exp-form__label">{t('dt.save_to')}</p>
                    <p className="imp-exp-form__path">
                      {!defaultExportPath
                        ? '…'
                        : exportFileName
                          ? joinFilePath(folderOf(defaultExportPath), exportFileName)
                          : folderOf(defaultExportPath)}
                    </p>
                    <div className="imp-exp-form__file">
                      <Button
                        onClick={() => void handleChooseExportPath()}
                        disabled={formDisabled || !poolId}
                      >
                        {t('dt.choose_save_to')}
                      </Button>
                    </div>
                  </div>
                  <div className="imp-exp-form__actions">
                    <Button
                      variant="primary"
                      onClick={() => void handleExport()}
                      disabled={
                        target === 'collection'
                          ? !canStartExportCollection
                          : target === 'group'
                            ? !canStartExportGroup
                            : !canStartExportProject
                      }
                    >
                      {t('dt.export')}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {busy && <p className="connection-panel__loading">{t('common.busy')}</p>}
            {error && <p className="connection-panel__error">{error}</p>}
            {success && <p className="simple-main__success">{success}</p>}
          </>
        }
        log={
          job ? (
            <div className="imp-exp-job">
              <header className="imp-exp-view__header">
                <p className="simple-main__empty-title">{job.title}</p>
                <p className={`imp-exp-view__status imp-exp-view__status--${job.status}`}>
                  {statusLabel(job)}
                  {job.detail ? ` · ${job.detail}` : ''}
                </p>
              </header>

              <div className="imp-exp-view__progress" aria-label={t('dt.progress')}>
                <div className="imp-exp-view__progress-bar" style={{ width: `${job.percent}%` }} />
                <p className="imp-exp-view__progress-label">{job.percent}%</p>
              </div>

              {job.resultSummary && job.status === 'succeeded' && (
                <p className="simple-main__success">{job.resultSummary}</p>
              )}
              {job.error && job.status === 'failed' && (
                <p className="simple-main__error">{job.error}</p>
              )}

              {job.status === 'running' && (
                <div className="imp-exp-view__actions">
                  <Button onClick={() => onCancelJob?.()}>{t('dt.stop')}</Button>
                </div>
              )}

              <section className="imp-exp-view__log" aria-label={t('dt.log')}>
                {job.logs.length === 0 ? (
                  <p className="simple-main__empty-hint">{t('dt.no_log')}</p>
                ) : (
                  job.logs.map((line, index) => (
                    <p
                      key={`${line.at}-${index}`}
                      className={
                        line.level === 'error'
                          ? 'imp-exp-view__log-line imp-exp-view__log-line--error'
                          : 'imp-exp-view__log-line'
                      }
                    >
                      <span className="imp-exp-view__log-time">{formatLogTime(line.at)}</span>
                      {line.message}
                    </p>
                  ))
                )}
              </section>
            </div>
          ) : (
            <p className="simple-main__empty-hint">{t('dt.running_hint')}</p>
          )
        }
      />
    </section>
  )
}

export default EmulatorPage
