import { existsSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { logInfo, logWarn } from '@shared/logging/logger'

const require = createRequire(import.meta.url)

if (process.platform === 'win32') {
  try {
    require('win-ca')
    logInfo('env', 'Windows system CA certificates injected via win-ca')
  } catch (error) {
    logWarn('env', 'win-ca load failed', error)
  }
}

const extraCaPath = join(process.cwd(), 'config', 'extra_ca.pem')
if (existsSync(extraCaPath)) {
  process.env.NODE_EXTRA_CA_CERTS = extraCaPath
  logInfo('env', 'NODE_EXTRA_CA_CERTS configured (config/extra_ca.pem)')
}
