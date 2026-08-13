import type { ConnectionStatus } from '@features/connection/shared/types'
import EnvironmentBadge from '@shared/ui/EnvironmentBadge'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type AppHeaderProps = {
  status: ConnectionStatus
  onDisconnect: () => void
  disconnectDisabled?: boolean
}

function AppHeader({
  status,
  onDisconnect,
  disconnectDisabled = false
}: AppHeaderProps): React.JSX.Element {
  const t = useT()

  return (
    <div className="app-header app-header--end">
      <div className="app-header__end">
        <EnvironmentBadge environment={status.environment} />
        {status.readOnly && <span className="app-header__readonly">read-only</span>}
        <button
          type="button"
          className="app-header__disconnect"
          onClick={onDisconnect}
          disabled={disconnectDisabled}
        >
          {t('common.disconnect')}
        </button>
      </div>
    </div>
  )
}

export default AppHeader
