import type { ReactNode } from 'react'
import SplitPane from '@shared/ui/SplitPane'

type JobSplitLayoutProps = {
  form: ReactNode
  log: ReactNode
}

function JobSplitLayout({ form, log }: JobSplitLayoutProps): React.JSX.Element {
  return (
    <SplitPane
      className="job-split"
      orientation="vertical"
      storageKey="job.log"
      sizeTarget="second"
      defaultSize={280}
      unit="px"
      minFirst={140}
      minSecond={96}
      ariaLabel="ログの高さ"
      first={form}
      second={log}
    />
  )
}

export default JobSplitLayout
