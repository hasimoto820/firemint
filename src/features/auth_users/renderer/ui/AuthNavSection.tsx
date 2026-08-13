type AuthNavSectionProps = {
  active: boolean
  onSelect: () => void
  disabled?: boolean
}

/** 左ペインで FIRESTORE と兄弟の AUTH 入口 */
function AuthNavSection({
  active,
  onSelect,
  disabled = false
}: AuthNavSectionProps): React.JSX.Element {
  return (
    <div className="auth-nav">
      <button
        type="button"
        className={active ? 'auth-nav__button auth-nav__button--active' : 'auth-nav__button'}
        onClick={onSelect}
        disabled={disabled}
      >
        AUTH
      </button>
    </div>
  )
}

export default AuthNavSection
