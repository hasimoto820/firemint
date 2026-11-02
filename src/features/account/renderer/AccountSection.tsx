import { useEffect, useState } from 'react'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import Button from '@shared/ui/Button'
import type { AccountStatus } from '@features/account/shared/types'

/** Settings の「FireMint アカウント」。匿名なら Google ログインのボタンを出す。 */
function AccountSection(): React.JSX.Element {
  const { t } = useI18n()
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.api.account.getStatus().then((next) => {
      if (!cancelled) {
        setStatus(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSignIn = (): void => {
    setError(null)
    setSigningIn(true)
    void window.api.account
      .googleSignIn()
      .then((result) => {
        if (result.ok) {
          setStatus(result.status)
        } else {
          setError(result.error)
        }
      })
      .finally(() => setSigningIn(false))
  }

  const handleSignOut = (): void => {
    setError(null)
    setSigningOut(true)
    void window.api.account
      .signOut()
      .then(setStatus)
      .finally(() => setSigningOut(false))
  }

  return (
    <section className="settings-window__section">
      <h2 className="settings-window__section-title">{t('account.title')}</h2>
      {status?.email ? (
        <>
          <p className="settings-window__hint">{t('account.signed_in', { email: status.email })}</p>
          <Button onClick={handleSignOut} disabled={signingOut}>
            {t('account.sign_out')}
          </Button>
        </>
      ) : (
        <>
          <p className="settings-window__hint">
            {t(signingIn ? 'account.google_signing_in' : 'account.anonymous_hint')}
          </p>
          {signingIn ? (
            <Button onClick={() => void window.api.account.googleCancelSignIn()}>
              {t('account.cancel')}
            </Button>
          ) : (
            <Button onClick={handleSignIn}>{t('account.google_sign_in')}</Button>
          )}
        </>
      )}
      {error && <p className="settings-window__path">{error}</p>}
    </section>
  )
}

export default AccountSection
