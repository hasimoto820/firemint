import { Link } from 'react-router-dom'
import { ProductStage } from '../components/ProductStage'

export function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero__atmosphere" aria-hidden="true" />
        <div className="hero__copy">
          <p className="hero__brand">FireMint</p>
          <h1 className="hero__title">Firestore を、気持ちよく。</h1>
          <p className="hero__lead">
            開いて、辿って、まとめて整える。手元に置いておきたくなるデスクトップ。
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary" href="#download">
              手元に置く
            </a>
            <Link className="btn btn--ghost" to="/contact">
              お問い合わせ
            </Link>
          </div>
        </div>
        <ProductStage />
      </section>

      <section className="band" id="why">
        <h2>奥まで見えて、まとめて整う。</h2>
        <p>
          コレクションを辿る。テーブルで眺める。まとめて直して、書く前に確認する。日本語のまま、毎日使いたくなるアプリです。
        </p>
      </section>

      <section className="points" id="features">
        <h2>置いておきたくなる理由</h2>
        <ul>
          <li>
            <strong>つながる</strong>
            <span>いくつものプロジェクトが、すぐ手元に</span>
          </li>
          <li>
            <strong>辿れる</strong>
            <span>サブコレクションの奥まで、すっと届く</span>
          </li>
          <li>
            <strong>整えられる</strong>
            <span>まとめて直す前に、差分が見える</span>
          </li>
        </ul>
      </section>

      <section className="download" id="download">
        <h2>まずは、Windows で。</h2>
        <p>
          公開の準備をしています。先に触ってみたい人は、声をかけてください。
        </p>
        <Link className="btn btn--primary" to="/contact">
          使ってみたい
        </Link>
      </section>
    </main>
  )
}
