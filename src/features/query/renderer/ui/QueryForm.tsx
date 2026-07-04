import { useState } from 'react'
import Button from '@shared/ui/Button'
import type {
  QueryOrderByClause,
  QueryWhereClause,
  QueryWhereOperator,
  SimpleQueryInput
} from '@features/query/shared/types'

const WHERE_OPERATORS: QueryWhereOperator[] = [
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'array-contains',
  'in',
  'array-contains-any',
  'not-in'
]

const EMPTY_WHERE: QueryWhereClause = {
  field: '',
  operator: '==',
  value: ''
}

type QueryFormProps = {
  projectId: string
  loading: boolean
  onRun: (input: SimpleQueryInput) => void
}

function QueryForm({ projectId, loading, onRun }: QueryFormProps): React.JSX.Element {
  const [collectionPath, setCollectionPath] = useState('company')
  const [collectionGroup, setCollectionGroup] = useState(false)
  const [wheres, setWheres] = useState<QueryWhereClause[]>([])
  const [orderByEnabled, setOrderByEnabled] = useState(false)
  const [orderBy, setOrderBy] = useState<QueryOrderByClause>({ field: '', direction: 'asc' })
  const [limit, setLimit] = useState('200')

  const addWhere = (): void => {
    if (wheres.length >= 3) {
      return
    }

    setWheres([...wheres, { ...EMPTY_WHERE }])
  }

  const updateWhere = (index: number, patch: Partial<QueryWhereClause>): void => {
    setWheres(wheres.map((where, whereIndex) => (whereIndex === index ? { ...where, ...patch } : where)))
  }

  const removeWhere = (index: number): void => {
    setWheres(wheres.filter((_, whereIndex) => whereIndex !== index))
  }

  const handleRun = (): void => {
    const activeWheres = wheres.filter((where) => where.field.trim())

    onRun({
      projectId,
      collectionPath: collectionPath.trim(),
      collectionGroup,
      wheres: activeWheres,
      orderBy: orderByEnabled && orderBy.field.trim() ? orderBy : undefined,
      limit: Number(limit) || 200
    })
  }

  return (
    <form
      className="query-form"
      onSubmit={(event) => {
        event.preventDefault()
        handleRun()
      }}
    >
      <div className="query-form__row">
        <label className="query-form__label">
          <input
            type="checkbox"
            checked={collectionGroup}
            onChange={(event) => setCollectionGroup(event.target.checked)}
          />
          Collection Group
        </label>
        <input
          className="query-form__input query-form__input--path"
          value={collectionPath}
          onChange={(event) => setCollectionPath(event.target.value)}
          placeholder={collectionGroup ? 'user' : 'company または company/docId/user'}
        />
      </div>

      <div className="query-form__section">
        <div className="query-form__section-header">
          <h3 className="query-form__title">where（最大 3 件）</h3>
          <Button onClick={addWhere} disabled={loading || wheres.length >= 3}>
            条件を追加
          </Button>
        </div>

        {wheres.length === 0 && <p className="query-form__hint">条件なし = 全件取得（limit 適用）</p>}

        {wheres.map((where, index) => (
          <div key={index} className="query-form__where-row">
            <input
              className="query-form__input"
              value={where.field}
              onChange={(event) => updateWhere(index, { field: event.target.value })}
              placeholder="field"
            />
            <select
              className="query-form__select"
              value={where.operator}
              onChange={(event) =>
                updateWhere(index, { operator: event.target.value as QueryWhereOperator })
              }
            >
              {WHERE_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
            <input
              className="query-form__input query-form__input--value"
              value={where.value}
              onChange={(event) => updateWhere(index, { value: event.target.value })}
              placeholder='value（例: "Mike Tyson", 123, true, null, ["a","b"]）'
            />
            <Button onClick={() => removeWhere(index)} disabled={loading}>
              削除
            </Button>
          </div>
        ))}
      </div>

      <div className="query-form__row">
        <label className="query-form__label">
          <input
            type="checkbox"
            checked={orderByEnabled}
            onChange={(event) => setOrderByEnabled(event.target.checked)}
          />
          orderBy
        </label>
        <input
          className="query-form__input"
          value={orderBy.field}
          onChange={(event) => setOrderBy({ ...orderBy, field: event.target.value })}
          placeholder="field"
          disabled={!orderByEnabled}
        />
        <select
          className="query-form__select"
          value={orderBy.direction}
          onChange={(event) =>
            setOrderBy({ ...orderBy, direction: event.target.value as 'asc' | 'desc' })
          }
          disabled={!orderByEnabled}
        >
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
        <label className="query-form__label query-form__label--inline">
          limit
          <input
            className="query-form__input query-form__input--limit"
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </label>
        <Button variant="primary" disabled={loading} onClick={handleRun}>
          Run
        </Button>
      </div>
    </form>
  )
}

export default QueryForm
