import { useCallback, useEffect, useState } from 'react'
import { TRIAL_DAYS, type AccountMember } from '@features/account/shared/types'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import Button from '@shared/ui/Button'
import { confirmAction } from '@shared/ui/confirmAction'

// サーバー側は functions/src/account/addMember.ts の MAX_MEMBERS（オーナーを含めて 2 人）
const MAX_MEMBERS = 2
const DAY_MS = 24 * 60 * 60 * 1000

type AccountMembersProps = {
  accountId: string
  isOwner: boolean
  /** この PC のトライアルの開始日。脱退の確認で、抜けた後すぐ使えなくなるかを伝える */
  firstUseDate: number | null
}

/**
 * Settings の「FireMint アカウント」の中の、メンバーの一覧と招待（モバイル版の Account 画面と同じ）。
 * オーナー: 招待（メールアドレス）と、自分以外を外す。メンバー: 一覧を見るのと、自分で脱退する。
 */
function AccountMembers({
  accountId,
  isOwner,
  firstUseDate
}: AccountMembersProps): React.JSX.Element | null {
  const { t } = useI18n()
  const [members, setMembers] = useState<AccountMember[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setMembers(await window.api.account.listMembers())
    } catch {
      setMembers([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, accountId, isOwner])

  const handleAdd = async (): Promise<void> => {
    if (busy || !email.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.api.account.addMember(email.trim())
      if (!result.ok) {
        setError(`${t('account.add_member_failed')}: ${result.error}`)
        return
      }
      setEmail('')
      setNotice(t('account.add_member_done'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (member: AccountMember): Promise<void> => {
    if (
      !(await confirmAction(t('account.remove_member_confirm'), {
        detail: member.email ?? member.id,
        confirmLabel: t('account.remove_member')
      }))
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.api.account.removeMember(member.id)
      if (!result.ok) {
        setError(`${t('account.remove_member_failed')}: ${result.error}`)
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  // メンバーが自分で抜ける（オーナーは抜けられない。オーナーが抜ける時はアカウント削除）。
  // 抜けた後は、main 側で新しい account が作られ、ACCOUNT_CHANGED で画面が替わる
  const handleLeave = async (): Promise<void> => {
    const trialExpired =
      firstUseDate !== null && Date.now() >= firstUseDate + TRIAL_DAYS * DAY_MS
    if (
      !(await confirmAction(t('account.leave'), {
        detail: t(trialExpired ? 'account.leave_confirm_expired' : 'account.leave_confirm'),
        confirmLabel: t('account.leave')
      }))
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.api.account.leave()
      if (!result.ok) {
        setError(`${t('account.leave_failed')}: ${result.error}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-members">
      <h3 className="account-members__title">{t('account.members_title')}</h3>
      <ul className="account-members__list">
        {members.map((member) => (
          <li key={member.id} className="account-members__row">
            <span className="account-members__email">
              {member.email ?? member.id}
              {member.isSelf ? t('account.member_you') : ''}
              {member.pending ? t('account.member_pending') : ''}
            </span>
            {isOwner && !member.isSelf && (
              <Button
                variant="danger"
                onClick={() => void handleRemove(member)}
                disabled={busy}
              >
                {t('account.remove_member')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/* 枠が埋まっている間は出さない。もう 1 人を入れるには、先に「外す」が要る */}
      {isOwner && members.length < MAX_MEMBERS && (
        <div className="account-members__add">
          <input
            className="account-members__input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleAdd()
              }
            }}
            placeholder={t('account.add_member_placeholder')}
            disabled={busy}
            spellCheck={false}
          />
          <Button onClick={() => void handleAdd()} disabled={busy || !email.trim()}>
            {t('account.add_member')}
          </Button>
        </div>
      )}
      {isOwner && <p className="settings-window__hint">{t('account.members_hint')}</p>}

      {!isOwner && (
        <div className="account-members__leave">
          <Button variant="danger" onClick={() => void handleLeave()} disabled={busy}>
            {t('account.leave')}
          </Button>
        </div>
      )}

      {notice && <p className="settings-window__hint">{notice}</p>}
      {error && <p className="settings-window__path">{error}</p>}
    </div>
  )
}

export default AccountMembers
