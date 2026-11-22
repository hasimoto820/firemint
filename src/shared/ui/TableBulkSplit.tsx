import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import type { ReactNode } from 'react'
import SplitPane from '@shared/ui/SplitPane'

type TableBulkSplitProps = {
  table: ReactNode
  bulk: ReactNode | null
}

function TableBulkSplit({ table, bulk }: TableBulkSplitProps): React.JSX.Element {
  const { t } = useI18n()
  if (bulk == null) {
    return <>{table}</>
  }

  return (
    <SplitPane
      className="bulk-split"
      orientation="vertical"
      storageKey="bulk.panel"
      sizeTarget="second"
      defaultSize={200}
      unit="px"
      minFirst={80}
      minSecond={72}
      ariaLabel={t('ui.bulk_panel_height')}
      first={table}
      second={bulk}
    />
  )
}

export default TableBulkSplit
