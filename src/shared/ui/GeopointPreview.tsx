import {
  buildOpenStreetMapEmbedUrl,
  buildOpenStreetMapLink,
  type GeopointField
} from './firestore_display'

type GeopointPreviewProps = {
  points: GeopointField[]
}

function GeopointPreview({ points }: GeopointPreviewProps): React.JSX.Element | null {
  if (points.length === 0) {
    return null
  }

  return (
    <section className="geopoint-preview">
      <h3 className="geopoint-preview__title">Geopoint</h3>
      {points.map((point) => (
        <div key={point.field} className="geopoint-preview__item">
          <p className="geopoint-preview__label">
            {point.field}: {point.latitude}, {point.longitude}{' '}
            <a
              href={buildOpenStreetMapLink(point.latitude, point.longitude)}
              target="_blank"
              rel="noreferrer"
            >
              地図を開く
            </a>
          </p>
          <iframe
            className="geopoint-preview__map"
            title={`${point.field} map`}
            src={buildOpenStreetMapEmbedUrl(point.latitude, point.longitude)}
            loading="lazy"
          />
        </div>
      ))}
    </section>
  )
}

export default GeopointPreview
