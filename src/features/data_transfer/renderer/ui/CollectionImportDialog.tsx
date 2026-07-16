import { useEffect, useMemo, useState } from 'react'
import type {
  ImportCollectionProgress,
  ImportCollectionValidation
} from '@features/data_transfer/shared/types'
import Button from '@shared/ui/Button'

type CollectionImportDialogProps = {
  projectId: string
  collectionPath: string
  readOnly: boolean
  open: boolean
  onClose: () => void
  onImported?: () => void
}

function CollectionImportDialog({
  projectId,
  collectionPath,
  readOnly,
  open,
  onClose,
  onImported
}: CollectionImportDialogProps): React.JSX.Element | null {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [includeSubcollections, setIncludeSubcollections] = useState(false)
  const [validation, setValidation] = useState<ImportCollectionValidation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportCollectionProgress | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setFilePath(null)
    setIncludeSubcollections(false)
    setValidation(null)
    setBusy(false)
    setError(null)
    setSuccess(null)
    setProgress(null)
  }, [open, projectId, collectionPath])

  useEffect(() => {
    if (!open || !busy) {
      return
    }

    return window.api.dataTransfer.onImportCollectionProgress((next) => {
      setProgress(next)
    })
  }, [open, busy])

  const canImport = useMemo(() => {
    if (readOnly || !validation || validation.hasCollisions || Boolean(success) || busy) {
      return false
    }

    return true
  }, [readOnly, validation, success, busy])

  const progressLabel = useMemo(() => {
    if (!progress) {
      return null
    }

    const detail = progress.detail ? ` / ${progress.detail}` : ''

    if (progress.phase === 'loading') {
      return `読み込み中…${detail}`
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
    setProgress(null)

    const result = await window.api.dataTransfer.selectCollectionImportJson()
    if (result.canceled || !result.filePath) {
      return
    }

    setFilePath(result.filePath)
  }

  const handleValidate = async (): Promise<void> => {
    if (!filePath) {
      setError('JSON ファイルを選択してください')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)
    setValidation(null)
    setProgress({
      phase: 'loading',
      processedCount: 0,
      totalCount: 0,
      percent: 0,
      detail: null
    })

    try {
      const result = await window.api.dataTransfer.validateCollectionImport({
        projectId,
        collectionPath,
        filePath,
        includeSubcollections
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
      phase: 'loading',
      processedCount: 0,
      totalCount: validation?.writeCount ?? 0,
      percent: 0,
      detail: null
    })

    try {
      const result = await window.api.dataTransfer.importCollectionJson({
        projectId,
        collectionPath,
        filePath,
        includeSubcollections
      })

      if (result.ok) {
        const scope = result.data.includeSubcollections
          ? '（サブコレクション含む）'
          : '（コレクション一段）'
        const skipped =
          result.data.skippedOutsideCount > 0
            ? ` / 宛先外除外 ${result.data.skippedOutsideCount} 件`
            : ''
        setSuccess(`${result.data.writtenCount} 件${scope}をインポートしました${skipped}`)
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
          <h2 className="project-export-dialog__title">コレクションにインポート</h2>
          <p className="project-export-dialog__lead">
            JSON を検証してから、<code>{collectionPath}</code> へ書き込みます。
          </p>
        </header>

        {readOnly && (
          <p className="project-export-dialog__error">
            このプロジェクトは read-only です。検証はできますが、実行はできません。
          </p>
        )}

        <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
          <Button onClick={() => void handleSelectFile()} disabled={busy}>
            JSON を選択…
          </Button>
        </div>

        {filePath && (
          <p className="project-export-dialog__hint" style={{ wordBreak: 'break-all' }}>
            {filePath}
          </p>
        )}

        <label className="project-export-dialog__check project-export-dialog__option">
          <input
            type="checkbox"
            checked={includeSubcollections}
            disabled={busy || Boolean(success)}
            onChange={(event) => {
              setIncludeSubcollections(event.target.checked)
              setValidation(null)
              setError(null)
              setSuccess(null)
            }}
          />
          サブコレクションを含む
        </label>

        {validation && (
          <div className="project-export-dialog__roots">
            <p className="project-export-dialog__hint">
              書込予定: {validation.writeCount} 件（id 指定 {validation.existingIdCount} / 自動 ID{' '}
              {validation.autoIdCount}）
              {validation.skippedOutsideCount > 0
                ? ` / 宛先外除外 ${validation.skippedOutsideCount}`
                : ''}
            </p>
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
          <Button
            onClick={() => void handleValidate()}
            disabled={busy || !filePath || Boolean(success)}
          >
            {busy && progress?.phase !== 'writing' ? '検証中…' : '検証'}
          </Button>
          <Button variant="primary" onClick={() => void handleImport()} disabled={!canImport}>
            {busy && progress?.phase === 'writing' ? 'インポート中…' : 'インポート実行'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

export default CollectionImportDialog
