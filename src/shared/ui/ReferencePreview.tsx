import type { ReferenceField } from './firestore_display'

type ReferencePreviewProps = {
  references: ReferenceField[]
  onOpen?: (documentPath: string) => void
}

function ReferencePreview({
  references,
  onOpen
}: ReferencePreviewProps): React.JSX.Element | null {
  if (references.length === 0) {
    return null
  }

  return (
    <section className="reference-preview">
      <h3 className="reference-preview__title">Reference</h3>
      <ul className="reference-preview__list">
        {references.map((reference) => (
          <li key={`${reference.field}:${reference.path}`} className="reference-preview__item">
            <span className="reference-preview__field">{reference.field}</span>
            {onOpen ? (
              <button
                type="button"
                className="reference-preview__link"
                onClick={() => onOpen(reference.path)}
              >
                {reference.path}
              </button>
            ) : (
              <code className="reference-preview__path">{reference.path}</code>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ReferencePreview
