export type AppView = 'explorer' | 'query'

type AppNavProps = {
  active: AppView
  onChange: (view: AppView) => void
}

function AppNav({ active, onChange }: AppNavProps): React.JSX.Element {
  return (
    <nav className="app-nav">
      <button
        type="button"
        className={active === 'explorer' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
        onClick={() => onChange('explorer')}
      >
        Explorer
      </button>
      <button
        type="button"
        className={active === 'query' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
        onClick={() => onChange('query')}
      >
        Query
      </button>
    </nav>
  )
}

export default AppNav
