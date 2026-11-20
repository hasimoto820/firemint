import { useEffect, useRef, useState } from 'react'
import type { GoogleSavedAccount } from '@features/connection/shared/types'
import Button from '@shared/ui/Button'

type GoogleConnectDialogProps = {
  open: boolean
  onClose: () => void
  onConnected: () => void
}

/** select の値。保存済みの accountKey か、新しくサインインする時のこの値 */
const NEW_ACCOUNT = '__new__'

/**
 * Firestore のプロジェクトを Google アカウントで追加する。
 * この PC に保存済みの Google アカウントがあれば、ブラウザを開かずにそのアカウントで接続する。
 * （FireMint アカウントのログインとは別。そちらは Settings の「FireMint アカウント」）
 */
function GoogleConnectDialog({
  open,
  onClose,
  onConnected
}: GoogleConnectDialogProps): React.JSX.Element | null {
  const [projectId, setProjectId] = useState('')
  const [accounts, setAccounts] = useState<GoogleSavedAccount[]>([])
  const [accountChoice, setAccountChoice] = useState(NEW_ACCOUNT)
  const [busy, setBusy] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }

    closedRef.current = false
    setProjectId('')
    setBusy(false)
    setSigningIn(false)
    setError(null)
    setAccounts([])
    setAccountChoice(NEW_ACCOUNT)

    void window.api.connection
      .googleListAccounts()
      .then((saved) => {
        if (closedRef.current) {
          return
        }
        setAccounts(saved)
        setAccountChoice(saved[0]?.accountKey ?? NEW_ACCOUNT)
      })
      .catch(() => {
        // 読めない時は、新しくサインインする流れのまま
      })
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
      let account: { accountKey: string; email: string }

      if (accountChoice === NEW_ACCOUNT) {
        setSigningIn(true)
        const signedIn = await window.api.connection.googleSignIn()
        setSigningIn(false)

        if (closedRef.current) {
          return
        }

        if (!signedIn.ok) {
          if (signedIn.error.includes('キャンセル')) {
            return
          }

          setError(signedIn.error)
          return
        }

        account = { accountKey: signedIn.accountKey, email: signedIn.email }
      } else {
        const saved = accounts.find((item) => item.accountKey === accountChoice)

        if (!saved) {
          setError('Google アカウントを選び直してください')
          return
        }

        account = saved
      }

      const result = await window.api.connection.googleConnectProject({
        accountKey: account.accountKey,
        accountEmail: account.email,
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
        setSigningIn(false)
      }
    }
  }

  if (!open) {
    return null
  }

  const usesSavedAccount = accountChoice !== NEW_ACCOUNT
  const connectLabel = signingIn
    ? 'ブラウザで認証中…'
    : busy
      ? '接続中…'
      : usesSavedAccount
        ? '接続'
        : 'Google でサインインして接続'

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={handleCancel} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">Google アカウントでプロジェクトを追加</h2>
          <p className="project-export-dialog__lead">
            Firestore のプロジェクト ID を入力して、Google アカウントで接続します。
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

        {accounts.length > 0 ? (
          <label className="project-export-dialog__hint">
            Google アカウント
            <select
              value={accountChoice}
              onChange={(event) => setAccountChoice(event.target.value)}
              disabled={busy}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            >
              {accounts.map((account) => (
                <option key={account.accountKey} value={account.accountKey}>
                  {account.email}
                </option>
              ))}
              <option value={NEW_ACCOUNT}>別のアカウントでサインイン…</option>
            </select>
          </label>
        ) : (
          <p className="project-export-dialog__hint">
            ブラウザが開くので、Google アカウントでサインインしてください。
          </p>
        )}

        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={handleCancel}>キャンセル</Button>
          <Button
            variant="primary"
            onClick={() => void handleConnect()}
            disabled={busy || projectId.trim().length === 0}
          >
            {connectLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default GoogleConnectDialog
