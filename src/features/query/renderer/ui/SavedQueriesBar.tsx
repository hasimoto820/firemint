import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import Button from '@shared/ui/Button'
import type { SavedQuery } from '@features/query/shared/types'

type SavedQueriesBarProps = {
  queries: SavedQuery[]
  selectedId: string | null
  name: string
  loading: boolean
  onSelect: (id: string | null) => void
  onNameChange: (name: string) => void
  onLoad: () => void
  onSave: () => void
  onDelete: () => void
}

/**
 * JS Query の保存・読込・削除。一覧は現在プロジェクト分。
 * （Electron では window.prompt が使えないため、名前は入力欄で渡す）
 */
function SavedQueriesBar({
  queries,
  selectedId,
  name,
  loading,
  onSelect,
  onNameChange,
  onLoad,
  onSave,
  onDelete
}: SavedQueriesBarProps): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="saved-queries-bar">
      <label className="saved-queries-bar__label">
        Saved
        <select
          className="saved-queries-bar__select"
          value={selectedId ?? ''}
          disabled={loading}
          onChange={(event) => onSelect(event.target.value || null)}
          aria-label={t('query.saved_queries')}
        >
          <option value="">{t('query.new_or_select')}</option>
          {queries.map((query) => (
            <option key={query.id} value={query.id}>
              {query.name}
            </option>
          ))}
        </select>
      </label>
      <label className="saved-queries-bar__label">
        {t('query.name')}
        <input
          className="saved-queries-bar__name"
          value={name}
          disabled={loading}
          placeholder={t('query.save_name')}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label={t('query.save_name')}
        />
      </label>
      <div className="saved-queries-bar__actions">
        <Button disabled={loading || !selectedId} onClick={onLoad}>
          {t('query.load')}
        </Button>
        <Button disabled={loading} onClick={onSave}>
          {t('common.save')}
        </Button>
        <Button disabled={loading || !selectedId} onClick={onDelete}>
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )
}

export default SavedQueriesBar
