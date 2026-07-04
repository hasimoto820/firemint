import type { DiffPreviewItem } from '@features/bulk_operations/shared/types'

function formatDiffValue(value: unknown): string {
  if (value === undefined) {
    return '(undefined)'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

type DiffPreviewPanelProps = {
  items: DiffPreviewItem[]
}

function DiffPreviewPanel({ items }: DiffPreviewPanelProps): React.JSX.Element {
  return (
    <div className="diff-preview">
      <h3 className="diff-preview__title">Diff プレビュー（{items.length} 件）</h3>
      <div className="diff-preview__wrap">
        <table className="diff-preview__table">
          <thead>
            <tr>
              <th>path</th>
              <th>field</th>
              <th>before</th>
              <th>after</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.documentPath}:${item.field}`}>
                <td>{item.documentPath}</td>
                <td>{item.field}</td>
                <td className="diff-preview__before">{formatDiffValue(item.before)}</td>
                <td className="diff-preview__after">{formatDiffValue(item.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DiffPreviewPanel
