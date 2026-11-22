import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import type { ConnectionStatus } from '@features/connection/shared/types'

type AppHeaderProps = {
  status: ConnectionStatus
}

function AppHeader({ status }: AppHeaderProps): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="app-header app-header--end">
      <div className="app-header__end">
        {status.readOnly && <span className="app-header__readonly">{t('ui.read_only')}</span>}
        {status.writeBlockedReason && (
          <span className="app-header__readonly" title={status.writeBlockedReason}>
            {t('ui.firestore_read_only')}
          </span>
        )}
      </div>
    </div>
  )
}

export default AppHeader
