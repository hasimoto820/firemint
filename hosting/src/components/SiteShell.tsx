import { Link, Outlet } from 'react-router-dom'

export function SiteShell() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__mark" aria-label="FireMint ホーム">
          FireMint
        </Link>
        <nav className="topbar__nav" aria-label="サイト">
          <Link to="/contact">お問い合わせ</Link>
          <Link to="/privacy">プライバシー</Link>
        </nav>
      </header>
      <Outlet />
      <footer className="site-footer">
        <p className="site-footer__brand">FireMint</p>
        <p className="site-footer__note">Firestore を、気持ちよく。</p>
        <div className="site-footer__links">
          <Link to="/contact">お問い合わせ</Link>
          <Link to="/privacy">プライバシーポリシー</Link>
        </div>
        <p className="site-footer__copy">© {new Date().getFullYear()} FireMint</p>
      </footer>
    </div>
  )
}
