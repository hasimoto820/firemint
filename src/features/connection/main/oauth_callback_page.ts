import type http from 'http'
import { translate } from '@shared/i18n/shared/translate'
import { DEFAULT_LOCALE, type Locale } from '@shared/i18n/shared/types'
import { getSettings } from '@shared/settings/main/service'

type CallbackPageKind = 'done' | 'failed'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Google ログインの後に、ブラウザが戻ってくる 127.0.0.1 のページを返す。
 * 文言は、アプリの言語の設定（Settings →「言語」）に合わせる。
 * detail は、Google から返ってきたエラーの値など（そのまま出すので、エスケープする）。
 */
export async function sendOAuthCallbackPage(
  res: http.ServerResponse,
  status: number,
  kind: CallbackPageKind,
  detail?: string
): Promise<void> {
  let locale: Locale = DEFAULT_LOCALE
  try {
    locale = (await getSettings()).locale
  } catch {
    // 設定が読めなくても、ページは返す（英語）
  }
  const message = translate(locale, `oauth_callback.${kind}`)
  const detailHtml = detail ? `<p>${escapeHtml(detail)}</p>` : ''
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>FireMint</title></head>` +
      `<body><h1>FireMint</h1><p>${escapeHtml(message)}</p>${detailHtml}</body></html>`
  )
}
