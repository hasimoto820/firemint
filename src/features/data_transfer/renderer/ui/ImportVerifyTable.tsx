import type {
  ImportVerifyRow,
  OfficialImportValidation
} from '@features/data_transfer/shared/official'

/** 片側にしか無い行、ドキュメント数が違う行、差分ドキュメントがある行は赤 */
function isVerifyRowDanger(row: ImportVerifyRow): boolean {
  if (!row.cloud || !row.file) {
    return true
  }
  if (row.cloud.total !== row.file.total) {
    return true
  }
  return Boolean(row.cloud.only) || Boolean(row.file.only)
}

/** 詳細は「ドキュメント数 / 差分ドキュメント数」、簡易は「ドキュメント数」 */
function VerifySideCell({ side }: { side: ImportVerifyRow['cloud'] }): React.JSX.Element {
  if (!side) {
    return <td className="imp-exp-verify__empty">（なし）</td>
  }
  return (
    <td>
      <span className="imp-exp-verify__total">{side.total.toLocaleString()}</span>
      {side.only !== null ? (
        <>
          {' / '}
          <span className={side.only > 0 ? 'imp-exp-verify__only' : undefined}>
            {side.only.toLocaleString()}
          </span>
        </>
      ) : null}
    </td>
  )
}

function ImportVerifyTable({
  validation,
  targetLabel = 'クラウド'
}: {
  validation: OfficialImportValidation
  targetLabel?: string
}): React.JSX.Element {
  return (
    <section className="imp-exp-verify" aria-label="検証結果">
      <p className="imp-exp-verify__summary">
        {validation.level === 'detailed' ? '詳細検証' : '簡易検証'}
        {' ／ '}ファイル {validation.documentCount.toLocaleString()} 件
        {validation.changedCount !== null
          ? ` ／ 中身が違うドキュメント ${validation.changedCount.toLocaleString()} 件`
          : ''}
      </p>
      <table className="imp-exp-verify__table">
        <thead>
          <tr>
            <th>コレクション</th>
            <th>{targetLabel}</th>
            <th>ファイル</th>
          </tr>
        </thead>
        <tbody>
          {validation.rows.map((row) => (
            <tr
              key={row.collectionId}
              className={isVerifyRowDanger(row) ? 'imp-exp-verify__row--danger' : undefined}
            >
              <th scope="row">{row.collectionId}</th>
              <VerifySideCell side={row.cloud} />
              <VerifySideCell side={row.file} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="imp-exp-form__hint">
        {validation.level === 'detailed'
          ? '＊詳細検証：ドキュメント数 / 差分ドキュメント数'
          : '＊簡易検証：ドキュメント数'}
        <br />＊{targetLabel}にだけあるコレクション / ドキュメントは、実行しても消えません。
      </p>
    </section>
  )
}

export default ImportVerifyTable
