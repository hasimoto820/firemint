import { useEffect, useState } from 'react'
import type { DiffDraft } from '@features/diff/shared/diff'
import { DIFF_PREVIEW_LIMIT, diffRowPreview } from '@features/diff/shared/diff'
import type { DiffProgress, DiffRow, DiffRowStatus, DiffExportFormat } from '@features/diff/shared/types'
import type { WorkspaceAuthType } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

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
      return 'ダンプ'
    case 'project_only':
      return 'プロジェクト'
    case 'changed':
      return '中身が違う'
  }
}

function formatData(data: Record<string, unknown> | null): string {
  if (!data) {
    return '—'
  }

  return JSON.stringify(data)
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
      setFormError('フォルダ / ZIP を選んでください')
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

      setExportMessage(`保存しました: ${result.data.filePath}`)
    } finally {
      setExportBusy(false)
    }
  }

  const canCompare = !busy && Boolean(draft.dumpPath)
  const result = draft.result
  const previewRows: DiffRow[] = result ? diffRowPreview(result) : []
  const sourceKindLabel = sourceAuthType === 'emulator' ? t('menu.emulator') : t('menu.cloud')
  const progressLabel = progress
    ? `${progress.processedCount} 件${progress.detail ? ` / ${progress.detail}` : ''}`
    : null
  const sourceMismatch =
    draft.peek?.sourceProjectId &&
    draft.peek.sourceProjectId !== projectId.replace(/_emulator$/, '')

  return (
    <div className="imp-exp-view imp-exp-view--diff">
      <div className="imp-exp-form">
        <h1 className="imp-exp-form__title">{t('menu.diff')}</h1>
        <p className="imp-exp-form__lead">
          ダンプと、今のプロジェクトを path どおり比べます。どちらにも書きません。
        </p>

        <div className="imp-exp-form__hint-block">
          <p className="imp-exp-form__hint">
            {sourceKindLabel} · {sourceLabel || projectId}
          </p>
        </div>

        <div className="imp-exp-form__file">
          <Button onClick={() => void handleSelectDump()} disabled={busy}>
            フォルダ / ZIP を選択…
          </Button>
          {draft.dumpPath && <span className="imp-exp-form__path">{draft.dumpPath}</span>}
        </div>

        {draft.peek && (
          <p className="imp-exp-form__hint">
            ダンプ {draft.peek.documentCount} 件
            {draft.peek.sourceProjectId ? ` ／ 出所 ${draft.peek.sourceProjectId}` : ''}
            {draft.peek.samplePaths.length > 0
              ? ` ／ 例 ${draft.peek.samplePaths.slice(0, 3).join(', ')}`
              : ''}
          </p>
        )}
        {sourceMismatch && (
          <p className="imp-exp-form__hint">
            ダンプの projectId と今のプロジェクトが違います。path どおり比べます。
          </p>
        )}

        {progressLabel && busy && <p className="imp-exp-form__hint">比較中 {progressLabel}</p>}
        {formError && <p className="simple-main__error">{formError}</p>}
        {exportMessage && <p className="simple-main__success">{exportMessage}</p>}

        <div className="imp-exp-form__actions">
          <Button variant="primary" onClick={() => void handleCompare()} disabled={!canCompare}>
            {busy ? '比較中…' : '比較'}
          </Button>
        </div>

        {result && (
          <p className="imp-exp-form__hint">
            ダンプ {result.dumpCount} ／ プロジェクト {result.projectCount} ／ ダンプだけ{' '}
            {result.dumpOnlyCount} ／ プロジェクトだけ {result.projectOnlyCount} ／ 中身が違う{' '}
            {result.changedCount} ／ 同じ {result.sameCount}
          </p>
        )}
      </div>

      <div className="document-table-panel diff-table-panel">
        <div className="document-table-panel__toolbar">
          <Button
            onClick={() => void handleExport('json')}
            disabled={!result || exportBusy || busy}
          >
            {exportBusy ? '保存中…' : 'レポート JSON'}
          </Button>
          <Button
            onClick={() => void handleExport('csv')}
            disabled={!result || exportBusy || busy}
          >
            {exportBusy ? '保存中…' : 'レポート CSV'}
          </Button>
          {result ? (
            <span className="document-table-panel__count">
              {result.rows.length === 0
                ? '差分はありません'
                : result.rows.length > DIFF_PREVIEW_LIMIT
                  ? `先頭 ${DIFF_PREVIEW_LIMIT} 件（差分 ${result.rows.length} 件）`
                  : `差分 ${result.rows.length} 件`}
            </span>
          ) : (
            <span className="document-table-panel__count">比較すると差分がここに出ます</span>
          )}
        </div>

        <div className="document-table__wrap">
          <table className="document-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>path</th>
                <th>固有</th>
                <th>ダンプ</th>
                <th>プロジェクト</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td className="document-table__empty" colSpan={5}>
                    {result ? '同じものだけです' : '—'}
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.path}>
                    <td>{row.id}</td>
                    <td className="diff-table__path">{row.path}</td>
                    <td>{statusLabel(row.status)}</td>
                    <td className="diff-table__json" title={formatData(row.dump)}>
                      {formatData(row.dump)}
                    </td>
                    <td className="diff-table__json" title={formatData(row.project)}>
                      {formatData(row.project)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default DiffView
