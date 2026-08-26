import { useMemo } from 'react'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import type { QueryGroupTab } from '@features/query/shared/types'
import Button from '@shared/ui/Button'
import AutocompleteInput from '@shared/ui/AutocompleteInput'

type QueryEditorProps = {
  projectId: string
  source: string
  loading: boolean
  groupTab: QueryGroupTab | null
  onChange: (source: string) => void
  onSelectGroupTab: (tab: QueryGroupTab) => void
  onRun: () => void
}

/**
 * JS Query のコード入力欄。FireFoo 風に Run で async function run() を実行する。
 * 単語単位の autocomplete を AutocompleteInput 経由で提供する。
 */
function QueryEditor({
  projectId,
  source,
  loading,
  groupTab,
  onChange,
  onSelectGroupTab,
  onRun
}: QueryEditorProps): React.JSX.Element {
  const autocomplete = useOptionalAutocompleteApi()

  const items = useMemo(() => {
    void autocomplete.revision
    return autocomplete.query(projectId, '')
  }, [autocomplete, projectId])

  return (
    <div className="query-editor">
      <div className="query-editor__toolbar">
        <span className="query-editor__title">JS Query</span>
        <nav className="app-nav query-editor__group-tabs" aria-label="グループタブ">
          <button
            type="button"
            className={
              groupTab === 'collection' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'
            }
            disabled={loading}
            onClick={() => onSelectGroupTab('collection')}
          >
            current collection
          </button>
          <button
            type="button"
            className={groupTab === 'group' ? 'app-nav__item app-nav__item--active' : 'app-nav__item'}
            disabled={loading}
            onClick={() => onSelectGroupTab('group')}
          >
            collection group
          </button>
        </nav>
        <Button variant="primary" disabled={loading} onClick={onRun}>
          Run
        </Button>
      </div>
      <AutocompleteInput
        value={source}
        items={items}
        multiline
        wordCompletion
        disabled={loading}
        className="query-editor__field-wrap"
        fieldClassName="query-editor__source"
        aria-label="JS Query コード"
        onChange={onChange}
        onMetaEnter={() => {
          if (!loading) {
            onRun()
          }
        }}
      />
    </div>
  )
}

export default QueryEditor
