import { useEffect, useMemo, useState } from 'react'
import type { ExportProjectProgress } from '@features/data_transfer/shared/types'
import Button from '@shared/ui/Button'

type ProjectExportDialogProps = {
  projectId: string
  open: boolean
  onClose: () => void
}

function ProjectExportDialog({
  projectId,
  open,
  onClose
}: ProjectExportDialogProps): React.JSX.Element | null {
  const [roots, setRoots] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeSubcollections, setIncludeSubcollections] = useState(false)
  const [loadingRoots, setLoadingRoots] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState<ExportProjectProgress | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    const load = async (): Promise<void> => {
      setLoadingRoots(true)
      setError(null)
      setSuccess(null)
      setProgress(null)
      setIncludeSubcollections(false)

      try {
        const result = await window.api.explorer.listRootCollections(projectId)
        if (cancelled) {
          return
        }

        if (!result.ok) {
          setError(result.error)
          setRoots([])
          setSelected(new Set())
          return
        }

        setRoots(result.data)
        setSelected(new Set(result.data))
      } finally {
        if (!cancelled) {
          setLoadingRoots(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, projectId])

  useEffect(() => {
    if (!open || !exporting) {
      return
    }

    return window.api.dataTransfer.onExportProjectProgress((next) => {
      setProgress(next)
    })
  }, [open, exporting])

  const selectedCount = selected.size
  const allSelected = roots.length > 0 && selectedCount === roots.length

  const progressLabel = useMemo(() => {
    if (!progress) {
      return null
    }

    if (progress.phase === 'zipping') {
      return `ZIP 作成中…（${progress.documentCount} 件）`
    }

    if (progress.phase === 'done') {
      return `完了（${progress.documentCount} 件）`
    }

    const collection = progress.currentCollectionPath ?? '—'
    return `${progress.documentCount} 件 / ${collection} / ${progress.percent}%`
  }, [progress])

  if (!open) {
    return null
  }

  const toggleRoot = (rootId: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(rootId)) {
        next.delete(rootId)
      } else {
        next.add(rootId)
      }
      return next
    })
  }

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(roots))
  }

  const handleExport = async (): Promise<void> => {
    if (selectedCount === 0) {
      setError('エクスポートするルートコレクションを選んでください')
      return
    }

    setExporting(true)
    setError(null)
    setSuccess(null)
    setProgress({
      phase: 'reading',
      documentCount: 0,
      currentCollectionPath: null,
      completedRootCount: 0,
      totalRootCount: selectedCount,
      percent: 0
    })

    try {
      const result = await window.api.dataTransfer.exportProject({
        projectId,
        rootCollectionIds: Array.from(selected),
        includeSubcollections
      })

      if (result.ok) {
        const scope = result.data.includeSubcollections
          ? '（サブコレクション含む）'
          : '（ルート一段）'
        setSuccess(
          `${result.data.documentCount} 件${scope}を ${result.data.filePath} に保存しました`
        )
        return
      }

      if (!result.canceled) {
        setError(result.error)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={exporting ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">プロジェクトをエクスポート</h2>
          <p className="project-export-dialog__lead">
            プロジェクト <code>{projectId}</code> のルートコレクションを ZIP に書き出します。
          </p>
        </header>

        {loadingRoots && <p className="project-export-dialog__hint">ルート一覧を読み込み中…</p>}

        {!loadingRoots && roots.length === 0 && !error && (
          <p className="project-export-dialog__hint">ルートコレクションがありません。</p>
        )}

        {roots.length > 0 && (
          <div className="project-export-dialog__roots">
            <div className="project-export-dialog__roots-toolbar">
              <label className="project-export-dialog__check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={exporting}
                  onChange={toggleAll}
                />
                すべて選択（{selectedCount}/{roots.length}）
              </label>
            </div>
            <ul className="project-export-dialog__list">
              {roots.map((rootId) => (
                <li key={rootId}>
                  <label className="project-export-dialog__check">
                    <input
                      type="checkbox"
                      checked={selected.has(rootId)}
                      disabled={exporting}
                      onChange={() => toggleRoot(rootId)}
                    />
                    {rootId}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="project-export-dialog__check project-export-dialog__option">
          <input
            type="checkbox"
            checked={includeSubcollections}
            disabled={exporting}
            onChange={(event) => setIncludeSubcollections(event.target.checked)}
          />
          サブコレクションを含む
        </label>

        {progressLabel && (
          <div className="project-export-dialog__progress">
            <div
              className="project-export-dialog__progress-bar"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
            <p className="project-export-dialog__progress-label">{progressLabel}</p>
          </div>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}
        {success && <p className="project-export-dialog__success">{success}</p>}

        <footer className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={exporting}>
            {success ? '閉じる' : 'キャンセル'}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            disabled={exporting || loadingRoots || selectedCount === 0 || Boolean(success)}
          >
            {exporting ? 'エクスポート中…' : 'エクスポート'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

export default ProjectExportDialog
