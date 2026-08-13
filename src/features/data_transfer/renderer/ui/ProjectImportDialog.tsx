import { useEffect, useMemo, useState } from 'react'
import type {
  ImportProjectProgress,
  ImportProjectValidation
} from '@features/data_transfer/shared/types'
import type { WorkspaceEntry } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'

type ProjectImportDialogProps = {
  projectId: string | null
  destinations: WorkspaceEntry[]
  open: boolean
  onClose: () => void
  onImported?: () => void
}

function ProjectImportDialog({
  projectId,
  destinations,
  open,
  onClose,
  onImported
}: ProjectImportDialogProps): React.JSX.Element | null {
  const [destinationId, setDestinationId] = useState(projectId ?? '')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [validation, setValidation] = useState<ImportProjectValidation | null>(null)
  const [acceptMismatch, setAcceptMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProjectProgress | null>(null)

  const destination = destinations.find((entry) => entry.id === destinationId) ?? destinations[0] ?? null
  const resolvedProjectId = destination?.id ?? ''
  const readOnly = destination?.readOnly ?? false

  useEffect(() => {
    if (!open) {
      return
    }

    const initial =
      (projectId && destinations.some((entry) => entry.id === projectId) ? projectId : null) ??
      destinations[0]?.id ??
      ''

    setDestinationId(initial)
    setFilePath(null)
    setValidation(null)
    setAcceptMismatch(false)
    setBusy(false)
    setError(null)
    setSuccess(null)
    setProgress(null)
  }, [open, projectId, destinations])

  useEffect(() => {
    if (!open || !busy) {
      return
    }

    return window.api.dataTransfer.onImportProjectProgress((next) => {
      setProgress(next)
    })
  }, [open, busy])

  const canImport = useMemo(() => {
    if (readOnly || !validation || validation.hasCollisions || Boolean(success) || busy) {
      return false
    }

    if (validation.projectIdMismatch && !acceptMismatch) {
      return false
    }

    return true
  }, [readOnly, validation, acceptMismatch, success, busy])

  const progressLabel = useMemo(() => {
    if (!progress) {
      return null
    }

    const detail = progress.detail ? ` / ${progress.detail}` : ''

    if (progress.phase === 'extracting') {
      return `展開中…${detail}`
    }

    if (progress.phase === 'validating') {
      return `検証中 ${progress.processedCount}/${progress.totalCount}${detail}`
    }

    if (progress.phase === 'writing') {
      return `書込中 ${progress.processedCount}/${progress.totalCount}${detail}`
    }

    return `完了 ${progress.processedCount} 件`
  }, [progress])

  if (!open) {
    return null
  }

  const handleSelectFile = async (): Promise<void> => {
    setError(null)
    setSuccess(null)
    setValidation(null)
    setAcceptMismatch(false)
    setProgress(null)

    const result = await window.api.dataTransfer.selectProjectImportZip()
    if (result.canceled || !result.filePath) {
      return
    }

    setFilePath(result.filePath)
  }

  const ensureDestinationLoaded = async (): Promise<string | null> => {
    if (!resolvedProjectId) {
      setError('インポート先のプロジェクトを選んでください')
      return null
    }

    const result = await window.api.workspace.loadProject(resolvedProjectId)

    if (!result.ok) {
      setError(result.error)
      return null
    }

    return resolvedProjectId
  }

  const handleValidate = async (): Promise<void> => {
    if (!filePath) {
      setError('ZIP ファイルを選択してください')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)
    setValidation(null)
    setProgress({
      phase: 'extracting',
      processedCount: 0,
      totalCount: 0,
      percent: 0,
      detail: null
    })

    try {
      const loadedProjectId = await ensureDestinationLoaded()

      if (!loadedProjectId) {
        return
      }

      const result = await window.api.dataTransfer.validateProjectImport({
        projectId: loadedProjectId,
        filePath
      })

      if (!result.ok) {
        if (!result.canceled) {
          setError(result.error)
        }
        return
      }

      setValidation(result.data)
      if (result.data.hasCollisions) {
        setError(
          `衝突があります（例: ${result.data.collisionSamples.join(', ')}）。書込は行いません。`
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (!filePath || !canImport) {
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)
    setProgress({
      phase: 'extracting',
      processedCount: 0,
      totalCount: validation?.documentCount ?? 0,
      percent: 0,
      detail: null
    })

    try {
      const loadedProjectId = await ensureDestinationLoaded()

      if (!loadedProjectId) {
        return
      }

      const result = await window.api.dataTransfer.importProject({
        projectId: loadedProjectId,
        filePath,
        acceptProjectIdMismatch: acceptMismatch
      })

      if (result.ok) {
        const scope = result.data.includeSubcollections
          ? '（サブコレクション含む）'
          : '（ルート一段）'
        setSuccess(`${result.data.writtenCount} 件${scope}をインポートしました`)
        onImported?.()
        return
      }

      if (!result.canceled) {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">プロジェクトにインポート</h2>
          <p className="project-export-dialog__lead">
            ZIP を検証してから、選んだプロジェクトへ書き込みます。接続中でなくても実行できます。
          </p>
        </header>

        {destinations.length === 0 ? (
          <p className="project-export-dialog__error">
            インポート先がありません。先に Json で接続するか、Google で接続してください。
          </p>
        ) : (
          <label className="project-export-dialog__option">
            インポート先
            <select
              className="bulk-actions__input"
              value={resolvedProjectId}
              disabled={busy || Boolean(success)}
              onChange={(event) => {
                setDestinationId(event.target.value)
                setValidation(null)
                setAcceptMismatch(false)
                setError(null)
                setSuccess(null)
              }}
            >
              {destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label !== entry.id ? `${entry.label} — ${entry.id}` : entry.id}
                  {entry.readOnly ? '（read-only）' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {readOnly && (
          <p className="project-export-dialog__error">
            このプロジェクトは read-only です。検証はできますが、実行はできません。
          </p>
        )}

        <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
          <Button onClick={() => void handleSelectFile()} disabled={busy || destinations.length === 0}>
            ZIP を選択…
          </Button>
        </div>

        {filePath && (
          <p className="project-export-dialog__hint" style={{ wordBreak: 'break-all' }}>
            {filePath}
          </p>
        )}

        {validation && (
          <div className="project-export-dialog__roots">
            <p className="project-export-dialog__hint">
              件数: {validation.documentCount} ／ ソース: {validation.sourceProjectId}
              {validation.includeSubcollections ? ' ／ サブコレ含む' : ''}
            </p>
            {validation.rootCollectionIds.length > 0 && (
              <p className="project-export-dialog__hint">
                ルート: {validation.rootCollectionIds.join(', ')}
              </p>
            )}
            {validation.projectIdMismatch && (
              <label className="project-export-dialog__check project-export-dialog__option">
                <input
                  type="checkbox"
                  checked={acceptMismatch}
                  disabled={busy || Boolean(success)}
                  onChange={(event) => setAcceptMismatch(event.target.checked)}
                />
                projectId が異なります。この宛先へインポートすることを確認しました
              </label>
            )}
            {validation.hasCollisions && (
              <p className="project-export-dialog__error">
                衝突サンプル: {validation.collisionSamples.join(', ')}
              </p>
            )}
            {!validation.hasCollisions && (
              <p className="project-export-dialog__success">検証 OK（衝突なし）</p>
            )}
          </div>
        )}

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
          <Button onClick={onClose} disabled={busy}>
            {success ? '閉じる' : 'キャンセル'}
          </Button>
          <Button onClick={() => void handleValidate()} disabled={busy || !filePath || Boolean(success)}>
            {busy && progress?.phase !== 'writing' ? '検証中…' : '検証'}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleImport()}
            disabled={!canImport}
          >
            {busy && progress?.phase === 'writing' ? 'インポート中…' : 'インポート実行'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

export default ProjectImportDialog
