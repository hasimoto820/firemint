import { tr } from '@shared/i18n/shared/current'
import { useEffect, useState } from 'react'
import type { DiffDraft } from '@features/diff/shared/diff'
import { DIFF_PREVIEW_LIMIT, diffRowPreview } from '@features/diff/shared/diff'
import type {
  DiffProgress,
  DiffRow,
  DiffRowStatus,
  DiffExportFormat
} from '@features/diff/shared/types'
import type { WorkspaceAuthType } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import ColumnResizeHandle from '@shared/ui/ColumnResizeHandle'
import SplitPane from '@shared/ui/SplitPane'
import { useColumnWidths } from '@shared/ui/column_widths'
import { useT } from '@shared/i18n/renderer/I18nProvider'

const DIFF_COLUMNS = [
  { key: 'id', label: 'ID', className: undefined },
  { key: 'path', label: 'path', className: 'diff-table__path' },
  { key: 'status', label: 'diff.col_unique', className: undefined },
  { key: 'dump', label: 'diff.col_dump', className: 'diff-table__json' },
  { key: 'project', label: 'diff.col_project', className: 'diff-table__json' }
] as const

const DIFF_COLUMN_DEFAULTS: Record<string, number> = {
  id: 88,
  path: 220,
  status: 96,
  dump: 180,
  project: 180
}

type DiffViewProps = {
  projectId: string
  sourceLabel: string
  sourceAuthType: WorkspaceAuthType
  draft: DiffDraft
  onDraftChange: (patch: Partial<DiffDraft>) => void
}

function statusLabel(status: DiffRowStatus): string {
  switch (status) {
    case 'dump_only':
      return tr('diff.dump_only')
    case 'project_only':
      return tr('diff.project_only')
    case 'changed':
      return tr('diff.changed')
  }
}

function formatData(data: Record<string, unknown> | null): string {
  if (!data) {
    return '—'
  }

  return JSON.stringify(data)
}

function cellText(row: DiffRow, key: (typeof DIFF_COLUMNS)[number]['key']): string {
  switch (key) {
    case 'id':
      return row.id
    case 'path':
      return row.path
    case 'status':
      return statusLabel(row.status)
    case 'dump':
      return formatData(row.dump)
    case 'project':
      return formatData(row.project)
  }
}

