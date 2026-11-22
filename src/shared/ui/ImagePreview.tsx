import { useI18n } from '@shared/i18n/renderer/I18nProvider'
import { useState } from 'react'
import type { ImageUrlField } from './firestore_display'

type ImagePreviewProps = {
  images: ImageUrlField[]
}

function ImagePreviewItem({ field, url }: ImageUrlField): React.JSX.Element {
  const { t } = useI18n()
  const [loadFailed, setLoadFailed] = useState(false)

  return (
    <div className="image-preview__item">
      <p className="image-preview__label">
        {field}:{' '}
        <a href={url} target="_blank" rel="noreferrer">
          {t('ui.open_image')}
        </a>
      </p>
      {loadFailed ? (
        <p className="image-preview__error">{t('ui.preview_failed')}</p>
      ) : (
        <a className="image-preview__link" href={url} target="_blank" rel="noreferrer">
          <img
            className="image-preview__img"
            src={url}
            alt={field}
            loading="lazy"
            onError={() => setLoadFailed(true)}
          />
        </a>
      )}
    </div>
  )
}

function ImagePreview({ images }: ImagePreviewProps): React.JSX.Element | null {
  const { t } = useI18n()
  if (images.length === 0) {
    return null
  }

  return (
    // 画像は高さを取るので、最初は閉じておき JSON を先に見せる
    <details className="image-preview">
      <summary className="image-preview__title">{t('ui.images', { count: images.length })}</summary>
      {images.map((image) => (
        <ImagePreviewItem key={`${image.field}:${image.url}`} field={image.field} url={image.url} />
      ))}
    </details>
  )
}

export default ImagePreview
