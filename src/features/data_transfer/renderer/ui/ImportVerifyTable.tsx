import { tr } from '@shared/i18n/shared/current'
import { useI18n } from '@shared/i18n/renderer/I18nProvider'
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
  const { t } = useI18n()
  if (!side) {
    return <td className="imp-exp-verify__empty">{t('explorer.none')}</td>
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
  targetLabel = tr('dt.cloud')
}: {
  validation: OfficialImportValidation
  targetLabel?: string
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <section className="imp-exp-verify" aria-label={t('dt.validation_result')}>
      <p className="imp-exp-verify__summary">
        {validation.level === 'detailed' ? t('dt.detailed_validate') : t('dt.quick_validate')}
        {' ／ '}
        {t('dt.file_count', { count: validation.documentCount.toLocaleString() })}
        {validation.changedCount !== null
          ? ` ／ ${t('dt.changed_count', { count: validation.changedCount.toLocaleString() })}`
          : ''}
      </p>
      <table className="imp-exp-verify__table">
        <thead>
          <tr>
            <th>{t('explorer.kind_collection')}</th>
            <th>{targetLabel}</th>
            <th>{t('dt.file')}</th>
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
        {validation.level === 'detailed' ? t('dt.note_detailed') : t('dt.note_quick')}
        <br />
        {t('dt.note_only_target', { target: targetLabel.trim() })}
      </p>
    </section>
  )
}

export default ImportVerifyTable
