import { existsSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'

const require = createRequire(import.meta.url)

function log(message: string): void {
  console.log(`[firemint:env] ${message}`)
}

if (process.platform === 'win32') {
  try {
    require('win-ca')
    log('Windows system CA certificates injected via win-ca')
  } catch (error) {
    console.warn('[firemint:env] win-ca load failed', error)
  }
}

const extraCaPath = join(process.cwd(), 'config', 'extra_ca.pem')
if (existsSync(extraCaPath)) {
  process.env.NODE_EXTRA_CA_CERTS = extraCaPath
  log(`NODE_EXTRA_CA_CERTS=${extraCaPath}`)
}
