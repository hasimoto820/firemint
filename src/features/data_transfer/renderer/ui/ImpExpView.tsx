import { useEffect, useMemo, useRef, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import type {
  ImportCollectionProgress,
  ImportCollectionValidation,
  ImportProjectProgress,
  ImportProjectValidation
} from '@features/data_transfer/shared/types'
import type { ImpExpDraft, ImpExpIntent } from '@features/data_transfer/shared/imp_exp'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'

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

function fileKindLabel(intent: ImpExpIntent): string {
  if (intent.direction === 'export') {
    return intent.target === 'collection' ? 'JSON' : 'ZIP'
  }

  return intent.target === 'collection' ? 'JSON' : 'ZIP'
}

function projectOptionLabel(entry: WorkspaceEntry): string {
  const name = entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id
  return entry.readOnly ? `${name}（read-only）` : name
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
  const jobRunning = job?.status === 'running'
  const formDisabled = jobRunning
  const collectionValidation = draft.collectionValidation
  const projectValidation = draft.projectValidation
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [destRootCollections, setDestRootCollections] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [validateProgress, setValidateProgress] = useState<
    ImportCollectionProgress | ImportProjectProgress | null
  >(null)

  const destination =
    entries.find((entry) => entry.id === draft.destinationProjectId) ??
    entries.find((entry) => entry.id === projectId) ??
    entries[0] ??
    null
  const destinationId = destination?.id ?? projectId
  const destinationReadOnly = destination?.readOnly ?? readOnly
  const showProjectSelect =
    draft.target === 'collection' || (draft.direction === 'import' && draft.target === 'project')

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

  const collectionPathRef = useRef(draft.collectionPath)
  collectionPathRef.current = draft.collectionPath

  const applyInferredCollection = async (
    filePath: string,
    overwrite: boolean
  ): Promise<string | null> => {
    const peek = await window.api.dataTransfer.peekCollectionImportJson(filePath)
    if (!peek.ok) {
      setFormError(peek.error)
      return null
    }

    if (!peek.collectionPath) {
      return null
    }

    if (!overwrite && collectionPathRef.current.trim()) {
      return collectionPathRef.current.trim()
    }

    onDraftChange({ collectionPath: peek.collectionPath })
    collectionPathRef.current = peek.collectionPath
    return peek.collectionPath
  }

  useEffect(() => {
    if (draft.direction !== 'import' || draft.target !== 'collection' || !draft.filePath) {
      return
    }

    if (draft.collectionPath.trim()) {
      return
    }

    void applyInferredCollection(draft.filePath, false)
    // 空のときだけ JSON から埋める。ユーザー入力は上書きしない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.filePath, draft.direction, draft.target])

  useEffect(() => {
    if (draft.target !== 'collection' || !destinationId) {
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
    })()

    return () => {
      cancelled = true
    }
  }, [autocomplete, destinationId, draft.target])

  useEffect(() => {
    let cancelled = false

    void window.api.workspace.getState().then((state) => {
      if (!cancelled) {
        setEntries(state.entries)
      }
    })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!busy) {
      return
    }

    if (draft.direction !== 'import') {
      return
    }

    if (draft.target === 'collection') {
      return window.api.dataTransfer.onImportCollectionProgress(setValidateProgress)
    }

    return window.api.dataTransfer.onImportProjectProgress(setValidateProgress)
  }, [busy, draft.direction, draft.target])

  const resetValidation = (patch: Partial<ImpExpDraft> = {}): void => {
    onDraftChange({
      collectionValidation: null,
      projectValidation: null,
      ...patch
    })
    setValidateProgress(null)
    setFormError(null)
  }

  const handleDirection = (direction: ImpExpDraft['direction']): void => {
    resetValidation({
      direction,
      filePath: null,
      acceptMismatch: false,
      selectedRoots:
        direction === 'export' &&
        draft.target === 'project' &&
        draft.selectedRoots.length === 0
          ? rootCollections
          : draft.selectedRoots
    })
  }

  const handleTarget = (target: ImpExpDraft['target']): void => {
    resetValidation({
      target,
      filePath: null,
      acceptMismatch: false,
      selectedRoots:
        target === 'project' &&
        draft.direction === 'export' &&
        draft.selectedRoots.length === 0
          ? rootCollections
          : draft.selectedRoots
    })
  }

  const handleSelectFile = async (): Promise<void> => {
    const result =
      draft.target === 'collection'
        ? await window.api.dataTransfer.selectCollectionImportJson()
        : await window.api.dataTransfer.selectProjectImportZip()

    if (result.canceled || !result.filePath) {
      return
    }

    if (draft.target === 'collection') {
      const peek = await window.api.dataTransfer.peekCollectionImportJson(result.filePath)
      resetValidation({
        filePath: result.filePath,
        collectionPath:
          peek.ok && peek.collectionPath ? peek.collectionPath : draft.collectionPath
      })
      if (!peek.ok) {
        setFormError(peek.error)
      }
      return
    }

    resetValidation({ filePath: result.filePath })
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

    return destinationId
  }

  const validateCollection = async (): Promise<ImportCollectionValidation | null> => {
    if (!draft.filePath) {
      setFormError(`${fileKindLabel(draft)} ファイルを選択してください`)
      return null
    }

    const loadedProjectId = await ensureDestinationLoaded()
    if (!loadedProjectId) {
      return null
    }

    let collectionPath = draft.collectionPath.trim() || collectionPathRef.current.trim()
    if (!collectionPath) {
      collectionPath = (await applyInferredCollection(draft.filePath, false)) ?? ''
    }

    if (!collectionPath) {
      setFormError('JSON からコレクションを特定できません。コレクション path を指定してください')
      return null
    }

    const result = await window.api.dataTransfer.validateCollectionImport({
      projectId: loadedProjectId,
      collectionPath,
      filePath: draft.filePath,
      includeSubcollections: draft.includeSubcollections
    })

    if (!result.ok) {
      if (!result.canceled) {
        setFormError(result.error)
      }
      return null
    }

    onDraftChange({ collectionValidation: result.data })
    if (result.data.hasCollisions) {
      setFormError(
        `衝突があります（例: ${result.data.collisionSamples.join(', ')}）。書込は行いません。`
      )
    }

    return result.data
  }

  const validateProject = async (): Promise<ImportProjectValidation | null> => {
    if (!draft.filePath) {
      setFormError(`${fileKindLabel(draft)} ファイルを選択してください`)
      return null
    }

    const loadedProjectId = await ensureDestinationLoaded()
    if (!loadedProjectId) {
      return null
    }

    const result = await window.api.dataTransfer.validateProjectImport({
      projectId: loadedProjectId,
      filePath: draft.filePath
    })

    if (!result.ok) {
      if (!result.canceled) {
        setFormError(result.error)
      }
      return null
    }

    onDraftChange({ projectValidation: result.data })
    if (result.data.hasCollisions) {
      setFormError(
        `衝突があります（例: ${result.data.collisionSamples.join(', ')}）。書込は行いません。`
      )
    }

    return result.data
  }

  const handleValidate = async (): Promise<void> => {
    setBusy(true)
    setValidateProgress(null)
    setFormError(null)
    onDraftChange({ collectionValidation: null, projectValidation: null })

    try {
      if (draft.target === 'collection') {
        await validateCollection()
        return
      }

      await validateProject()
    } finally {
      setBusy(false)
    }
  }

  const handleStart = async (): Promise<void> => {
    setBusy(true)
    setFormError(null)

    try {
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
          includeSubcollections: draft.includeSubcollections
        })

        if (!result.ok && !result.canceled) {
          setFormError(result.error)
        }
        return
      }

      if (draft.direction === 'export' && draft.target === 'project') {
        if (draft.selectedRoots.length === 0) {
          setFormError('エクスポートするルートコレクションを選んでください')
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_project',
          projectId,
          rootCollectionIds: draft.selectedRoots,
          includeSubcollections: draft.includeSubcollections
        })

        if (!result.ok && !result.canceled) {
          setFormError(result.error)
        }
        return
      }

      if (!draft.filePath) {
        setFormError(`${fileKindLabel(draft)} ファイルを選択してください`)
        return
      }

      if (draft.target === 'collection') {
        const validation = collectionValidation ?? (await validateCollection())
        if (!validation || validation.hasCollisions) {
          return
        }

        const collectionPath = collectionPathRef.current.trim() || draft.collectionPath.trim()
        if (!collectionPath) {
          setFormError('JSON からコレクションを特定できません。コレクション path を指定してください')
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'import_collection',
          projectId: destinationId,
          collectionPath,
          filePath: draft.filePath,
          includeSubcollections: draft.includeSubcollections
        })

        if (!result.ok && !result.canceled) {
          setFormError(result.error)
        }
        return
      }

      const validation = projectValidation ?? (await validateProject())
      if (!validation || validation.hasCollisions) {
        return
      }

      if (validation.projectIdMismatch && !draft.acceptMismatch) {
        setFormError('projectId の不一致を確認してください')
        return
      }

      if (destinationReadOnly) {
        setFormError('このプロジェクトは read-only です')
        return
      }

      const loadedProjectId = await ensureDestinationLoaded()
      if (!loadedProjectId) {
        return
      }

      const result = await window.api.scriptRunner.start({
        kind: 'import_project',
        projectId: loadedProjectId,
        filePath: draft.filePath,
        acceptProjectIdMismatch: draft.acceptMismatch
      })

      if (!result.ok && !result.canceled) {
        setFormError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const canValidate =
    draft.direction === 'import' && Boolean(draft.filePath) && !busy && !formDisabled
  const canStartExportCollection =
    draft.direction === 'export' &&
    draft.target === 'collection' &&
    Boolean(draft.collectionPath.trim()) &&
    !busy &&
    !formDisabled
  const canStartExportProject =
    draft.direction === 'export' &&
    draft.target === 'project' &&
    draft.selectedRoots.length > 0 &&
    !busy &&
    !formDisabled
  const canStartImportCollection =
    draft.direction === 'import' &&
    draft.target === 'collection' &&
    Boolean(draft.filePath) &&
    !collectionValidation?.hasCollisions &&
    !destinationReadOnly &&
    !busy &&
    !formDisabled
  const canStartImportProject =
    draft.direction === 'import' &&
    draft.target === 'project' &&
    Boolean(draft.filePath) &&
    !projectValidation?.hasCollisions &&
    !(projectValidation?.projectIdMismatch && !draft.acceptMismatch) &&
    !destinationReadOnly &&
    !busy &&
    !formDisabled

  const selectedCount = draft.selectedRoots.length
  const allSelected = rootCollections.length > 0 && selectedCount === rootCollections.length
  const validateProgressLabel = validateProgress
    ? `${validateProgress.processedCount}/${validateProgress.totalCount}${
        validateProgress.detail ? ` / ${validateProgress.detail}` : ''
      }`
    : null

  return (
    <div className="imp-exp-view imp-exp-view--job">
      <div className="imp-exp-form">
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
          <ToggleBar
            ariaLabel="対象"
            value={draft.target}
            disabled={formDisabled}
            options={[
              { id: 'collection', label: 'Collection' },
              { id: 'project', label: 'Project' }
            ]}
            onChange={handleTarget}
          />
        </div>

        <p className="imp-exp-form__lead">
          {draft.direction === 'import'
            ? 'ファイルを選んで実行。検証は任意です。'
            : '範囲を選んでから実行。'}
          ファイルは {fileKindLabel(draft)} です。
        </p>

        {showProjectSelect && (
          <label className="imp-exp-form__field">
            {draft.target === 'collection' ? 'プロジェクト' : 'インポート先'}
            <select
              className="bulk-actions__input"
              value={destinationId}
              disabled={formDisabled || entries.length === 0}
              onChange={(event) => {
                resetValidation({
                  destinationProjectId: event.target.value,
                  acceptMismatch: false
                })
              }}
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {projectOptionLabel(entry)}
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.target === 'collection' && (
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

        {draft.direction === 'export' && draft.target === 'project' && (
          <div className="imp-exp-form__roots">
            {rootCollections.length === 0 ? (
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
                        selectedRoots: allSelected ? [] : [...rootCollections]
                      })
                    }
                  />
                  すべて選択（{selectedCount}/{rootCollections.length}）
                </label>
                <ul className="imp-exp-form__root-list">
                  {rootCollections.map((rootId) => (
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

        {!(draft.direction === 'import' && draft.target === 'project') && (
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

        {draft.direction === 'import' && (
          <>
            <div className="imp-exp-form__file">
              <Button onClick={() => void handleSelectFile()} disabled={formDisabled || busy}>
                {fileKindLabel(draft)} を選択…
              </Button>
              {draft.filePath && <span className="imp-exp-form__path">{draft.filePath}</span>}
            </div>
            {destinationReadOnly ? (
              <p className="simple-main__error">
                このプロジェクトは read-only です。検証はできますが、実行はできません。
              </p>
            ) : null}
          </>
        )}

        {collectionValidation && (
          <p className="imp-exp-form__hint">
            書込予定: {collectionValidation.writeCount} 件（id 指定{' '}
            {collectionValidation.existingIdCount} / 自動 ID {collectionValidation.autoIdCount}）
            {collectionValidation.skippedOutsideCount > 0
              ? ` / 宛先外除外 ${collectionValidation.skippedOutsideCount}`
              : ''}
            {collectionValidation.hasCollisions ? '' : ' / 検証 OK'}
          </p>
        )}

        {projectValidation && (
          <div className="imp-exp-form__hint-block">
            <p className="imp-exp-form__hint">
              件数: {projectValidation.documentCount} ／ ソース: {projectValidation.sourceProjectId}
              {projectValidation.includeSubcollections ? ' ／ サブコレ含む' : ''}
              {projectValidation.hasCollisions ? '' : ' ／ 検証 OK'}
            </p>
            {projectValidation.projectIdMismatch && (
              <label className="imp-exp-form__check">
                <input
                  type="checkbox"
                  checked={draft.acceptMismatch}
                  disabled={formDisabled}
                  onChange={(event) => onDraftChange({ acceptMismatch: event.target.checked })}
                />
                projectId が異なります。この宛先へインポートすることを確認しました
              </label>
            )}
          </div>
        )}

        {validateProgressLabel && busy && (
          <p className="imp-exp-form__hint">検証中 {validateProgressLabel}</p>
        )}

        {formError && <p className="simple-main__error">{formError}</p>}

        <div className="imp-exp-form__actions">
          {draft.direction === 'import' && (
            <Button
              onClick={() => void handleValidate()}
              disabled={!canValidate}
            >
              {busy && !jobRunning ? '検証中…' : '検証'}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void handleStart()}
            disabled={
              draft.direction === 'export'
                ? draft.target === 'collection'
                  ? !canStartExportCollection
                  : !canStartExportProject
                : draft.target === 'collection'
                  ? !canStartImportCollection
                  : !canStartImportProject
            }
          >
            {draft.direction === 'export' ? 'エクスポート' : 'インポート実行'}
          </Button>
        </div>
      </div>

      {job ? (
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
      )}
    </div>
  )
}

export default ImpExpView
