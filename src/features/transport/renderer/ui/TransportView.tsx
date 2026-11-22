import { tr } from '@shared/i18n/shared/current'
import { useEffect, useState } from 'react'
import type { TransportDraft } from '@features/transport/shared/transport'
import type { TransportProgress, TransportValidation } from '@features/transport/shared/types'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import type { WorkspaceAuthType, WorkspaceEntry } from '@features/workspace/shared/types'
import { workspaceAuthLabel } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import JobSplitLayout from '@shared/ui/JobSplitLayout'
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

function projectOptionLabel(
  entry: WorkspaceEntry,
  writeBlockedReasons: Record<string, string>
): string {
  const kind = workspaceAuthLabel(entry.authType)
  const name = entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id
  const readOnly = entry.readOnly ? tr('tp.read_only_suffix') : ''
  const blocked = writeBlockedReasons[entry.id] ? tr('tp.blocked_suffix') : ''
  return `${kind} · ${name}${readOnly}${blocked}`
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
  const [writeBlockedReasons, setWriteBlockedReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [validateProgress, setValidateProgress] = useState<TransportProgress | null>(null)

  const destinations = entries.filter((entry) => entry.id !== sourceProjectId)
  const destination =
    destinations.find((entry) => entry.id === draft.destinationProjectId) ?? destinations[0] ?? null
  const destinationId = destination?.id ?? ''
  const destinationReadOnly = destination?.readOnly ?? false
  const destinationWriteBlockedReason = writeBlockedReasons[destinationId] ?? null
  const destinationLocked = destinationReadOnly || Boolean(destinationWriteBlockedReason)

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
      setFormError(t('tp.err_select_dest'))
      return null
    }

    if (destinationId === sourceProjectId) {
      setFormError(t('tp.err_same_project'))
      return null
    }

    if (draft.target === 'collection') {
      const sourcePath = sourceCollectionPath.trim()
      const destPath = draft.destinationCollectionPath.trim()
      if (!sourcePath) {
        setFormError(t('tp.err_pick_source'))
        return null
      }

      if (!destPath) {
        setFormError(t('tp.err_dest_collection'))
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
      setFormError(t('tp.err_select_roots'))
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
      setFormError(t('tp.err_select_dest'))
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

    if (destinationLocked) {
      setFormError(destinationWriteBlockedReason ?? t('dt.err_read_only'))
      return
    }

    const loaded = await ensureDestinationLoaded()
    if (!loaded) {
      return
    }

    const latest = await window.api.workspace.getState()
    const blocked = latest.writeBlockedReasons[loaded]
    if (blocked) {
      setWriteBlockedReasons(latest.writeBlockedReasons)
      setFormError(blocked)
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
    !destinationLocked
  const canStartProject =
    draft.target === 'project' &&
    draft.selectedRoots.length > 0 &&
    Boolean(destinationId) &&
    !destinationLocked
  const canStart =
    !busy && !formDisabled && (draft.target === 'collection' ? canStartCollection : canStartProject)
  const canValidate =
    !busy &&
    !formDisabled &&
    Boolean(destinationId) &&
    (draft.target === 'collection'
      ? Boolean(sourceCollectionPath.trim()) && Boolean(draft.destinationCollectionPath.trim())
      : draft.selectedRoots.length > 0)
  const validateProgressLabel = validateProgress
    ? `${t('tp.progress', { count: validateProgress.processedCount, collisions: validateProgress.skippedCount })}${
        validateProgress.detail ? ` / ${validateProgress.detail}` : ''
      }`
    : null
  const sourceKindLabel = sourceAuthType === 'emulator' ? t('menu.emulator') : t('menu.cloud')

  return (
    <div className="imp-exp-view imp-exp-view--job">
      <JobSplitLayout
        form={
          <div className="imp-exp-form">
            <h1 className="imp-exp-form__title">{t('menu.transport')}</h1>
            <div className="imp-exp-form__toggles">
              <ToggleBar
                ariaLabel={t('dt.target')}
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

            <p className="imp-exp-form__lead">{t('tp.lead')}</p>

            <div className="imp-exp-form__hint-block">
              <p className="imp-exp-form__hint">
                {t('tp.source')} · {sourceKindLabel} · {sourceLabel || sourceProjectId}
              </p>
              {draft.target === 'collection' ? (
                <p className="imp-exp-form__hint">
                  {t('explorer.kind_collection')} · {sourceCollectionPath || t('tp.pick_in_tree')}
                </p>
              ) : null}
            </div>

            <label className="imp-exp-form__field">
              {t('tp.destination')}
              <select
                className="bulk-actions__input"
                value={destinationId}
                disabled={formDisabled || destinations.length === 0}
                onChange={(event) => {
                  resetValidation({ destinationProjectId: event.target.value })
                }}
              >
                {destinations.length === 0 ? (
                  <option value="">{t('tp.no_other_projects')}</option>
                ) : (
                  destinations.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {projectOptionLabel(entry, writeBlockedReasons)}
                    </option>
                  ))
                )}
              </select>
            </label>

            {draft.target === 'collection' && (
              <label className="imp-exp-form__field">
                {t('tp.dest_collection')}
                <input
                  className="bulk-actions__input"
                  value={draft.destinationCollectionPath}
                  disabled={formDisabled}
                  placeholder={sourceCollectionPath || 'users'}
                  aria-label={t('tp.dest_collection_path')}
                  onChange={(event) => {
                    resetValidation({ destinationCollectionPath: event.target.value })
                  }}
                />
              </label>
            )}

            {draft.target === 'project' && (
              <div className="imp-exp-form__roots">
                {sourceRootCollections.length === 0 ? (
                  <p className="imp-exp-form__hint">{t('dt.no_roots')}</p>
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
                      {t('dt.select_all_count', {
                        selected: selectedCount,
                        total: sourceRootCollections.length
                      })}
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
              {t('explorer.include_subcollections')}
            </label>

            {destinationReadOnly ? (
              <p className="simple-main__error">{t('dt.read_only_validate_only')}</p>
            ) : destinationWriteBlockedReason ? (
              <p className="simple-main__error">{destinationWriteBlockedReason}</p>
            ) : null}

            {draft.validation && (
              <p className="imp-exp-form__hint">
                {t('tp.validation_summary', {
                  count: draft.validation.documentCount,
                  writes: draft.validation.writeCount,
                  collisions: draft.validation.collisionCount
                })}
                {draft.validation.collisionSamples.length > 0
                  ? t('tp.examples', { list: draft.validation.collisionSamples.join(', ') })
                  : ''}
              </p>
            )}

            {validateProgressLabel && busy && (
              <p className="imp-exp-form__hint">
                {t('dt.validating_progress', { progress: validateProgressLabel })}
              </p>
            )}

            {formError && <p className="simple-main__error">{formError}</p>}

            <div className="imp-exp-form__actions">
              <Button onClick={() => void handleValidate()} disabled={!canValidate}>
                {busy && !jobRunning ? t('dt.validating') : t('tp.validate')}
              </Button>
              <Button variant="primary" onClick={() => void handleStart()} disabled={!canStart}>
                {t('tp.run')}
              </Button>
            </div>
          </div>
        }
        log={
          job && job.kind === 'transport' ? (
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

export default TransportView
