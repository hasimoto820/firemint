import type { ReactNode } from 'react'
import SplitPane from '@shared/ui/SplitPane'

type JobSplitLayoutProps = {
  form: ReactNode
  log: ReactNode
  /** ログの高さを覚えるキー。画面ごとに分ける時に指定する */
  storageKey?: string
  /** ログの最初の高さ（px） */
  defaultLogSize?: number
}

function JobSplitLayout({
  form,
  log,
  storageKey = 'job.log',
  defaultLogSize = 280
}: JobSplitLayoutProps): React.JSX.Element {
  return (
    <SplitPane
      className="job-split"
      orientation="vertical"
      storageKey={storageKey}
      sizeTarget="second"
      defaultSize={defaultLogSize}
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
