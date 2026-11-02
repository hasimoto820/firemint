import { useEffect, useRef, useState } from 'react'
import Button from '@shared/ui/Button'

type GoogleConnectDialogProps = {
  open: boolean
  onClose: () => void
  onConnected: () => void
}

function GoogleConnectDialog({
  open,
  onClose,
  onConnected
}: GoogleConnectDialogProps): React.JSX.Element | null {
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }

    closedRef.current = false
    setProjectId('')
    setBusy(false)
    setError(null)
  }, [open])

  const handleCancel = (): void => {
    closedRef.current = true
    void window.api.connection.googleCancelSignIn()
    onClose()
  }

  const handleConnect = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const signedIn = await window.api.connection.googleSignIn()

      if (closedRef.current) {
        return
      }

      if (!signedIn.ok) {
        if (signedIn.error.includes('キャンセル')) {
          onClose()
          return
        }

        setError(signedIn.error)
        return
      }

      const result = await window.api.connection.googleConnectProject({
        accountKey: signedIn.accountKey,
        accountEmail: signedIn.email,
        projectId: projectId.trim()
      })

      if (closedRef.current) {
        return
      }

      if (!result.ok) {
        setError(result.error)
        return
      }

      onConnected()
      onClose()
    } finally {
      if (!closedRef.current) {
        setBusy(false)
      }
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={handleCancel} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">Google で接続</h2>
          <p className="project-export-dialog__lead">
            プロジェクト ID を入力して、Google アカウントでサインインします。
            以前の表示名・色・read-only 設定があれば復元します。
          </p>
        </header>

        <label className="project-export-dialog__hint">
          プロジェクト ID
          <input
            type="text"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="my-project-id"
            disabled={busy}
            autoFocus
            spellCheck={false}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </label>

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={handleCancel}>キャンセル</Button>
          <Button
            variant="primary"
            onClick={() => void handleConnect()}
            disabled={busy || projectId.trim().length === 0}
          >
            {busy ? 'ブラウザで認証中…' : 'Google でサインイン'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default GoogleConnectDialog
