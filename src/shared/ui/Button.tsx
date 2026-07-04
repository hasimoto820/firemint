type ButtonProps = {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'default'
}

function Button({
  children,
  onClick,
  disabled = false,
  variant = 'default'
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`fm-button fm-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default Button
