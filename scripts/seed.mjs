import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve } from 'path'
import admin from 'firebase-admin'
import { initializeFirestore, FieldValue } from 'firebase-admin/firestore'

const require = createRequire(import.meta.url)
const BATCH_LIMIT = 500

if (process.platform === 'win32') {
  try {
    require('win-ca')
  } catch {
    console.warn('[seed] win-ca load failed')
  }
}

function parseArgs(argv) {
  const options = {
    sa: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './config/mintfarm-b62db-firebase-adminsdk-fbsvc-22410df188.json',
    collection: 'user',
    count: 600,
    prefix: 'seed_'
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--sa' && next) {
      options.sa = next
      index += 1
    } else if (arg === '--collection' && next) {
      options.collection = next
      index += 1
    } else if (arg === '--count' && next) {
      options.count = Number(next)
      index += 1
    } else if (arg === '--prefix' && next) {
      options.prefix = next
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!Number.isInteger(options.count) || options.count <= 0) {
    throw new Error('--count は 1 以上の整数を指定してください')
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/seed.mjs [options]

Options:
  --sa <path>           サービスアカウント JSON（既定: ./config/mintfarm-b62db-firebase-adminsdk-fbsvc-22410df188.json）
  --collection <name>   コレクション名（既定: user）
  --count <number>      投入件数（既定: 600）
  --prefix <string>     ドキュメント ID 接頭辞（既定: seed_）

Example:
  node scripts/seed.mjs --collection user --count 600
`)
}

async function seed(options) {
  const saPath = resolve(process.cwd(), options.sa)
  const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'))

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
  const db = initializeFirestore(app, { preferRest: true })
  const collection = db.collection(options.collection)

  let batch = db.batch()
  let inBatch = 0
  let batchNo = 0

  console.log(
    `[seed] project=${serviceAccount.project_id} collection=${options.collection} count=${options.count}`
  )

  for (let index = 0; index < options.count; index += 1) {
    const id = `${options.prefix}${String(index).padStart(4, '0')}`
    const ref = collection.doc(id)

    batch.set(ref, {
      email: index % 3 === 0 ? `mint${index}@test.com` : `user${index}@example.com`,
      tel: `090-${String(index).padStart(8, '0')}`,
      createdAt: FieldValue.serverTimestamp()
    })

    inBatch += 1

    if (inBatch === BATCH_LIMIT) {
      await batch.commit()
      batchNo += 1
      console.log(`[seed] batch ${batchNo} committed (${BATCH_LIMIT})`)
      batch = db.batch()
      inBatch = 0
    }
  }

  if (inBatch > 0) {
    await batch.commit()
    batchNo += 1
    console.log(`[seed] batch ${batchNo} committed (${inBatch})`)
  }

  await app.delete()
  console.log(`[seed] done: ${options.count} documents`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  await seed(options)
} catch (error) {
  console.error('[seed] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
