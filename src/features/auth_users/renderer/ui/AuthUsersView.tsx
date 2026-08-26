import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthUser } from '@features/auth_users/shared/types'
import Button from '@shared/ui/Button'
import SplitPane from '@shared/ui/SplitPane'
import { confirmAction } from '@shared/ui/confirmAction'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type AuthUsersViewProps = {
  projectId: string
  readOnly: boolean
}

type EditDraft = {
  email: string
  displayName: string
  phoneNumber: string
  password: string
  emailVerified: boolean
  disabled: boolean
  customClaimsText: string
}

function toDraft(user: AuthUser): EditDraft {
  return {
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    phoneNumber: user.phoneNumber ?? '',
    password: '',
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    customClaimsText: JSON.stringify(user.customClaims ?? {}, null, 2)
  }
}

function AuthUsersView({ projectId, readOnly }: AuthUsersViewProps): React.JSX.Element {
  const t = useT()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [pageToken, setPageToken] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'email' | 'uid' | 'lastSignInTime'>('email')

  const loadFirstPage = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      if (!window.api.authUsers?.listUsers) {
        setError(t('auth_users.api_missing'))
        setUsers([])
        setPageToken(null)
        return
      }

      const result = await window.api.authUsers.listUsers({ projectId, maxResults: 100 })

      if (!result.ok) {
        setError(result.error)
        setUsers([])
        setPageToken(null)
        return
      }

      setUsers(result.data.users)
      setPageToken(result.data.pageToken)
      setSelected(new Set())
      setEditingUid(null)
      setDraft(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ユーザー一覧の取得に失敗しました')
      setUsers([])
      setPageToken(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = async (): Promise<void> => {
    if (!pageToken || loading) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.authUsers.listUsers({
        projectId,
        pageToken,
        maxResults: 100
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setUsers((current) => [...current, ...result.data.users])
      setPageToken(result.data.pageToken)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = needle
      ? users.filter((user) => {
          const hay = [user.uid, user.email, user.displayName, user.phoneNumber]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(needle)
        })
      : users

    return [...list].sort((a, b) => {
      const left = (a[sortKey] ?? '') as string
      const right = (b[sortKey] ?? '') as string
      return left.localeCompare(right)
    })
  }, [users, search, sortKey])

  const toggleSelect = (uid: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(uid)) {
        next.delete(uid)
      } else {
        next.add(uid)
      }
      return next
    })
  }

  const toggleSelectAllVisible = (): void => {
    const ids = filtered.map((user) => user.uid)
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))

    setSelected((current) => {
      const next = new Set(current)
      if (allSelected) {
        for (const id of ids) {
          next.delete(id)
        }
      } else {
        for (const id of ids) {
          next.add(id)
        }
      }
      return next
    })
  }

  const openEdit = (user: AuthUser): void => {
    setEditingUid(user.uid)
    setDraft(toDraft(user))
    setError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!editingUid || !draft || readOnly) {
      return
    }

    let customClaims: Record<string, unknown> | null
    try {
      const parsed = JSON.parse(draft.customClaimsText || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('customClaims は JSON オブジェクトにしてください')
        return
      }
      customClaims = parsed as Record<string, unknown>
    } catch {
      setError('customClaims の JSON が不正です')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.authUsers.updateUser({
        projectId,
        uid: editingUid,
        email: draft.email.trim() || undefined,
        displayName: draft.displayName.trim() || null,
        phoneNumber: draft.phoneNumber.trim() || null,
        password: draft.password.trim() || undefined,
        emailVerified: draft.emailVerified,
        disabled: draft.disabled,
        customClaims
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setUsers((current) =>
        current.map((user) => (user.uid === result.data.uid ? result.data : user))
      )
      setDraft(toDraft(result.data))
    } finally {
      setBusy(false)
    }
  }

  const handleBulkDisable = async (disabled: boolean): Promise<void> => {
    if (readOnly || selected.size === 0) {
      return
    }

    const label = disabled ? '無効化' : '有効化'
    if (!(await confirmAction(`選択した ${selected.size} 件を${label}しますか？`))) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.authUsers.setUsersDisabled({
        projectId,
        uids: Array.from(selected),
        disabled
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (result.data.failureCount > 0) {
        setError(`${result.data.failureCount} 件失敗（成功 ${result.data.successCount}）`)
      }

      await loadFirstPage()
    } finally {
      setBusy(false)
    }
  }

  const handleBulkDelete = async (): Promise<void> => {
    if (readOnly || selected.size === 0) {
      return
    }

    if (
      !(await confirmAction(
        `選択した ${selected.size} 件のユーザーを削除しますか？（取り消せません）`
      ))
    ) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.api.authUsers.deleteUsers({
        projectId,
        uids: Array.from(selected)
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      if (result.data.failureCount > 0) {
        setError(`${result.data.failureCount} 件失敗（成功 ${result.data.successCount}）`)
      }

      await loadFirstPage()
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (format: 'json' | 'csv'): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const result = await window.api.authUsers.exportUsers({
        projectId,
        format,
        uids: selected.size > 0 ? Array.from(selected) : undefined
      })

      if (!result.ok) {
        if (result.error !== 'canceled') {
          setError(result.error)
        }
        return
      }

      window.alert(`${result.data.exportedCount} 件を保存しました\n${result.data.filePath}`)
    } finally {
      setBusy(false)
    }
  }

  const editingUser = editingUid ? users.find((user) => user.uid === editingUid) : null

  return (
    <div className="auth-users">
      <header className="auth-users__header">
        <div>
          <h2 className="auth-users__title">{t('auth_users.title')}</h2>
          <p className="auth-users__lead">
            {projectId}
            {readOnly ? ' · read-only' : ''}
          </p>
        </div>
        <div className="auth-users__actions">
          <Button onClick={() => void loadFirstPage()} disabled={loading || busy}>
            {t('common.reload')}
          </Button>
          <Button onClick={() => void handleExport('json')} disabled={busy}>
            {t('auth_users.json')}
          </Button>
          <Button onClick={() => void handleExport('csv')} disabled={busy}>
            {t('auth_users.csv')}
          </Button>
          <Button
            onClick={() => void handleBulkDisable(true)}
            disabled={readOnly || busy || selected.size === 0}
          >
            {t('auth_users.disable')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleBulkDelete()}
            disabled={readOnly || busy || selected.size === 0}
          >
            {t('common.delete')}
          </Button>
        </div>
      </header>

      <div className="auth-users__toolbar">
        <input
          className="auth-users__search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('auth_users.search_placeholder')}
          disabled={busy}
        />
        <label className="auth-users__sort">
          {t('auth_users.sort')}
          <select
            value={sortKey}
            onChange={(event) =>
              setSortKey(event.target.value as 'email' | 'uid' | 'lastSignInTime')
            }
            disabled={busy}
          >
            <option value="email">email</option>
            <option value="uid">uid</option>
            <option value="lastSignInTime">lastSignIn</option>
          </select>
        </label>
        <span className="auth-users__count">
          {t('auth_users.count', { shown: filtered.length, loaded: users.length })}
          {selected.size > 0 ? t('auth_users.selected', { count: selected.size }) : ''}
        </span>
      </div>

      {error && <p className="auth-users__error">{error}</p>}

      <SplitPane
        className="auth-users__body"
        orientation="horizontal"
        storageKey="auth.detail"
        sizeTarget="second"
        defaultSize={36}
        unit="percent"
        minFirst={260}
        minSecond={240}
        ariaLabel="ユーザー詳細の幅"
        first={
        <div className="auth-users__table-wrap">
          <table className="auth-users__table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 && filtered.every((user) => selected.has(user.uid))
                    }
                    onChange={toggleSelectAllVisible}
                    disabled={busy || filtered.length === 0}
                    aria-label="表示中を全選択"
                  />
                </th>
                <th>email</th>
                <th>uid</th>
                <th>{t('auth_users.status')}</th>
                <th>{t('auth_users.providers')}</th>
                <th>{t('auth_users.last_sign_in')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.uid}
                  className={
                    editingUid === user.uid
                      ? 'auth-users__row auth-users__row--active'
                      : 'auth-users__row'
                  }
                  onClick={() => openEdit(user)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(user.uid)}
                      onChange={() => toggleSelect(user.uid)}
                      disabled={busy}
                      aria-label={`${user.email ?? user.uid} を選択`}
                    />
                  </td>
                  <td>{user.email ?? '—'}</td>
                  <td className="auth-users__mono">{user.uid}</td>
                  <td>{user.disabled ? 'disabled' : 'active'}</td>
                  <td>{user.providerIds.join(', ') || '—'}</td>
                  <td>{user.lastSignInTime ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <p className="auth-users__empty">{t('auth_users.empty')}</p>
          )}

          {pageToken && (
            <div className="auth-users__more">
              <Button onClick={() => void loadMore()} disabled={loading || busy}>
                {t('auth_users.load_more')}
              </Button>
            </div>
          )}
        </div>
        }
        second={
        <aside className="auth-users__detail">
          {!editingUser || !draft ? (
            <p className="auth-users__empty">{t('auth_users.edit_hint')}</p>
          ) : (
            <>
              <h3 className="auth-users__detail-title">{t('auth_users.edit_title')}</h3>
              <p className="auth-users__mono">{editingUser.uid}</p>

              <label className="auth-users__field">
                email
                <input
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  disabled={readOnly || busy}
                />
              </label>
              <label className="auth-users__field">
                displayName
                <input
                  value={draft.displayName}
                  onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                  disabled={readOnly || busy}
                />
              </label>
              <label className="auth-users__field">
                phoneNumber
                <input
                  value={draft.phoneNumber}
                  onChange={(event) => setDraft({ ...draft, phoneNumber: event.target.value })}
                  disabled={readOnly || busy}
                />
              </label>
              <label className="auth-users__field">
                新しい password（空なら変更なし）
                <input
                  type="password"
                  value={draft.password}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  disabled={readOnly || busy}
                  autoComplete="new-password"
                />
              </label>
              <label className="auth-users__check">
                <input
                  type="checkbox"
                  checked={draft.emailVerified}
                  onChange={(event) =>
                    setDraft({ ...draft, emailVerified: event.target.checked })
                  }
                  disabled={readOnly || busy}
                />
                emailVerified
              </label>
              <label className="auth-users__check">
                <input
                  type="checkbox"
                  checked={draft.disabled}
                  onChange={(event) => setDraft({ ...draft, disabled: event.target.checked })}
                  disabled={readOnly || busy}
                />
                disabled
              </label>
              <label className="auth-users__field">
                customClaims（JSON）
                <textarea
                  className="auth-users__claims"
                  value={draft.customClaimsText}
                  onChange={(event) =>
                    setDraft({ ...draft, customClaimsText: event.target.value })
                  }
                  disabled={readOnly || busy}
                  rows={8}
                />
              </label>

              <div className="auth-users__detail-actions">
                <Button onClick={() => void handleSave()} disabled={readOnly || busy}>
                  {t('common.save')}
                </Button>
              </div>
            </>
          )}
        </aside>
        }
      />
    </div>
  )
}

export default AuthUsersView
