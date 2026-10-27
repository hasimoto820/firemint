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
      return '実行中'
    case 'succeeded':
      return '完了'
    case 'failed':
      return '失敗'
    case 'canceled':
      return '中止'
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
    return 'ファイル（ZIP / JSONL）'
  }

  return draft.format === 'jsonl' ? 'JSON（.jsonl）' : '公式ダンプ（ZIP）'
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
    return `${name}（Firestore 書込不可）`
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
      const proceed = await confirmAction('検証していません。このまま実行しますか？', {
        detail: '検証は書き込みをしません。実行前に、クラウドとファイルの件数を見られます。',
        confirmLabel: '実行に進む'
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
        `このファイルは ${sourceProjectId} からエクスポートしたものです。${name} に入れますか？`,
        { confirmLabel: '入れる' }
      )
      if (!proceed) {
        return false
      }
    }

    return draft.writeMode === 'overwrite'
      ? confirmAction(`${name} にあるドキュメントは、ファイルの中身で丸ごと置き換わります。`, {
          detail:
            'クラウドにだけあるフィールドは消えます。ファイルに無いドキュメントには触れません。途中で止めても、書いた分は戻りません。',
          confirmLabel: '上書きで実行'
        })
      : confirmAction(
          `${name} の、クラウドに無いドキュメントだけを作ります。既にあるドキュメントには触れません。`,
          { confirmLabel: '追記で実行' }
        )
  }

  const ensureDestinationLoaded = async (): Promise<string | null> => {
    if (!destinationId) {
      setFormError('プロジェクトを選んでください')
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
      setFormError(`${fileKindLabel(draft)} を選択してください`)
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
          setFormError('コレクション path を指定してください')
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
          setFormError('グループ名（コレクション ID）を指定してください')
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
          setFormError('エクスポートするルートコレクションを選んでください')
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
        setFormError(`${fileKindLabel(draft)} を選択してください`)
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
          setFormError('このプロジェクトは read-only です')
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
                ariaLabel="向き"
                value={draft.direction}
                disabled={formDisabled}
                options={[
                  { id: 'import', label: 'Import' },
                  { id: 'export', label: 'Export' }
                ]}
                onChange={handleDirection}
              />
              {draft.direction === 'export' ? (
                <ToggleBar
                  ariaLabel="対象"
                  value={draft.target}
                  disabled={formDisabled}
                  options={[
                    { id: 'collection', label: 'Collection' },
                    { id: 'group', label: 'Group' },
                    { id: 'project', label: 'Project' }
                  ]}
                  onChange={handleTarget}
                />
              ) : null}
              {draft.direction === 'export' ? (
                <ToggleBar
                  ariaLabel="形式"
                  value={draft.format}
                  disabled={formDisabled}
                  options={[
                    { id: 'official', label: '公式ダンプ' },
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
                ? '選んだプロジェクトへ、ファイルの path どおり書きます。'
                : draft.target === 'group'
                  ? '同じコレクション ID の全部（グループ）を出します。'
                  : draft.target === 'collection'
                    ? 'この path の範囲を出します。'
                    : '選んだルートを出します。'}
              ファイルは {fileKindLabel(draft)} です。
            </p>

            <label className="imp-exp-form__field">
              {draft.direction === 'import' ? 'インポート先' : 'プロジェクト'}
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
                コレクション
                <AutocompleteInput
                  value={draft.collectionPath}
                  items={collectionItems}
                  disabled={formDisabled}
                  placeholder="equipment / users/uid/posts"
                  aria-label="コレクション path"
                  onChange={(value) => {
                    resetValidation({ collectionPath: value })
                  }}
                />
              </label>
            )}

            {draft.direction === 'export' && draft.target === 'group' && (
              <label className="imp-exp-form__field">
                グループ（コレクション ID）
                <AutocompleteInput
                  value={draft.collectionPath}
                  items={groupItems}
                  disabled={formDisabled}
                  placeholder="posts"
                  aria-label="コレクション ID"
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
                  <p className="imp-exp-form__hint">ルートコレクションがありません。</p>
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
                      すべて選択（{selectedCount}/{projectRoots.length}）
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
                サブコレクションを含む
              </label>
            )}

            {draft.direction === 'export' && (
              <div className="imp-exp-form__section">
                <p className="imp-exp-form__label">保存先</p>
                <p className="imp-exp-form__path">
                  {!defaultExportPath
                    ? '…'
                    : draft.exportFileName
                      ? joinFilePath(folderOf(defaultExportPath), draft.exportFileName)
                      : folderOf(defaultExportPath)}
                </p>
                <div className="imp-exp-form__file">
                  <Button onClick={() => void handleChooseExportPath()} disabled={formDisabled}>
                    保存先を選ぶ…
                  </Button>
                </div>
              </div>
            )}

            {draft.direction === 'import' && (
              <>
                <div className="imp-exp-form__file">
                  <Button onClick={() => void handleSelectFile()} disabled={formDisabled || busy}>
                    {fileKindLabel(draft)} / フォルダを選択…
                  </Button>
                  {draft.filePath && <span className="imp-exp-form__path">{draft.filePath}</span>}
                </div>
                {draft.fileInfo && (
                  <p className="imp-exp-form__hint">
                    形式: {formatLabel(draft.fileInfo.format)}
                    {' ／ '}エクスポート元: {draft.fileInfo.sourceProjectId ?? '不明'}
                  </p>
                )}
                {destination?.authType !== 'emulator' && destinationReadOnly ? (
                  <p className="simple-main__error">
                    このプロジェクトは read-only です。検証はできますが、実行はできません。
                  </p>
                ) : destination?.authType !== 'emulator' && destinationWriteBlockedReason ? (
                  <p className="simple-main__error">{destinationWriteBlockedReason}</p>
                ) : null}

                <div className="imp-exp-form__section">
                  <p className="imp-exp-form__label">書き方</p>
                  <ToggleBar
                    ariaLabel="書き方"
                    value={draft.writeMode}
                    disabled={formDisabled}
                    options={[
                      { id: 'append', label: '追記' },
                      { id: 'overwrite', label: '上書き' }
                    ]}
                    onChange={(writeMode) => onDraftChange({ writeMode })}
                  />
                  <p className="imp-exp-form__hint">{writeModeHint(draft.writeMode, 'クラウド')}</p>
                </div>
              </>
            )}

            {formError && <p className="simple-main__error">{formError}</p>}

            <div className="imp-exp-form__actions">
              {draft.direction === 'import' && (
                <>
                  <Button onClick={() => void handleValidate('quick')} disabled={!canValidate}>
                    {busy && !jobRunning ? '検証中…' : '簡易検証'}
                  </Button>
                  <Button onClick={() => void handleValidate('detailed')} disabled={!canValidate}>
                    詳細検証
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
                {draft.direction === 'export' ? 'エクスポート' : 'インポート実行'}
              </Button>
            </div>

            {validateProgressLabel && busy && (
              <p className="imp-exp-form__hint">検証中 {validateProgressLabel}</p>
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

              <div className="imp-exp-view__progress" aria-label="進捗">
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
                  <Button onClick={onCancel}>中止</Button>
                </div>
              )}

              <section className="imp-exp-view__log" aria-label="ログ">
                {job.logs.length === 0 ? (
                  <p className="simple-main__empty-hint">ログはまだありません</p>
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
            <p className="simple-main__empty-hint">
              実行中は別のコレクションタブへ戻れます。進捗とログはここに出ます。
            </p>
          )
        }
      />
    </div>
  )
}

export default ImpExpView
