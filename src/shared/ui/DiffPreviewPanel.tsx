import { useI18n } from '@shared/i18n/renderer/I18nProvider'
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
  /** 実際の対象件数。未指定時は items.length（チェック一括など） */
  matchedCount?: number
}

function DiffPreviewPanel({ items, matchedCount }: DiffPreviewPanelProps): React.JSX.Element {
  const { t } = useI18n()
  const targetCount = matchedCount ?? items.length
  const title =
    matchedCount !== undefined
      ? t('ui.diff_head_of', { shown: items.length, total: targetCount })
      : t('ui.diff_changes', { count: items.length })

  return (
    <div className="diff-preview">
      <h3 className="diff-preview__title">{title}</h3>
      <div className="diff-preview__wrap">
        <table className="diff-preview__table">
          <thead>
            <tr>
              <th>{t('ui.col_path')}</th>
              <th>{t('ui.col_field')}</th>
              <th>{t('ui.col_before')}</th>
              <th>{t('ui.col_after')}</th>
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
