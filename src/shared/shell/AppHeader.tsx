import type { ConnectionStatus } from '@features/connection/shared/types'

type AppHeaderProps = {
  status: ConnectionStatus
}

function AppHeader({ status }: AppHeaderProps): React.JSX.Element {
  return (
    <div className="app-header app-header--end">
      <div className="app-header__end">
        {status.readOnly && <span className="app-header__readonly">read-only</span>}
        {status.writeBlockedReason && (
          <span className="app-header__readonly" title={status.writeBlockedReason}>
            Firestore 書込不可
          </span>
        )}
      </div>
    </div>
  )
}

export default AppHeader
