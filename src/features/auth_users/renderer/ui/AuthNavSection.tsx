import { useI18n } from '@shared/i18n/renderer/I18nProvider'

type AuthNavSectionProps = {
  active: boolean
  /** newTab = Ctrl+クリック / 中クリック（新しいタブで開く） */
  onSelect: (newTab?: boolean) => void
  disabled?: boolean
}

/** 左ペインで FIRESTORE と兄弟の AUTH 入口 */
function AuthNavSection({
  active,
  onSelect,
  disabled = false
}: AuthNavSectionProps): React.JSX.Element {
  const { t } = useI18n()

  return (
    <div className="auth-nav" data-area="auth" tabIndex={-1}>
      <button
        type="button"
        className={active ? 'auth-nav__button auth-nav__button--active' : 'auth-nav__button'}
        onClick={(event) => onSelect(event.ctrlKey || event.metaKey)}
        onAuxClick={(event) => {
          if (event.button === 1 && !disabled) {
            event.preventDefault()
            onSelect(true)
          }
        }}
        disabled={disabled}
      >
        {t('auth_users.nav')}
      </button>
    </div>
  )
}

export default AuthNavSection
