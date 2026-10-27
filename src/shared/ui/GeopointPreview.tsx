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
    // 地図は高さを取るので、最初は閉じておき JSON を先に見せる
    <details className="geopoint-preview">
      <summary className="geopoint-preview__title">Geopoint ({points.length})</summary>
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
    </details>
  )
}

export default GeopointPreview