function DiffView({
  projectId,
  sourceLabel,
  sourceAuthType,
  draft,
  onDraftChange
}: DiffViewProps): React.JSX.Element {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<DiffProgress | null>(null)

  useEffect(() => {
    if (!busy) {
      return
    }

    return window.api.diff.onCompareProgress(setProgress)
  }, [busy])

  const resetResult = (patch: Partial<DiffDraft> = {}): void => {
    onDraftChange({
      result: null,
      ...patch
    })
    setProgress(null)
    setFormError(null)
    setExportMessage(null)
  }

  const handleSelectDump = async (): Promise<void> => {
    const selected = await window.api.dataTransfer.selectOfficialDump()
    if (selected.canceled || !selected.filePath) {
      return
    }

    const nextPath = selected.filePath
    const peek = await window.api.diff.peekDump(nextPath)
    if (!peek.ok) {
      resetResult({ dumpPath: nextPath, peek: null })
      setFormError(peek.error)
      return
    }

    resetResult({
      dumpPath: nextPath,
      peek: {
        documentCount: peek.documentCount,
        samplePaths: peek.samplePaths,
        sourceProjectId: peek.sourceProjectId
      }
    })
  }

  const handleCompare = async (): Promise<void> => {
    if (!draft.dumpPath) {
      setFormError(t('diff.err_select_folder_zip'))
      return
    }

    setBusy(true)
    setProgress(null)
    setFormError(null)
    setExportMessage(null)
    onDraftChange({ result: null })

    try {
      const result = await window.api.diff.compareDump({
        projectId,
        dumpPath: draft.dumpPath
      })

      if (!result.ok) {
        if (!result.canceled) {
          setFormError(result.error)
        }
        return
      }

      onDraftChange({ result: result.data })
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (format: DiffExportFormat): Promise<void> => {
    if (!draft.result) {
      return
    }

    setExportBusy(true)
    setFormError(null)
    setExportMessage(null)

    try {
      const result = await window.api.diff.exportReport(draft.result, format)
      if (!result.ok) {
        if (!result.canceled) {
          setFormError(result.error)
        }
        return
      }

      setExportMessage(t('diff.saved', { path: result.data.filePath }))
    } finally {
      setExportBusy(false)
    }
  }

  const canCompare = !busy && Boolean(draft.dumpPath)
  const result = draft.result
  const previewRows: DiffRow[] = result ? diffRowPreview(result) : []
  const { widthOf, resizeBy, reset } = useColumnWidths('table.col:diff', DIFF_COLUMN_DEFAULTS)
  const tableWidth = DIFF_COLUMNS.reduce((sum, column) => sum + widthOf(column.key), 0)
  const sourceKindLabel = sourceAuthType === 'emulator' ? t('menu.emulator') : t('menu.cloud')
  const progressLabel = progress
    ? `${t('diff.count', { count: progress.processedCount })}${progress.detail ? ` / ${progress.detail}` : ''}`
    : null
  const sourceMismatch =
    draft.peek?.sourceProjectId &&
    draft.peek.sourceProjectId !== projectId.replace(/_emulator$/, '')

  return (
    <div className="imp-exp-view imp-exp-view--diff">
      <SplitPane
        className="diff-view__split"
        orientation="vertical"
        storageKey="diff.table"
        sizeTarget="second"
        defaultSize={58}
        unit="percent"
        minFirst={120}
        minSecond={120}
        ariaLabel={t('diff.table_height')}
        first={
          <div className="imp-exp-form">
            <h1 className="imp-exp-form__title">{t('menu.diff')}</h1>
            <p className="imp-exp-form__lead">{t('diff.lead')}</p>

            <div className="imp-exp-form__hint-block">
              <p className="imp-exp-form__hint">
                {sourceKindLabel} · {sourceLabel || projectId}
              </p>
            </div>

            <div className="imp-exp-form__file">
              <Button onClick={() => void handleSelectDump()} disabled={busy}>
                {t('diff.select_folder_zip')}
              </Button>
              {draft.dumpPath && <span className="imp-exp-form__path">{draft.dumpPath}</span>}
            </div>

            {draft.peek && (
              <p className="imp-exp-form__hint">
                {t('diff.peek_count', { count: draft.peek.documentCount })}
                {draft.peek.sourceProjectId
                  ? ` ／ ${t('diff.origin', { id: draft.peek.sourceProjectId })}`
                  : ''}
                {draft.peek.samplePaths.length > 0
                  ? ` ／ ${t('diff.example', { list: draft.peek.samplePaths.slice(0, 3).join(', ') })}`
                  : ''}
              </p>
            )}
            {sourceMismatch && <p className="imp-exp-form__hint">{t('diff.source_mismatch')}</p>}

            {progressLabel && busy && (
              <p className="imp-exp-form__hint">
                {t('diff.comparing_progress', { progress: progressLabel })}
              </p>
            )}
            {formError && <p className="simple-main__error">{formError}</p>}
            {exportMessage && <p className="simple-main__success">{exportMessage}</p>}

            <div className="imp-exp-form__actions">
              <Button variant="primary" onClick={() => void handleCompare()} disabled={!canCompare}>
                {busy ? t('diff.comparing') : t('diff.compare')}
              </Button>
            </div>

            {result && (
              <p className="imp-exp-form__hint">
                {t('diff.summary', {
                  dump: result.dumpCount,
                  project: result.projectCount,
                  dumpOnly: result.dumpOnlyCount,
                  projectOnly: result.projectOnlyCount,
                  changed: result.changedCount,
                  same: result.sameCount
                })}
              </p>
            )}
          </div>
        }
        second={
          <div className="document-table-panel diff-table-panel">
            <div className="document-table-panel__toolbar">
              <Button
                onClick={() => void handleExport('json')}
                disabled={!result || exportBusy || busy}
              >
                {exportBusy ? t('diff.saving') : t('diff.report_json')}
              </Button>
              <Button
                onClick={() => void handleExport('csv')}
                disabled={!result || exportBusy || busy}
              >
                {exportBusy ? t('diff.saving') : t('diff.report_csv')}
              </Button>
              {result ? (
                <span className="document-table-panel__count">
                  {result.rows.length === 0
                    ? t('diff.no_diff')
                    : result.rows.length > DIFF_PREVIEW_LIMIT
                      ? t('diff.head_of', { limit: DIFF_PREVIEW_LIMIT, total: result.rows.length })
                      : t('diff.diff_count', { count: result.rows.length })}
                </span>
              ) : (
                <span className="document-table-panel__count">{t('diff.hint')}</span>
              )}
            </div>

            <div className="document-table__wrap">
              <table className="document-table document-table--fixed" style={{ width: tableWidth }}>
                <colgroup>
                  {DIFF_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: widthOf(column.key) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {DIFF_COLUMNS.map((column) => (
                      <th key={column.key}>
                        {t(column.label)}
                        <ColumnResizeHandle
                          ariaLabel={t('ui.column_width', { column: t(column.label) })}
                          onResize={(delta) => resizeBy(column.key, delta)}
                          onReset={() => reset(column.key)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td className="document-table__empty" colSpan={DIFF_COLUMNS.length}>
                        {result ? t('diff.all_same') : '—'}
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => (
                      <tr key={row.path}>
                        {DIFF_COLUMNS.map((column) => {
                          const text = cellText(row, column.key)
                          return (
                            <td
                              key={column.key}
                              className={['document-table__cell', column.className]
                                .filter(Boolean)
                                .join(' ')}
                              title={text}
                            >
                              {text}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        }
      />
    </div>
  )
}

export default DiffView
