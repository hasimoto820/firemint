import { useEffect, useState } from 'react'
import type { TransportDraft } from '@features/transport/shared/transport'
import type { TransportProgress, TransportValidation } from '@features/transport/shared/types'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceAuthType, WorkspaceEntry } from '@features/workspace/shared/types'
import { workspaceAuthLabel } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type TransportViewProps = {
  sourceProjectId: string
  sourceLabel: string
  sourceAuthType: WorkspaceAuthType
  sourceCollectionPath: string
  sourceRootCollections: string[]
  draft: TransportDraft
  onDraftChange: (patch: Partial<TransportDraft>) => void
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

function projectOptionLabel(entry: WorkspaceEntry): string {
  const kind = workspaceAuthLabel(entry.authType)
  const name = entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id
  const readOnly = entry.readOnly ? '（read-only）' : ''
  return `${kind} · ${name}${readOnly}`
}

function TransportView({
  sourceProjectId,
  sourceLabel,
  sourceAuthType,
  sourceCollectionPath,
  sourceRootCollections,
  draft,
  onDraftChange,
  job,
  onCancel
}: TransportViewProps): React.JSX.Element {
  const t = useT()
  const jobRunning = job?.status === 'running'
  const formDisabled = jobRunning
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [validateProgress, setValidateProgress] = useState<TransportProgress | null>(null)

  const destinations = entries.filter((entry) => entry.id !== sourceProjectId)
  const destination =
    destinations.find((entry) => entry.id === draft.destinationProjectId) ?? destinations[0] ?? null
  const destinationId = destination?.id ?? ''
  const destinationReadOnly = destination?.readOnly ?? false

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
  }, [sourceProjectId])

  useEffect(() => {
    if (!destinationId || destinationId === draft.destinationProjectId) {
      return
    }

    onDraftChange({ destinationProjectId: destinationId, validation: null })
  }, [destinationId, draft.destinationProjectId, onDraftChange])

  useEffect(() => {
    if (draft.target !== 'project') {
      return
    }

    if (draft.selectedRoots.length > 0 || sourceRootCollections.length === 0) {
      return
    }

    onDraftChange({ selectedRoots: [...sourceRootCollections] })
  }, [draft.selectedRoots.length, draft.target, onDraftChange, sourceRootCollections])

  useEffect(() => {
    if (!busy) {
      return
    }

    return window.api.transport.onProgress(setValidateProgress)
  }, [busy])

  const resetValidation = (patch: Partial<TransportDraft> = {}): void => {
    onDraftChange({
      validation: null,
      ...patch
    })
    setValidateProgress(null)
    setFormError(null)
  }

  const buildInput = (): Parameters<typeof window.api.transport.validate>[0] | null => {
    if (!destinationId) {
      setFormError('コピー先のプロジェクトを選んでください')
      return null
    }

    if (destinationId === sourceProjectId) {
      setFormError('コピー先は別のプロジェクトを指定してください')
      return null
    }

    if (draft.target === 'collection') {
      const sourcePath = sourceCollectionPath.trim()
      const destPath = draft.destinationCollectionPath.trim()
      if (!sourcePath) {
        setFormError('左ツリーでコピー元のコレクションを選んでください')
        return null
      }

      if (!destPath) {
        setFormError('コピー先のコレクションを指定してください')
        return null
      }

      return {
        sourceProjectId,
        destinationProjectId: destinationId,
        target: 'collection',
        includeSubcollections: draft.includeSubcollections,
        sourceCollectionPath: sourcePath,
        destinationCollectionPath: destPath
      }
    }

    if (draft.selectedRoots.length === 0) {
      setFormError('コピーするルートコレクションを選んでください')
      return null
    }

    return {
      sourceProjectId,
      destinationProjectId: destinationId,
      target: 'project',
      includeSubcollections: draft.includeSubcollections,
      rootCollectionIds: draft.selectedRoots
    }
  }

  const ensureDestinationLoaded = async (): Promise<string | null> => {
    if (!destinationId) {
      setFormError('コピー先のプロジェクトを選んでください')
      return null
    }

    const result = await window.api.workspace.loadProject(destinationId)
    if (!result.ok) {
      setFormError(result.error)
      return null
    }

    return destinationId
  }

  const handleValidate = async (): Promise<TransportValidation | null> => {
    const input = buildInput()
    if (!input) {
      return null
    }

    const loaded = await ensureDestinationLoaded()
    if (!loaded) {
      return null
    }

    setBusy(true)
    setValidateProgress(null)
    setFormError(null)
    onDraftChange({ validation: null })

    try {
      const result = await window.api.transport.validate(input)
      if (!result.ok) {
        if (!result.canceled) {
          setFormError(result.error)
        }
        return null
      }

      onDraftChange({ validation: result.data })
      return result.data
    } finally {
      setBusy(false)
    }
  }

  const handleStart = async (): Promise<void> => {
    const input = buildInput()
    if (!input) {
      return
    }

    if (destinationReadOnly) {
      setFormError('このプロジェクトは read-only です')
      return
    }

    const loaded = await ensureDestinationLoaded()
    if (!loaded) {
      return
    }

    setBusy(true)
    setFormError(null)

    try {
      const result = await window.api.scriptRunner.start({
        kind: 'transport',
        ...input
      })

      if (!result.ok && !result.canceled) {
        setFormError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const selectedCount = draft.selectedRoots.length
  const allSelected =
    sourceRootCollections.length > 0 && selectedCount === sourceRootCollections.length
  const canStartCollection =
    draft.target === 'collection' &&
    Boolean(sourceCollectionPath.trim()) &&
    Boolean(draft.destinationCollectionPath.trim()) &&
    Boolean(destinationId) &&
    !destinationReadOnly
  const canStartProject =
    draft.target === 'project' &&
    draft.selectedRoots.length > 0 &&
    Boolean(destinationId) &&
    !destinationReadOnly
  const canStart = !busy && !formDisabled && (draft.target === 'collection' ? canStartCollection : canStartProject)
  const canValidate = !busy && !formDisabled && Boolean(destinationId) &&
    (draft.target === 'collection'
      ? Boolean(sourceCollectionPath.trim()) && Boolean(draft.destinationCollectionPath.trim())
      : draft.selectedRoots.length > 0)
  const validateProgressLabel = validateProgress
    ? `${validateProgress.processedCount} 件 / 衝突 ${validateProgress.skippedCount}${
        validateProgress.detail ? ` / ${validateProgress.detail}` : ''
      }`
    : null
  const sourceKindLabel = sourceAuthType === 'emulator' ? t('menu.emulator') : t('menu.cloud')

  return (
    <div className="imp-exp-view imp-exp-view--job">
      <div className="imp-exp-form">
        <h1 className="imp-exp-form__title">{t('menu.transport')}</h1>
        <div className="imp-exp-form__toggles">
          <ToggleBar
            ariaLabel="対象"
            value={draft.target}
            disabled={formDisabled}
            options={[
              { id: 'collection', label: t('menu.collection') },
              { id: 'project', label: t('menu.project') }
            ]}
            onChange={(target) => {
              resetValidation({
                target,
                destinationCollectionPath:
                  target === 'collection'
                    ? draft.destinationCollectionPath || sourceCollectionPath
                    : draft.destinationCollectionPath,
                selectedRoots:
                  target === 'project' && draft.selectedRoots.length === 0
                    ? [...sourceRootCollections]
                    : draft.selectedRoots
              })
            }}
          />
        </div>

        <p className="imp-exp-form__lead">
          コピー元は左ツリーの選択です。検証は任意です。衝突したドキュメントはスキップして先に進みます。
        </p>

        <div className="imp-exp-form__hint-block">
          <p className="imp-exp-form__hint">
            コピー元 · {sourceKindLabel} · {sourceLabel || sourceProjectId}
          </p>
          {draft.target === 'collection' ? (
            <p className="imp-exp-form__hint">
              コレクション · {sourceCollectionPath || '（左ツリーで選んでください）'}
            </p>
          ) : null}
        </div>

        <label className="imp-exp-form__field">
          コピー先
          <select
            className="bulk-actions__input"
            value={destinationId}
            disabled={formDisabled || destinations.length === 0}
            onChange={(event) => {
              resetValidation({ destinationProjectId: event.target.value })
            }}
          >
            {destinations.length === 0 ? (
              <option value="">つながっている別プロジェクトがありません</option>
            ) : (
              destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {projectOptionLabel(entry)}
                </option>
              ))
            )}
          </select>
        </label>

        {draft.target === 'collection' && (
          <label className="imp-exp-form__field">
            コピー先コレクション
            <input
              className="bulk-actions__input"
              value={draft.destinationCollectionPath}
              disabled={formDisabled}
              placeholder={sourceCollectionPath || 'users'}
              aria-label="コピー先コレクション path"
              onChange={(event) => {
                resetValidation({ destinationCollectionPath: event.target.value })
              }}
            />
          </label>
        )}

        {draft.target === 'project' && (
          <div className="imp-exp-form__roots">
            {sourceRootCollections.length === 0 ? (
              <p className="imp-exp-form__hint">ルートコレクションがありません。</p>
            ) : (
              <>
                <label className="imp-exp-form__check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={formDisabled}
                    onChange={() =>
                      resetValidation({
                        selectedRoots: allSelected ? [] : [...sourceRootCollections]
                      })
                    }
                  />
                  すべて選択（{selectedCount}/{sourceRootCollections.length}）
                </label>
                <ul className="imp-exp-form__root-list">
                  {sourceRootCollections.map((rootId) => (
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
                            resetValidation({ selectedRoots: Array.from(selected) })
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

        {destinationReadOnly ? (
          <p className="simple-main__error">
            このプロジェクトは read-only です。検証はできますが、実行はできません。
          </p>
        ) : null}

        {draft.validation && (
          <p className="imp-exp-form__hint">
            件数: {draft.validation.documentCount} ／ 書込予定: {draft.validation.writeCount} ／
            衝突: {draft.validation.collisionCount}
            {draft.validation.collisionSamples.length > 0
              ? `（例: ${draft.validation.collisionSamples.join(', ')}）`
              : ''}
          </p>
        )}

        {validateProgressLabel && busy && (
          <p className="imp-exp-form__hint">検証中 {validateProgressLabel}</p>
        )}

        {formError && <p className="simple-main__error">{formError}</p>}

        <div className="imp-exp-form__actions">
          <Button onClick={() => void handleValidate()} disabled={!canValidate}>
            {busy && !jobRunning ? '検証中…' : '検証'}
          </Button>
          <Button variant="primary" onClick={() => void handleStart()} disabled={!canStart}>
            実行
          </Button>
        </div>
      </div>

      {job && job.kind === 'transport' ? (
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

export default TransportView
