import { useEffect, useMemo, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import type { ImportProjectProgress } from '@features/data_transfer/shared/types'
import {
  lastPathSegment,
  type ImpExpDraft,
  type ImpExpIntent
} from '@features/data_transfer/shared/imp_exp'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'
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

function fileKindLabel(intent: ImpExpIntent): string {
  if (intent.direction === 'import') {
    return 'フォルダ / ZIP'
  }

  return 'ZIP'
}

function projectOptionLabel(
  entry: WorkspaceEntry,
  writeBlockedReasons: Record<string, string>,
  forImport: boolean
): string {
  const name = entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id
  if (forImport && entry.authType === 'emulator') {
    return `${name}（この Emulator に新規追加）`
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
  const showProjectSelect =
    draft.direction === 'import' ||
    draft.target === 'collection' ||
    draft.target === 'group'

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
    if (
      draft.direction === 'import' ||
      (draft.target !== 'collection' && draft.target !== 'group') ||
      !destinationId
    ) {
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
      collectionPath:
        target === 'group' ? lastPathSegment(draft.collectionPath) : draft.collectionPath,
      selectedRoots:
        target === 'project' &&
        draft.direction === 'export' &&
        draft.selectedRoots.length === 0
          ? rootCollections
          : draft.selectedRoots
    })
  }

  const handleSelectFile = async (): Promise<void> => {
    const result = await window.api.dataTransfer.selectOfficialDump()

    if (result.canceled || !result.filePath) {
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

    const state = await window.api.workspace.getState()
    setEntries(state.entries)
    setWriteBlockedReasons(state.writeBlockedReasons)

    return destinationId
  }

  const validateOfficial = async (): Promise<boolean> => {
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
      dumpPath: draft.filePath
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
    if (result.data.hasCollisions) {
      setFormError(
        `衝突があります（例: ${result.data.collisionSamples.join(', ')}）。実行するとその件はスキップします。`
      )
    }

    return true
  }

  const handleValidate = async (): Promise<void> => {
    setBusy(true)
    setValidateProgress(null)
    setFormError(null)
    onDraftChange({ projectValidation: null })

    try {
      await validateOfficial()
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
          collectionId
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
          includeSubcollections: true
        })

        if (!result.ok && !result.canceled) {
          setFormError(result.error)
        }
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

      const destEntry =
        entries.find((entry) => entry.id === loadedProjectId) ?? destination
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

      const result = await window.api.scriptRunner.start({
        kind: 'import_official',
        projectId: loadedProjectId,
        dumpPath: draft.filePath
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
    Boolean(draft.filePath) &&
    !destinationLocked &&
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
        </div>

        <p className="imp-exp-form__lead">
          {draft.direction === 'import'
            ? destination?.authType === 'emulator'
              ? 'この Emulator に、ダンプのプロジェクトを新しい行として入れます。既存のプロジェクトには混ぜません。書く先はダンプが持っている path です。'
              : '選んだクラウドプロジェクトへ、ダンプの path どおり書きます。衝突したドキュメントはスキップします。'
            : draft.target === 'group'
              ? '同じコレクション ID の全部（グループ）を zip に出します。'
              : draft.target === 'collection'
                ? 'この path の範囲を zip に出します。'
                : '選んだルートを zip に出します。'}
          ファイルは {fileKindLabel(draft)} です。
        </p>

        {showProjectSelect && (
          <label className="imp-exp-form__field">
            {draft.direction === 'import'
              ? destination?.authType === 'emulator'
                ? 'Emulator（新規プロジェクト）'
                : 'インポート先'
              : 'プロジェクト'}
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
                  {projectOptionLabel(entry, writeBlockedReasons, draft.direction === 'import')}
                </option>
              ))}
            </select>
          </label>
        )}

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

        {draft.direction === 'import' && (
          <>
            <div className="imp-exp-form__file">
              <Button onClick={() => void handleSelectFile()} disabled={formDisabled || busy}>
                {fileKindLabel(draft)} を選択…
              </Button>
              {draft.filePath && <span className="imp-exp-form__path">{draft.filePath}</span>}
            </div>
            {destination?.authType !== 'emulator' && destinationReadOnly ? (
              <p className="simple-main__error">
                このプロジェクトは read-only です。検証はできますが、実行はできません。
              </p>
            ) : destination?.authType !== 'emulator' && destinationWriteBlockedReason ? (
              <p className="simple-main__error">{destinationWriteBlockedReason}</p>
            ) : null}
          </>
        )}

        {projectValidation && (
          <div className="imp-exp-form__hint-block">
            <p className="imp-exp-form__hint">
              件数: {projectValidation.documentCount}
              {projectValidation.sourceProjectId
                ? ` ／ ダンプ: ${projectValidation.sourceProjectId}`
                : ''}
              {projectValidation.hasCollisions ? ' ／ 衝突あり（実行時スキップ）' : ' ／ 検証 OK'}
            </p>
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
                  : draft.target === 'group'
                    ? !canStartExportGroup
                    : !canStartExportProject
                : !canStartImport
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
