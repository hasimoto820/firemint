import { useEffect, useMemo, useState } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import { matchesAutocompleteNeedle } from '@features/autocomplete/renderer/catalog'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'
import type { DiffDraft } from '@features/diff/shared/diff'
import { DIFF_PREVIEW_LIMIT, diffRowPreview } from '@features/diff/shared/diff'
import type {
  CollectionDiffProgress,
  CollectionDiffRow,
  CollectionDiffStatus
} from '@features/diff/shared/types'
import type { WorkspaceAuthType } from '@features/workspace/shared/types'
import AutocompleteInput from '@shared/ui/AutocompleteInput'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type DiffViewProps = {
  projectId: string
  sourceLabel: string
  sourceAuthType: WorkspaceAuthType
  rootCollections: string[]
  draft: DiffDraft
  onDraftChange: (patch: Partial<DiffDraft>) => void
}

function statusLabel(status: CollectionDiffStatus): string {
  switch (status) {
    case 'json_only':
      return 'JSON'
    case 'collection_only':
      return 'コレクション'
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
  rootCollections,
  draft,
  onDraftChange
}: DiffViewProps): React.JSX.Element {
  const t = useT()
  const autocomplete = useOptionalAutocompleteApi()
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<CollectionDiffProgress | null>(null)

  const collectionItems = useMemo(() => {
    void autocomplete.revision
    const fromPool = autocomplete.query(projectId, draft.collectionPath, ['collection_path'])
    const seen = new Set(fromPool.map((item) => item.value))
    const needle = draft.collectionPath.trim().toLowerCase()
    const extras: AutocompleteItem[] = []

    for (const rootId of rootCollections) {
      if (seen.has(rootId)) {
        continue
      }

      if (needle && !matchesAutocompleteNeedle(rootId, needle)) {
        continue
      }

      extras.push({ kind: 'collection_path', value: rootId })
    }

    return extras.length === 0 ? fromPool : [...fromPool, ...extras]
  }, [autocomplete, draft.collectionPath, projectId, rootCollections])

  useEffect(() => {
    if (!projectId) {
      return
    }

    autocomplete.addCollectionPaths(projectId, rootCollections)
  }, [autocomplete, projectId, rootCollections])

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

  const handleSelectFile = async (): Promise<void> => {
    const result = await window.api.diff.selectJson()
    if (result.canceled || !result.filePath) {
      return
    }

    const nextPath = result.filePath
    if (draft.collectionPath.trim()) {
      resetResult({ filePath: nextPath })
      return
    }

    const peek = await window.api.diff.peekJson(nextPath)
    resetResult({
      filePath: nextPath,
      collectionPath: peek.ok && peek.collectionPath ? peek.collectionPath : draft.collectionPath
    })
    if (!peek.ok) {
      setFormError(peek.error)
    }
  }

  const handleCompare = async (): Promise<void> => {
    const collectionPath = draft.collectionPath.trim()
    if (!collectionPath) {
      setFormError('コレクションを指定してください')
      return
    }

    if (!draft.filePath) {
      setFormError('JSON ファイルを選んでください')
      return
    }

    setBusy(true)
    setProgress(null)
    setFormError(null)
    setExportMessage(null)
    onDraftChange({ result: null })

    try {
      const result = await window.api.diff.compareCollection({
        projectId,
        collectionPath,
        filePath: draft.filePath,
        includeSubcollections: draft.includeSubcollections
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

  const handleExport = async (): Promise<void> => {
    if (!draft.result) {
      return
    }

    setExportBusy(true)
    setFormError(null)
    setExportMessage(null)

    try {
      const result = await window.api.diff.exportReport(draft.result)
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

  const canCompare =
    !busy && Boolean(draft.collectionPath.trim()) && Boolean(draft.filePath)
  const result = draft.result
  const previewRows: CollectionDiffRow[] = result ? diffRowPreview(result) : []
  const showPath = Boolean(result?.includeSubcollections)
  const sourceKindLabel = sourceAuthType === 'emulator' ? t('menu.emulator') : t('menu.cloud')
  const progressLabel = progress
    ? `${progress.processedCount} 件${progress.detail ? ` / ${progress.detail}` : ''}`
    : null

  return (
    <div className="imp-exp-view imp-exp-view--diff">
      <div className="imp-exp-form">
        <h1 className="imp-exp-form__title">{t('menu.diff')}</h1>
        <p className="imp-exp-form__lead">
          コレクションと JSON を比べます。どちらにも追加・削除・変更はしません。
        </p>

        <div className="imp-exp-form__hint-block">
          <p className="imp-exp-form__hint">
            {sourceKindLabel} · {sourceLabel || projectId}
          </p>
        </div>

        <label className="imp-exp-form__field">
          コレクション
          <AutocompleteInput
            value={draft.collectionPath}
            items={collectionItems}
            disabled={busy}
            placeholder="equipment / users/uid/posts"
            aria-label="コレクション path"
            onChange={(value) => {
              resetResult({ collectionPath: value })
            }}
          />
        </label>

        <label className="imp-exp-form__check">
          <input
            type="checkbox"
            checked={draft.includeSubcollections}
            disabled={busy}
            onChange={(event) => {
              resetResult({ includeSubcollections: event.target.checked })
            }}
          />
          サブコレクションを含む
        </label>

        <div className="imp-exp-form__file">
          <Button onClick={() => void handleSelectFile()} disabled={busy}>
            JSON を選択…
          </Button>
          {draft.filePath && <span className="imp-exp-form__path">{draft.filePath}</span>}
        </div>

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
            JSON {result.jsonCount} ／ コレクション {result.collectionCount} ／ JSON だけ{' '}
            {result.jsonOnlyCount} ／ コレクションだけ {result.collectionOnlyCount} ／ 中身が違う{' '}
            {result.changedCount} ／ 同じ {result.sameCount} ／ id無が {result.missingIdCount} 行
            {result.skippedOutsideCount > 0
              ? ` ／ 宛先外除外 ${result.skippedOutsideCount}`
              : ''}
          </p>
        )}
      </div>

      <div className="document-table-panel diff-table-panel">
        <div className="document-table-panel__toolbar">
          <Button onClick={() => void handleExport()} disabled={!result || exportBusy || busy}>
            {exportBusy ? '保存中…' : '結果を排出'}
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
                {showPath ? <th>path</th> : null}
                <th>固有</th>
                <th>JSON</th>
                <th>コレクション</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td className="document-table__empty" colSpan={showPath ? 5 : 4}>
                    {result ? '同じものだけです' : '—'}
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.path}>
                    <td>{row.id}</td>
                    {showPath ? <td className="diff-table__path">{row.path}</td> : null}
                    <td>{statusLabel(row.status)}</td>
                    <td className="diff-table__json" title={formatData(row.json)}>
                      {formatData(row.json)}
                    </td>
                    <td className="diff-table__json" title={formatData(row.collection)}>
                      {formatData(row.collection)}
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
