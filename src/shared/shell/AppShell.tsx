import SplitPane from '@shared/ui/SplitPane'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useAccountStatus } from '@features/account/renderer/useAccountStatus'

type AppShellProps = {
  header: React.ReactNode
  sidebar: React.ReactNode
  main: React.ReactNode
}

function AppShell({ header, sidebar, main }: AppShellProps): React.JSX.Element {
  const { t } = useI18n()
  const expired = useAccountStatus()?.entitlement === 'expired'

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
          first={
            <aside
              className={
                expired ? 'app-layout__sidebar app-layout__sidebar--expired' : 'app-layout__sidebar'
              }
              // 期限切れの時は、操作不能（未策定 E）。キーボードのフォーカスも入らない
              {...(expired ? { inert: '' } : {})}
            >
              {sidebar}
            </aside>
          }
          second={
            <section
              className={
                expired ? 'app-layout__main app-layout__main--expired' : 'app-layout__main'
              }
              {...(expired
                ? { inert: '', 'data-expired-message': t('account.expired_message') }
                : {})}
            >
              {main}
            </section>
          }
        />
      </div>
    </div>
  )
}

export default AppShell
