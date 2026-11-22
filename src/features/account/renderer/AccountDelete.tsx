import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import Button from '@shared/ui/Button'
import { confirmAction } from '@shared/ui/confirmAction'
import type { AccountStatus } from '@features/account/shared/types'

type Props = {
  status: AccountStatus
}

/**
 * 002_005_flow.txt「データ削除」。確認の文言はモバイル版（003_012_datadel.txt「確認の文面」）と同じ考え方。
 * 1 回目: 立場ごとの確認。Google ログイン済みなら、2 回目にメールアドレスを入力して確定する。
 * 成功すると、main 側でこの PC のデータを消し、案内を出してアプリを閉じる。
 */
function AccountDelete({ status }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 2 回目（メールアドレスの入力）を出しているか
  const [typing, setTyping] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)

  // 確認のダイアログを閉じた直後に、メールアドレスの入力欄へ入れるようにする。
  // ダイアログが閉じてウィンドウにフォーカスが戻るのを待ってから合わせる
  useEffect(() => {
    if (!typing) {
      return
    }
    const timer = window.setTimeout(() => emailInputRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [typing])

  const buildDetail = async (): Promise<string> => {
    const lines: string[] = []
    if (!status.accountId) {
      lines.push(t('account.delete_confirm_anonymous'))
    } else if (!status.isOwner) {
      lines.push(t('account.delete_confirm_member'))
    } else {
      lines.push(
        t(
          status.hasStripeCustomer && status.entitlement === 'subscribed'
            ? 'account.delete_confirm_owner_stripe'
            : 'account.delete_confirm_owner'
        )
      )
      const members = await window.api.account.listMembers().catch(() => [])
      if (members.some((member) => !member.isSelf)) {
        lines.push(t('account.delete_confirm_owner_members'))
      }
    }
    lines.push(t('account.delete_confirm_local'))
    return lines.join('\n')
  }

  const runDelete = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.account.deleteData()
      // 成功した時は、アプリが閉じるので、ここには来ない
      if (!result.ok && result.error) {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleStart = async (): Promise<void> => {
    setError(null)
    if (
      !(await confirmAction(t('account.delete'), {
        detail: await buildDetail(),
        confirmLabel: t('account.delete')
      }))
    ) {
      return
    }
    if (status.email) {
      setTypedEmail('')
      setTyping(true)
      return
    }
    await runDelete()
  }

  const emailMatches =
    status.email !== null && typedEmail.trim().toLowerCase() === status.email.toLowerCase()

  return (
    <div className="account-members__leave">
      {typing ? (
        <>
          <p className="settings-window__hint">
            {t('account.delete_email_prompt', { email: status.email ?? '' })}
          </p>
          <div className="account-members__add">
            <input
              ref={emailInputRef}
              className="account-members__input"
              type="email"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && emailMatches && !busy) {
                  void runDelete()
                }
              }}
              placeholder={t('account.add_member_placeholder')}
              disabled={busy}
              spellCheck={false}
            />
            <Button
              variant="danger"
              onClick={() => void runDelete()}
              disabled={busy || !emailMatches}
            >
              {t('account.delete_final')}
            </Button>
            <Button onClick={() => setTyping(false)} disabled={busy}>
              {t('account.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="danger" onClick={() => void handleStart()} disabled={busy}>
          {t('account.delete')}
        </Button>
      )}
      {busy && <p className="settings-window__hint">{t('common.busy')}</p>}
      {error && <p className="settings-window__path">{error}</p>}
    </div>
  )
}

export default AccountDelete
