import Button from '@shared/ui/Button'

type QueryEditorProps = {
  source: string
  loading: boolean
  onChange: (source: string) => void
  onRun: () => void
}

/**
 * JS Query のコード入力欄。FireFoo 風に Run で async function run() を実行する。
 */
function QueryEditor({ source, loading, onChange, onRun }: QueryEditorProps): React.JSX.Element {
  return (
    <div className="query-editor">
      <div className="query-editor__toolbar">
        <span className="query-editor__title">JS Query</span>
        <Button variant="primary" disabled={loading} onClick={onRun}>
          Run
        </Button>
      </div>
      <textarea
        className="query-editor__source"
        value={source}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="JS Query コード"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!loading) {
              onRun()
            }
          }
        }}
      />
    </div>
  )
}

export default QueryEditor
