/** ログに出さない: メール、絶対パス全文。パスはファイル名だけ残す。 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

/** Windows: C:\... または \\server\... */
const WIN_ABS_PATH_RE = /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]+/g

/**
 * Unix 系のホーム／一時など。
 * URL のパス（https://.../datastore/...）は別途退避してから当てる。
 */
const UNIX_ABS_PATH_RE =
  /(?:^|[\s="'(:])(\/(?:Users|home|tmp|var|private|Applications|opt|usr|Volumes|mnt|root)\/[^\s"'<>|]+)/g

function pathLeaf(absolutePath: string): string {
  const cleaned = absolutePath.replace(/[/\\]+$/, '')
  const leaf = cleaned.split(/[/\\]/).pop()
  return leaf && leaf.length > 0 ? leaf : '[path]'
}

export function sanitizeLogText(text: string): string {
  let out = text.replace(EMAIL_RE, '[email]')

  const urls: string[] = []
  out = out.replace(/https?:\/\/[^\s]+/gi, (match) => {
    const key = `__FM_URL_${urls.length}__`
    urls.push(match)
    return key
  })

  out = out.replace(WIN_ABS_PATH_RE, (match) => pathLeaf(match))
  out = out.replace(UNIX_ABS_PATH_RE, (full, path: string) => full.replace(path, pathLeaf(path)))

  out = out.replace(/__FM_URL_(\d+)__/g, (_match, index) => urls[Number(index)] ?? '[url]')

  return out
}
