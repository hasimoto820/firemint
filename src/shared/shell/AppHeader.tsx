import type { ConnectionStatus } from '@features/connection/shared/types'
import AppNav from '@shared/shell/AppNav'
import type { AppView } from '@shared/shell/AppNav'
import Button from '@shared/ui/Button'
import EnvironmentBadge from '@shared/ui/EnvironmentBadge'

type AppHeaderProps = {
  status: ConnectionStatus
  activeView: AppView
  onNavigate: (view: AppView) => void
  onDisconnect: () => void
  disconnectDisabled?: boolean
}

function AppHeader({
  status,
  activeView,
  onNavigate,
  onDisconnect,
  disconnectDisabled = false
}: AppHeaderProps): React.JSX.Element {
  return (
    <div className="app-header">
      <div className="app-header__start">
        <p className="app-header__meta">
          {status.projectId} <EnvironmentBadge environment={status.environment} />
          {status.readOnly && <span className="app-header__readonly">read-only</span>}
        </p>
        <AppNav active={activeView} onChange={onNavigate} />
      </div>
      <Button variant="danger" onClick={onDisconnect} disabled={disconnectDisabled}>
        切断
      </Button>
    </div>
  )
}

export default AppHeader
