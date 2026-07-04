type AppShellProps = {
  header: React.ReactNode
  sidebar: React.ReactNode
  main: React.ReactNode
}

function AppShell({ header, sidebar, main }: AppShellProps): React.JSX.Element {
  return (
    <div className="app-layout">
      <header className="app-layout__header">{header}</header>
      <div className="app-layout__body">
        <aside className="app-layout__sidebar">{sidebar}</aside>
        <section className="app-layout__main">{main}</section>
      </div>
    </div>
  )
}

export default AppShell
