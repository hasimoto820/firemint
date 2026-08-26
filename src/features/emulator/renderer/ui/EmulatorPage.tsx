import { useEffect, useMemo, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import { lastPathSegment } from '@features/data_transfer/shared/imp_exp'
import { DEFAULT_EMULATOR_HOST } from '@features/connection/shared/emulator'
import {
  emulatorPageIntent,
  emulatorPageModeFromIntent,
  type EmulatorPageDirection,
  type EmulatorPageMode,
  type EmulatorPageTarget
} from '@features/emulator/shared/types'
import type { ScriptJobSnapshot } from '@features/script_runner/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'
import JobSplitLayout from '@shared/ui/JobSplitLayout'
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

function EmulatorPage({
  mode,
  onModeChange,
  onClose,
  onWorkspaceChanged,
  defaultHost = DEFAULT_EMULATOR_HOST,
  destinationPoolId = null,
  destinationLabel = null,
  job = null,
  onCancelJob
}: EmulatorPageProps): React.JSX.Element {
  const t = useT()
  const autocomplete = useOptionalAutocompleteApi()
  const host = defaultHost
  const poolId = destinationPoolId
  const { direction, target } = emulatorPageIntent(mode)
  const jobRunning = job?.status === 'running'
  const formDisabled = jobRunning
  const [filePath, setFilePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [exportRoots, setExportRoots] = useState<string[]>([])
  const [selectedRoots, setSelectedRoots] = useState<string[]>([])
  const [collectionPath, setCollectionPath] = useState('')
  const [includeSubcollections, setIncludeSubcollections] = useState(true)

  useEffect(() => {
    setFilePath(null)
    setError(null)
    setSuccess(null)
  }, [mode])

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

  const importSuccessMessage = (writtenCount: number, skippedCount: number): string => {
    if (skippedCount > 0) {
      return t('emulator.import_success_with_skip', {
        count: writtenCount,
        skipped: skippedCount
      })
    }

    return t('emulator.import_success', { count: writtenCount })
  }

  const finish = async (message: string): Promise<void> => {
    setSuccess(message)
    await onWorkspaceChanged()
  }

  const handleSelectZip = async (): Promise<void> => {
    setError(null)
    setSuccess(null)
    const selected = await window.api.dataTransfer.selectOfficialDump()

    if (selected.canceled || !selected.filePath) {
      return
    }

    setFilePath(selected.filePath)
  }

  const handleImportZip = async (): Promise<void> => {
    if (!filePath) {
      setError(t('emulator.select_zip'))
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await window.api.emulator.importProjectZip({
        host,
        filePath
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await finish(importSuccessMessage(result.writtenCount, 0))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!poolId) {
      setError(t('emulator.no_destination'))
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
          setError('コレクション path を指定してください')
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_collection',
          projectId: poolId,
          collectionPath: path,
          includeSubcollections
        })

        if (!result.ok && !result.canceled) {
          setError(result.error)
        }
        return
      }

      if (target === 'group') {
        const collectionId = lastPathSegment(collectionPath)
        if (!collectionId) {
          setError('グループ名（コレクション ID）を指定してください')
          return
        }

        const result = await window.api.scriptRunner.start({
          kind: 'export_group',
          projectId: poolId,
          collectionId
        })

        if (!result.ok && !result.canceled) {
          setError(result.error)
        }
        return
      }

      if (selectedRoots.length === 0) {
        setError('エクスポートするルートコレクションを選んでください')
        return
      }

        const result = await window.api.scriptRunner.start({
        kind: 'export_project',
        projectId: poolId,
        rootCollectionIds: selectedRoots,
        includeSubcollections: true
      })

      if (!result.ok && !result.canceled) {
        setError(result.error)
      }
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

  const destinationText =
    destinationLabel ?? destinationPoolId ?? t('emulator.no_destination')
  const selectedCount = selectedRoots.length
  const allSelected = exportRoots.length > 0 && selectedCount === exportRoots.length
  const canStartExportCollection =
    Boolean(poolId) && Boolean(collectionPath.trim()) && !busy && !formDisabled
  const canStartExportGroup =
    Boolean(poolId) && Boolean(lastPathSegment(collectionPath)) && !busy && !formDisabled
  const canStartExportProject =
    Boolean(poolId) && selectedRoots.length > 0 && !busy && !formDisabled
  const togglesDisabled = busy || formDisabled

  return (
    <section className="connection-panel emulator-page">
      <JobSplitLayout
        form={
          <>
      <div className="imp-exp-form">
        <h1 className="imp-exp-form__title">{t('menu.emulator')}</h1>
        <div className="imp-exp-form__toggles">
          <ToggleBar
            ariaLabel="向き"
            value={direction}
            disabled={togglesDisabled}
            options={[
              { id: 'import', label: 'Import' },
              { id: 'export', label: 'Export' }
            ]}
            onChange={setDirection}
          />
          {direction === 'export' ? (
            <ToggleBar
              ariaLabel="対象"
              value={target}
              disabled={togglesDisabled}
              options={[
                { id: 'collection', label: 'Collection' },
                { id: 'group', label: 'Group' },
                { id: 'project', label: 'Project' }
              ]}
              onChange={setTarget}
            />
          ) : null}
        </div>
        <p className="imp-exp-form__lead">{lead}</p>

        {mode === 'import-project' && (
          <>
            <div className="connection-panel__actions">
              <Button onClick={() => void handleSelectZip()} disabled={busy}>
                {t('emulator.select_zip')}
              </Button>
            </div>
            {filePath && <p className="connection-panel__file">{filePath}</p>}
            <div className="connection-panel__actions">
              <Button
                onClick={() => void handleImportZip()}
                disabled={busy || !filePath}
                variant="primary"
              >
                {t('emulator.import')}
              </Button>
              <Button onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {mode === 'export-collection' && (
          <>
            <p className="emulator-page__destination">
              プロジェクト: {destinationText}
            </p>
            <label className="imp-exp-form__field">
              コレクション
              <AutocompleteInput
                value={collectionPath}
                items={collectionItems}
                disabled={formDisabled || !poolId}
                placeholder="equipment / users/uid/posts"
                aria-label="コレクション path"
                onChange={setCollectionPath}
              />
            </label>
          </>
        )}

        {mode === 'export-group' && (
          <>
            <p className="emulator-page__destination">
              プロジェクト: {destinationText}
            </p>
            <label className="imp-exp-form__field">
              グループ（コレクション ID）
              <AutocompleteInput
                value={collectionPath}
                items={groupItems}
                disabled={formDisabled || !poolId}
                placeholder="posts"
                aria-label="コレクション ID"
                onChange={(value) => {
                  setCollectionPath(value.includes('/') ? lastPathSegment(value) : value)
                }}
              />
            </label>
          </>
        )}

        {mode === 'export-project' && (
          <>
            {!poolId && (
              <p className="emulator-page__destination">{t('emulator.no_destination')}</p>
            )}
            <div className="imp-exp-form__roots">
              {exportRoots.length === 0 ? (
                <p className="imp-exp-form__hint">ルートコレクションがありません。</p>
              ) : (
                <>
                  <label className="imp-exp-form__check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={formDisabled}
                      onChange={() =>
                        setSelectedRoots(allSelected ? [] : [...exportRoots])
                      }
                    />
                    すべて選択（{selectedCount}/{exportRoots.length}）
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
                サブコレクションを含む
              </label>
            )}
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
                エクスポート
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
                <Button onClick={() => onCancelJob?.()}>中止</Button>
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
    </section>
  )
}

export default EmulatorPage
