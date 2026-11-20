import { app } from 'electron'
import { existsSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { logInfo, logWarn } from '@shared/logging/logger'

const require = createRequire(import.meta.url)

if (process.platform === 'win32') {
  try {
    // require('win-ca') だと、証明書を win-ca 自身のフォルダ（pem/roots.pem）に書き込む。
    // C:\Program Files に入れた時は書き込めず、アプリが止まる。
    // win-ca/api を使い、書き込まずに（save なし）取り込みだけを行う。
    require('win-ca/api')({ inject: true, async: true })
    logInfo('env', 'Windows system CA certificates injected via win-ca')
  } catch (error) {
    logWarn('env', 'win-ca load failed', error)
  }
}

const extraCaPath = join(app.getPath('userData'), 'extra_ca.pem')
if (existsSync(extraCaPath)) {
  process.env.NODE_EXTRA_CA_CERTS = extraCaPath
  logInfo('env', 'NODE_EXTRA_CA_CERTS configured (userData/extra_ca.pem)')
}
