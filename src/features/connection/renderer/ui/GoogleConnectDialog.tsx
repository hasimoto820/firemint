import { useEffect, useRef, useState } from 'react'
import type { GoogleSignInResult } from '@features/connection/shared/types'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<Extract<GoogleSignInResult, { ok: true }> | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }

    closedRef.current = false
    setBusy(false)
    setError(null)
    setSession(null)
    setStatusText(null)
  }, [open])

  const handleCancel = (): void => {
    closedRef.current = true
    void window.api.connection.googleCancelSignIn()
    onClose()
  }

  const importAccountProjects = async (
    signedIn: Extract<GoogleSignInResult, { ok: true }>
  ): Promise<void> => {
    setStatusText(`${signedIn.projects.length} 件のプロジェクトを取り込み中…`)

    const result = await window.api.connection.googleConnectAccount({
      accountKey: signedIn.accountKey,
      accountEmail: signedIn.email,
      projects: signedIn.projects
    })

    if (closedRef.current) {
      return
    }

    if (!result.ok) {
      // 名簿への登録だけ成功している場合もあるので一覧を更新する
      onConnected()
      setError(result.error)
      setStatusText(null)
      return
    }

    onConnected()
    onClose()
  }

  const handleSignIn = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatusText(null)

    try {
      const result = await window.api.connection.googleSignIn()

      if (closedRef.current) {
        return
      }

      if (!result.ok) {
        if (result.error.includes('キャンセル')) {
          onClose()
          return
        }

        setError(result.error)
        setSession(null)
        return
      }

      setSession(result)

      if (result.projects.length === 0) {
        setError('扱えるプロジェクトがありません。GCP / Firebase の権限を確認してください。')
        return
      }

      await importAccountProjects(result)
    } finally {
      if (!closedRef.current) {
        setBusy(false)
        setStatusText(null)
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
            Google アカウントでサインインすると、権限のあるプロジェクトをまとめて取り込みます。
            以前の表示名・色・read-only 設定があれば復元します。
          </p>
        </header>

        {!session ? (
          <div className="project-export-dialog__actions" style={{ justifyContent: 'flex-start' }}>
            <Button variant="primary" onClick={() => void handleSignIn()} disabled={busy}>
              {busy ? 'ブラウザで認証中…' : 'Google でサインイン'}
            </Button>
          </div>
        ) : (
          <p className="project-export-dialog__hint">
            アカウント: <code>{session.email}</code>
            {statusText ? ` — ${statusText}` : ''}
          </p>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={handleCancel}>キャンセル</Button>
          {session && error && session.projects.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setBusy(true)
                setError(null)
                void importAccountProjects(session).finally(() => {
                  if (!closedRef.current) {
                    setBusy(false)
                    setStatusText(null)
                  }
                })
              }}
              disabled={busy}
            >
              {busy ? '取り込み中…' : '再試行'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default GoogleConnectDialog
