import type { ReactNode } from 'react'
import SplitPane from '@shared/ui/SplitPane'

type TableBulkSplitProps = {
  table: ReactNode
  bulk: ReactNode | null
}

function TableBulkSplit({ table, bulk }: TableBulkSplitProps): React.JSX.Element {
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
      ariaLabel="一括操作パネルの高さ"
      first={table}
      second={bulk}
    />
  )
}

export default TableBulkSplit
