export function ProductStage() {
  return (
    <div className="product-stage" aria-hidden="true">
      <div className="product-stage__window">
        <div className="product-stage__chrome">
          <span />
          <span />
          <span />
          <p>FireMint — mintfarm-b62db</p>
        </div>
        <div className="product-stage__body">
          <aside className="product-stage__side">
            <div className="product-stage__side-label">Projects</div>
            <div className="product-stage__pill is-active">mintfarm-b62db</div>
            <div className="product-stage__pill">staging-app</div>
            <div className="product-stage__tree">
              <span>company</span>
              <span className="is-nested">orders</span>
              <span>user</span>
            </div>
          </aside>
          <section className="product-stage__main">
            <div className="product-stage__toolbar">
              <span className="is-on">Simple</span>
              <span>Query</span>
              <strong>Run</strong>
            </div>
            <div className="product-stage__table">
              <div className="product-stage__row is-head">
                <span>ID</span>
                <span>name</span>
                <span>status</span>
              </div>
              <div className="product-stage__row">
                <span>emjo…Sri7</span>
                <span>Carepanda</span>
                <span className="is-ok">active</span>
              </div>
              <div className="product-stage__row is-selected">
                <span>99Ap…VxUJ</span>
                <span>Mint Farm</span>
                <span className="is-ok">active</span>
              </div>
              <div className="product-stage__row">
                <span>PcFv…n91V</span>
                <span>Google</span>
                <span>draft</span>
              </div>
            </div>
            <div className="product-stage__diff">
              <p>一括更新プレビュー</p>
              <code>status: draft → active · 12 docs</code>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
