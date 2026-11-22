import { tr } from '@shared/i18n/shared/current'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import type {
  ImportVerifyLevel,
  OfficialExportInput
} from '@features/data_transfer/shared/official'
import {
  fileNameOf,
  folderOf,
  formatLabel,
  joinFilePath,
  lastPathSegment,
  writeModeHint,
  type ImpExpDraft
} from '@features/data_transfer/shared/imp_exp'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'
import JobSplitLayout from '@shared/ui/JobSplitLayout'
import { confirmAction } from '@shared/ui/confirmAction'
import ImportVerifyTable from './ImportVerifyTable'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type ImpExpViewProps = {
  projectId: string
  readOnly: boolean
  rootCollections: string[]
  draft: ImpExpDraft
  onDraftChange: (patch: Partial<ImpExpDraft>) => void
  job: ScriptJobSnapshot | null
  onCancel: () => void
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

function fileKindLabel(draft: ImpExpDraft): string {
  if (draft.direction === 'import') {
    return tr('dt.file_zip_jsonl')
  }

  return draft.format === 'jsonl' ? tr('dt.json_jsonl') : tr('dt.official_dump_zip')
}

const EXTENSIONS: Record<ImpExpDraft['format'], string> = { official: '.zip', jsonl: '.jsonl' }

/** 形式を変えた時、入力したファイル名の拡張子も合わせる */
function swapExtension(
  fileName: string | null,
  from: ImpExpDraft['format'],
  to: ImpExpDraft['format']
): string | null {
  if (fileName === null || !fileName.toLowerCase().endsWith(EXTENSIONS[from])) {
    return fileName
  }
  return `${fileName.slice(0, -EXTENSIONS[from].length)}${EXTENSIONS[to]}`
}

function buildExportInput(draft: ImpExpDraft, projectId: string): OfficialExportInput {
  const directory = draft.exportDirectory ?? undefined
  const fileName = draft.exportFileName ?? undefined
  if (draft.target === 'group') {
    return {
      projectId,
      kind: 'group',
      format: draft.format,
      collectionId: lastPathSegment(draft.collectionPath),
      directory,
      fileName
    }
  }
  if (draft.target === 'collection') {
    return {
      projectId,
      kind: 'collection',
      format: draft.format,
      collectionPath: draft.collectionPath.trim(),
      includeSubcollections: draft.includeSubcollections,
      directory,
      fileName
    }
  }
  return {
    projectId,
    kind: 'project',
    format: draft.format,
    rootCollectionIds: draft.selectedRoots,
    includeSubcollections: true,
    directory,
    fileName
  }
}

function projectOptionLabel(
  entry: WorkspaceEntry,
  writeBlockedReasons: Record<string, string>,
  forImport: boolean
): string {
  const name = entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id
  if (forImport && entry.authType === 'emulator') {
    return `${name}（Emulator）`
  }
  if (entry.readOnly) {
    return `${name}（read-only）`
  }
  if (writeBlockedReasons[entry.id]) {
    return tr('dt.name_read_only', { name })
  }
  return name
}

/**
 * Imp/Exp タブ。向き・対象・ファイル・進捗を 1 画面で扱う。
 */
function ImpExpView({
  projectId,
  readOnly,
  rootCollections,
  draft,
  onDraftChange,
  job,
  onCancel
}: ImpExpViewProps): React.JSX.Element {
  const autocomplete = useOptionalAutocompleteApi()
  const t = useT()
  const jobRunning = job?.status === 'running'
  const formDisabled = jobRunning
  const projectValidation = draft.projectValidation
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [writeBlockedReasons, setWriteBlockedReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [destRootCollections, setDestRootCollections] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [validateProgress, setValidateProgress] = useState<ImportProjectProgress | null>(null)
  const [defaultExportPath, setDefaultExportPath] = useState<string | null>(null)

  const destination =
    entries.find((entry) => entry.id === draft.destinationProjectId) ??
    entries.find((entry) => entry.id === projectId) ??
    entries[0] ??
    null
  const destinationId = destination?.id ?? projectId
  const destinationReadOnly = destination?.readOnly ?? readOnly
  const destinationWriteBlockedReason = writeBlockedReasons[destinationId] ?? null
  const destinationLocked =
    destination?.authType === 'emulator'
      ? false
      : destinationReadOnly || Boolean(destinationWriteBlockedReason)
  /** Project で出すルート。選んだプロジェクトのもの（読み込む前は開いているプロジェクトのもの） */
  const projectRoots =
    destinationId === projectId && destRootCollections.length === 0
      ? rootCollections
      : destRootCollections
  /** プロジェクトを変えた時、読み込んだルートを全部選ぶ */
  const selectAllRootsRef = useRef(false)

  const collectionItems = useMemo(() => {
    void autocomplete.revision
    const fromPool = autocomplete.query(destinationId, draft.collectionPath, ['collection_path'])
    const seen = new Set(fromPool.map((item) => item.value))
    const needle = draft.collectionPath.trim().toLowerCase()
    const extras: AutocompleteItem[] = []

    for (const rootId of destRootCollections) {
      if (seen.has(rootId)) {
        continue
      }

      if (needle && !matchesAutocompleteNeedle(rootId, needle)) {
        continue
      }

      extras.push({ kind: 'collection_path', value: rootId })
    }

    return extras.length === 0 ? fromPool : [...fromPool, ...extras]
  }, [autocomplete, destRootCollections, destinationId, draft.collectionPath])

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

  useEffect(() => {
    if (draft.direction === 'import' || !destinationId) {
      setDestRootCollections([])
      return
    }

    let cancelled = false
    setDestRootCollections([])

    void (async () => {
      const loaded = await window.api.workspace.loadProject(destinationId)
      if (!loaded.ok || cancelled) {
        return
      }

      const result = await window.api.explorer.listRootCollections(destinationId)
      if (!result.ok || cancelled) {
        return
      }

      autocomplete.addCollectionPaths(destinationId, result.data)
      setDestRootCollections(result.data)
      if (selectAllRootsRef.current) {
        selectAllRootsRef.current = false
        onDraftChange({ selectedRoots: result.data })
      }
    })()

    return () => {
      cancelled = true
    }
    // onDraftChange は親の再描画ごとに変わる。入れるとルートを読み直し続ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autocomplete, destinationId, draft.direction, draft.target])

  useEffect(() => {
    let cancelled = false

    void window.api.workspace.getState().then((state) => {
      if (!cancelled) {
        setEntries(state.entries)
        setWriteBlockedReasons(state.writeBlockedReasons)
      }
    })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (draft.direction !== 'export') {
      return
    }

    let cancelled = false
    // 自動のファイル名（時刻つき）。入力欄の最初の値になる
    void window.api.dataTransfer
      .defaultExportPath({ ...buildExportInput(draft, destinationId), fileName: undefined })
      .then((path) => {
        if (!cancelled) {
          setDefaultExportPath(path)
        }
      })

    return () => {
      cancelled = true
    }
  }, [draft, destinationId])

  useEffect(() => {
    if (!busy) {
      return
    }

    if (draft.direction !== 'import') {
      return
    }

    return window.api.dataTransfer.onImportProjectProgress(setValidateProgress)
  }, [busy, draft.direction])

  const resetValidation = (patch: Partial<ImpExpDraft> = {}): void => {
    onDraftChange({
      projectValidation: null,
      ...patch
    })
    setValidateProgress(null)
    setFormError(null)
  }

  const handleDirection = (direction: ImpExpDraft['direction']): void => {
    resetValidation({
      direction,
      target: direction === 'import' ? 'project' : draft.target,
      filePath: null,
      fileInfo: null,
      acceptMismatch: false,
      selectedRoots:
        direction === 'export' && draft.target === 'project' && draft.selectedRoots.length === 0
          ? projectRoots
          : draft.selectedRoots
    })
  }

  const handleTarget = (target: ImpExpDraft['target']): void => {
    resetValidation({
      target,
      filePath: null,
      fileInfo: null,
      acceptMismatch: false,
      collectionPath:
        target === 'group' ? lastPathSegment(draft.collectionPath) : draft.collectionPath,
      selectedRoots:
        target === 'project' && draft.direction === 'export' && draft.selectedRoots.length === 0
          ? projectRoots
          : draft.selectedRoots
    })
  }

  const handleSelectFile = async (): Promise<void> => {
    const result = await window.api.dataTransfer.selectOfficialDump()

    if (result.canceled || !result.filePath) {
      return
    }

    resetValidation({ filePath: result.filePath, fileInfo: null })
    setBusy(true)
    try {
      const info = await window.api.dataTransfer.inspectImportFile(result.filePath)
      if (!info.ok) {
        onDraftChange({ filePath: null })
        setFormError(info.error)
        return
      }
      onDraftChange({ fileInfo: info.data })
    } finally {
      setBusy(false)
    }
  }

  /** 「名前を付けて保存」で、場所とファイル名を一緒に選ぶ。同じ名前がある時は OS が上書きを確かめる */
  const handleChooseExportPath = async (): Promise<void> => {
    const chosen = await window.api.dataTransfer.chooseExportPath(
      buildExportInput(draft, destinationId)
    )
    if (chosen) {
      onDraftChange({ exportDirectory: folderOf(chosen), exportFileName: fileNameOf(chosen) })
    }
  }

  /** 実行前の確認。検証なしの警告 → 別のプロジェクトの確認 → 書き方ごとの確認 */
  const confirmImport = async (destEntry: WorkspaceEntry | null): Promise<boolean> => {
    const name = destEntry?.label ?? destinationId

    if (!projectValidation) {
      const proceed = await confirmAction(t('dt.not_validated_confirm'), {
        detail: t('dt.not_validated_detail'),
        confirmLabel: t('dt.proceed')
      })
      if (!proceed) {
        return false
      }
    }

    const sourceProjectId = draft.fileInfo?.sourceProjectId
    const destProjectId =
      destEntry?.authType === 'emulator'
        ? (destEntry.emulatorProjectId ?? destinationId)
        : destinationId
    if (sourceProjectId && sourceProjectId !== destProjectId) {
      const proceed = await confirmAction(
        t('dt.source_mismatch_confirm', { source: sourceProjectId, name }),
        { confirmLabel: t('dt.import_it') }
      )
      if (!proceed) {
        return false
      }
    }

    return draft.writeMode === 'overwrite'
      ? confirmAction(t('dt.overwrite_confirm', { name }), {
          detail: t('dt.overwrite_detail'),
          confirmLabel: t('dt.run_overwrite')
        })
      : confirmAction(t('dt.append_confirm', { name }), { confirmLabel: t('dt.run_append') })
  }

  const ensureDestinationLoaded = async (): Promise<string | null> => {
    if (!destinationId) {
      setFormError(t('dt.err_select_project'))
      return null
    }

    const result = await window.api.workspace.loadProject(destinationId)
    if (!result.ok) {
      setFormError(result.error)
      return null
    }

    const state = await window.api.workspace.getState()
    setEntries(state.entries)
    setWriteBlockedReasons(state.writeBlockedReasons)

    return destinationId
  }

  const validateOfficial = async (level: ImportVerifyLevel): Promise<boolean> => {
    if (!draft.filePath) {
      setFormError(t('dt.err_select_file', { kind: fileKindLabel(draft) }))
      return false
    }

    const loadedProjectId = await ensureDestinationLoaded()
    if (!loadedProjectId) {
      return false
    }

    const result = await window.api.dataTransfer.validateOfficialImport({
      projectId: loadedProjectId,
      dumpPath: draft.filePath,
      level
    })

    if (!result.ok) {
      if (!result.canceled) {
        setFormError(result.error)
      }
      return false
    }

    onDraftChange({
      projectValidation: result.data
    })

    return true
  }

  const handleValidate = async (level: ImportVerifyLevel): Promise<void> => {
    setBusy(true)
    setValidateProgress(null)
    setFormError(null)
    onDraftChange({ projectValidation: null })

    try {
      await validateOfficial(level)
    } finally {
      setBusy(false)
    }
  }

  /** エクスポートを始めた後は、次のために自動のファイル名へ戻す（フォルダは残す） */
  const afterExportStart = (result: { ok: boolean; canceled?: boolean; error?: string }): void => {
    if (result.ok) {
      onDraftChange({ exportFileName: null })
    } else if (!result.canceled && result.error) {
      setFormError(result.error)
    }
  }

  const handleStart = async (): Promise<void> => {
    setBusy(true)
    setFormError(null)

    try {
      // 選んでいない時は、自動の名前（時刻つき）で保存する
      const fileName = draft.exportFileName

      if (draft.direction === 'export' && draft.target === 'collection') {
        const collectionPath = draft.collectionPath.trim()
        if (!collectionPath) {
          setFormError(t('explorer.err_collection_path_required'))
          return
        }

        const loadedProjectId = await ensureDestinationLoaded()
        if (!loadedProjectId) {
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_collection',
          projectId: loadedProjectId,
          collectionPath,
          format: draft.format,
          includeSubcollections: draft.includeSubcollections,
          directory: draft.exportDirectory ?? undefined,
          fileName: fileName ?? undefined
        })

        afterExportStart(result)
        return
      }

      if (draft.direction === 'export' && draft.target === 'group') {
        const collectionId = lastPathSegment(draft.collectionPath)
        if (!collectionId) {
          setFormError(t('dt.err_group_required'))
          return
        }

        const loadedProjectId = await ensureDestinationLoaded()
        if (!loadedProjectId) {
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_group',
          projectId: loadedProjectId,
          collectionId,
          format: draft.format,
          directory: draft.exportDirectory ?? undefined,
          fileName: fileName ?? undefined
        })

        afterExportStart(result)
        return
      }

      if (draft.direction === 'export' && draft.target === 'project') {
        if (draft.selectedRoots.length === 0) {
          setFormError(t('dt.err_select_roots'))
          return
        }

        const loadedProjectId = await ensureDestinationLoaded()
        if (!loadedProjectId) {
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_project',
          projectId: loadedProjectId,
          rootCollectionIds: draft.selectedRoots,
          includeSubcollections: true,
          format: draft.format,
          directory: draft.exportDirectory ?? undefined,
          fileName: fileName ?? undefined
        })

        afterExportStart(result)
        return
      }

      if (!draft.filePath) {
        setFormError(t('dt.err_select_file', { kind: fileKindLabel(draft) }))
        return
      }

      const loadedProjectId = await ensureDestinationLoaded()
      if (!loadedProjectId) {
        return
      }

      const destEntry = entries.find((entry) => entry.id === loadedProjectId) ?? destination
      if (destEntry?.authType !== 'emulator') {
        const latest = await window.api.workspace.getState()
        const blocked = latest.writeBlockedReasons[loadedProjectId]
        if (blocked) {
          setWriteBlockedReasons(latest.writeBlockedReasons)
          setFormError(blocked)
          return
        }

        if (destinationReadOnly) {
          setFormError(t('dt.err_read_only'))
          return
        }
      }

      if (!(await confirmImport(destEntry ?? null))) {
        return
      }

      const result = await window.api.scriptRunner.start({
        kind: 'import_official',
        projectId: loadedProjectId,
        dumpPath: draft.filePath,
        writeMode: draft.writeMode
      })

      if (!result.ok && !result.canceled) {
        setFormError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const canValidate =
    draft.direction === 'import' &&
    Boolean(draft.filePath && draft.fileInfo) &&
    !busy &&
    !formDisabled
  const canStartExportCollection =
    draft.direction === 'export' &&
    draft.target === 'collection' &&
    Boolean(draft.collectionPath.trim()) &&
    !busy &&
    !formDisabled
  const canStartExportGroup =
    draft.direction === 'export' &&
    draft.target === 'group' &&
    Boolean(draft.collectionPath.trim()) &&
    !busy &&
    !formDisabled
  const canStartExportProject =
    draft.direction === 'export' &&
    draft.target === 'project' &&
    draft.selectedRoots.length > 0 &&
    !busy &&
    !formDisabled
  const canStartImport =
    draft.direction === 'import' &&
    Boolean(draft.filePath && draft.fileInfo) &&
    !destinationLocked &&
    !busy &&
    !formDisabled

  const selectedCount = draft.selectedRoots.length
  const allSelected = projectRoots.length > 0 && selectedCount === projectRoots.length
  const validateProgressLabel = validateProgress
    ? `${validateProgress.processedCount}/${validateProgress.totalCount}${
        validateProgress.detail ? ` / ${validateProgress.detail}` : ''
      }`
    : null

  return (
    <div className="imp-exp-view imp-exp-view--job">
      <JobSplitLayout
        storageKey="job.log.imp_exp"
        defaultLogSize={120}
        form={
          <div className="imp-exp-form">
            <h1 className="imp-exp-form__title">{t('menu.cloud')}</h1>
            <div className="imp-exp-form__toggles">
              <ToggleBar
                ariaLabel={t('dt.direction')}
                value={draft.direction}
                disabled={formDisabled}
                options={[
                  { id: 'import', label: t('menu.import') },
                  { id: 'export', label: t('menu.export') }
                ]}
                onChange={handleDirection}
              />
              {draft.direction === 'export' ? (
                <ToggleBar
                  ariaLabel={t('dt.target')}
                  value={draft.target}
                  disabled={formDisabled}
                  options={[
                    { id: 'collection', label: t('explorer.kind_collection') },
                    { id: 'group', label: t('dt.kind_group') },
                    { id: 'project', label: t('dt.project') }
                  ]}
                  onChange={handleTarget}
                />
              ) : null}
              {draft.direction === 'export' ? (
                <ToggleBar
                  ariaLabel={t('dt.format')}
                  value={draft.format}
                  disabled={formDisabled}
                  options={[
                    { id: 'official', label: t('dt.official_dump') },
                    { id: 'jsonl', label: 'JSON' }
                  ]}
                  onChange={(format) => {
                    resetValidation({
                      format,
                      exportFileName: swapExtension(draft.exportFileName, draft.format, format)
                    })
                  }}
                />
              ) : null}
            </div>

            <p className="imp-exp-form__lead">
              {draft.direction === 'import'
                ? t('dt.lead_import')
                : draft.target === 'group'
                  ? t('dt.lead_group')
                  : draft.target === 'collection'
                    ? t('dt.lead_collection')
                    : t('dt.lead_project')}
              {t('dt.file_is', { kind: fileKindLabel(draft) })}
            </p>

            <label className="imp-exp-form__field">
              {draft.direction === 'import' ? t('dt.import_destination') : t('dt.project')}
              <select
                className="bulk-actions__input"
                value={destinationId}
                disabled={formDisabled || entries.length === 0}
                onChange={(event) => {
                  selectAllRootsRef.current = draft.direction === 'export'
                  resetValidation({
                    destinationProjectId: event.target.value,
                    acceptMismatch: false,
                    selectedRoots: draft.direction === 'export' ? [] : draft.selectedRoots
                  })
                }}
              >
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {projectOptionLabel(entry, writeBlockedReasons, draft.direction === 'import')}
                  </option>
                ))}
              </select>
            </label>

            {draft.direction === 'export' && draft.target === 'collection' && (
              <label className="imp-exp-form__field">
                {t('explorer.kind_collection')}
                <AutocompleteInput
                  value={draft.collectionPath}
                  items={collectionItems}
                  disabled={formDisabled}
                  placeholder="equipment / users/uid/posts"
                  aria-label={t('dt.collection_path')}
                  onChange={(value) => {
                    resetValidation({ collectionPath: value })
                  }}
                />
              </label>
            )}

            {draft.direction === 'export' && draft.target === 'group' && (
              <label className="imp-exp-form__field">
                {t('dt.group_collection_id')}
                <AutocompleteInput
                  value={draft.collectionPath}
                  items={groupItems}
                  disabled={formDisabled}
                  placeholder="posts"
                  aria-label={t('dt.collection_id')}
                  onChange={(value) => {
                    resetValidation({
                      collectionPath: value.includes('/') ? lastPathSegment(value) : value
                    })
                  }}
                />
              </label>
            )}

            {draft.direction === 'export' && draft.target === 'project' && (
              <div className="imp-exp-form__roots">
                {projectRoots.length === 0 ? (
                  <p className="imp-exp-form__hint">{t('dt.no_roots')}</p>
                ) : (
                  <>
                    <label className="imp-exp-form__check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={formDisabled}
                        onChange={() =>
                          onDraftChange({
                            selectedRoots: allSelected ? [] : [...projectRoots]
                          })
                        }
                      />
                      {t('dt.select_all_count', {
                        selected: selectedCount,
                        total: projectRoots.length
                      })}
                    </label>
                    <ul className="imp-exp-form__root-list">
                      {projectRoots.map((rootId) => (
                        <li key={rootId}>
                          <label className="imp-exp-form__check">
                            <input
                              type="checkbox"
                              checked={draft.selectedRoots.includes(rootId)}
                              disabled={formDisabled}
                              onChange={() => {
                                const selected = new Set(draft.selectedRoots)
                                if (selected.has(rootId)) {
                                  selected.delete(rootId)
                                } else {
                                  selected.add(rootId)
                                }
                                onDraftChange({ selectedRoots: Array.from(selected) })
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
            )}

            {draft.direction === 'export' && draft.target === 'collection' && (
              <label className="imp-exp-form__check">
                <input
                  type="checkbox"
                  checked={draft.includeSubcollections}
                  disabled={formDisabled}
                  onChange={(event) => {
                    resetValidation({ includeSubcollections: event.target.checked })
                  }}
                />
                {t('explorer.include_subcollections')}
              </label>
            )}

            {draft.direction === 'export' && (
              <div className="imp-exp-form__section">
                <p className="imp-exp-form__label">{t('dt.save_to')}</p>
                <p className="imp-exp-form__path">
                  {!defaultExportPath
                    ? '…'
                    : draft.exportFileName
                      ? joinFilePath(folderOf(defaultExportPath), draft.exportFileName)
                      : folderOf(defaultExportPath)}
                </p>
                <div className="imp-exp-form__file">
                  <Button onClick={() => void handleChooseExportPath()} disabled={formDisabled}>
                    {t('dt.choose_save_to')}
                  </Button>
                </div>
              </div>
            )}

            {draft.direction === 'import' && (
              <>
                <div className="imp-exp-form__file">
                  <Button onClick={() => void handleSelectFile()} disabled={formDisabled || busy}>
                    {t('dt.select_file_or_folder', { kind: fileKindLabel(draft) })}
                  </Button>
                  {draft.filePath && <span className="imp-exp-form__path">{draft.filePath}</span>}
                </div>
                {draft.fileInfo && (
                  <p className="imp-exp-form__hint">
                    {t('dt.file_info', {
                      format: formatLabel(draft.fileInfo.format),
                      source: draft.fileInfo.sourceProjectId ?? t('dt.unknown')
                    })}
                  </p>
                )}
                {destination?.authType !== 'emulator' && destinationReadOnly ? (
                  <p className="simple-main__error">{t('dt.read_only_validate_only')}</p>
                ) : destination?.authType !== 'emulator' && destinationWriteBlockedReason ? (
                  <p className="simple-main__error">{destinationWriteBlockedReason}</p>
                ) : null}

                <div className="imp-exp-form__section">
                  <p className="imp-exp-form__label">{t('dt.write_mode')}</p>
                  <ToggleBar
                    ariaLabel={t('dt.write_mode')}
                    value={draft.writeMode}
                    disabled={formDisabled}
                    options={[
                      { id: 'append', label: t('dt.append') },
                      { id: 'overwrite', label: t('dt.overwrite') }
                    ]}
                    onChange={(writeMode) => onDraftChange({ writeMode })}
                  />
                  <p className="imp-exp-form__hint">
                    {writeModeHint(draft.writeMode, t('dt.cloud'))}
                  </p>
                </div>
              </>
            )}

            {formError && <p className="simple-main__error">{formError}</p>}

            <div className="imp-exp-form__actions">
              {draft.direction === 'import' && (
                <>
                  <Button onClick={() => void handleValidate('quick')} disabled={!canValidate}>
                    {busy && !jobRunning ? t('dt.validating') : t('dt.quick_validate')}
                  </Button>
                  <Button onClick={() => void handleValidate('detailed')} disabled={!canValidate}>
                    {t('dt.detailed_validate')}
                  </Button>
                </>
              )}
              <Button
                variant="primary"
                onClick={() => void handleStart()}
                disabled={
                  draft.direction === 'export'
                    ? draft.target === 'collection'
                      ? !canStartExportCollection
                      : draft.target === 'group'
                        ? !canStartExportGroup
                        : !canStartExportProject
                    : !canStartImport
                }
              >
                {draft.direction === 'export' ? t('dt.export') : t('dt.run_import')}
              </Button>
            </div>

            {validateProgressLabel && busy && (
              <p className="imp-exp-form__hint">
                {t('dt.validating_progress', { progress: validateProgressLabel })}
              </p>
            )}

            {projectValidation && <ImportVerifyTable validation={projectValidation} />}
          </div>
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
                  <Button onClick={onCancel}>{t('dt.stop')}</Button>
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
    </div>
  )
}

export default ImpExpView
