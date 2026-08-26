import SplitPane from '@shared/ui/SplitPane'

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
        <SplitPane
          className="app-layout__split"
          orientation="horizontal"
          storageKey="shell.sidebar"
          defaultSize={240}
          unit="px"
          minFirst={160}
          minSecond={360}
          ariaLabel="サイドバーの幅"
          first={<aside className="app-layout__sidebar">{sidebar}</aside>}
          second={<section className="app-layout__main">{main}</section>}
        />
      </div>
    </div>
  )
}

export default AppShell
