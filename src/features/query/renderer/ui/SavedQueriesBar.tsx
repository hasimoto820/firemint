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
  return (
    <div className="saved-queries-bar">
      <label className="saved-queries-bar__label">
        Saved
        <select
          className="saved-queries-bar__select"
          value={selectedId ?? ''}
          disabled={loading}
          onChange={(event) => onSelect(event.target.value || null)}
          aria-label="保存済みクエリ"
        >
          <option value="">（新規 / 選択）</option>
          {queries.map((query) => (
            <option key={query.id} value={query.id}>
              {query.name}
            </option>
          ))}
        </select>
      </label>
      <label className="saved-queries-bar__label">
        名前
        <input
          className="saved-queries-bar__name"
          value={name}
          disabled={loading}
          placeholder="保存名"
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="保存名"
        />
      </label>
      <div className="saved-queries-bar__actions">
        <Button disabled={loading || !selectedId} onClick={onLoad}>
          読込
        </Button>
        <Button disabled={loading} onClick={onSave}>
          保存
        </Button>
        <Button disabled={loading || !selectedId} onClick={onDelete}>
          削除
        </Button>
      </div>
    </div>
  )
}

export default SavedQueriesBar
