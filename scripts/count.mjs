import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve } from 'path'
import admin from 'firebase-admin'
import { FieldPath, initializeFirestore } from 'firebase-admin/firestore'

const require = createRequire(import.meta.url)
const DEFAULT_SA =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  './config/mintfarm-b62db-firebase-adminsdk-fbsvc-22410df188.json'

if (process.platform === 'win32') {
  try {
    require('win-ca')
  } catch {
    console.warn('[count] win-ca load failed')
  }
}

function parseArgs(argv) {
  const options = {
    sa: DEFAULT_SA,
    collection: 'user',
    prefix: 'seed_',
    all: false,
    sample: 5
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
    } else if (arg === '--prefix' && next) {
      options.prefix = next
      index += 1
    } else if (arg === '--sample' && next) {
      options.sample = Number(next)
      index += 1
    } else if (arg === '--all') {
      options.all = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!Number.isInteger(options.sample) || options.sample < 0) {
    throw new Error('--sample は 0 以上の整数を指定してください')
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/count.mjs [options]

Options:
  --sa <path>           サービスアカウント JSON
  --collection <name>   コレクション名（既定: user）
  --prefix <string>     内訳用 ID 接頭辞（既定: seed_）
  --sample <number>     先頭/末尾 ID の表示件数（既定: 5）
  --all                 ルートの全コレクションを件数表示

Example:
  node scripts/count.mjs
  node scripts/count.mjs --collection user --prefix seed_
  node scripts/count.mjs --all
`)
}

function prefixEnd(prefix) {
  return `${prefix}\uf8ff`
}

async function countQuery(query) {
  const startedAt = Date.now()
  const snapshot = await query.count().get()
  const count = snapshot.data().count
  console.log(`[count]   query count=${count} elapsed=${Date.now() - startedAt}ms`)
  return count
}

async function countCollectionTotal(db, collectionId) {
  console.log(`[count] collection=${collectionId} (total)`)
  return countQuery(db.collection(collectionId))
}

async function countCollectionPrefix(db, collectionId, prefix) {
  if (!prefix) {
    return 0
  }

  console.log(`[count] collection=${collectionId} prefix=${prefix}`)
  return countQuery(
    db
      .collection(collectionId)
      .where(FieldPath.documentId(), '>=', prefix)
      .where(FieldPath.documentId(), '<', prefixEnd(prefix))
  )
}

async function listSampleIds(db, collectionId, sampleSize) {
  if (sampleSize === 0) {
    return
  }

  const col = db.collection(collectionId)
  const pageSize = 200

  const firstSnapshot = await col.orderBy(FieldPath.documentId()).limit(sampleSize).get()
  const firstIds = firstSnapshot.docs.map((doc) => doc.id)
  console.log(`[count] sample first (${firstIds.length}): ${firstIds.join(', ') || '(none)'}`)

  let lastPageDocs = []
  let cursor = null

  while (true) {
    let query = col.orderBy(FieldPath.documentId()).limit(pageSize)
    if (cursor) {
      query = query.startAfter(cursor)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    lastPageDocs = snapshot.docs
    cursor = lastPageDocs[lastPageDocs.length - 1]

    if (lastPageDocs.length < pageSize) {
      break
    }
  }

  const lastIds = lastPageDocs.slice(-sampleSize).map((doc) => doc.id)
  console.log(`[count] sample last (${lastIds.length}): ${lastIds.join(', ') || '(none)'}`)
}

async function reportCollection(db, collectionId, options) {
  const startedAt = Date.now()
  console.log(`[count] --- ${collectionId} ---`)

  const total = await countCollectionTotal(db, collectionId)
  const prefixCount = await countCollectionPrefix(db, collectionId, options.prefix)
  const otherCount = total - prefixCount

  console.log(`[count] summary total=${total} prefix=${prefixCount} other=${otherCount}`)
  await listSampleIds(db, collectionId, options.sample)
  console.log(`[count] elapsed=${Date.now() - startedAt}ms`)
}

async function run(options) {
  const startedAt = Date.now()
  const saPath = resolve(process.cwd(), options.sa)

  console.log(`[count] start sa=${saPath}`)

  const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'))

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
  const db = initializeFirestore(app, { preferRest: true })

  console.log(`[count] project=${serviceAccount.project_id}`)

  if (options.all) {
    const collections = await db.listCollections()

    if (collections.length === 0) {
      console.log('[count] no root collections')
    } else {
      for (const collection of collections) {
        await reportCollection(db, collection.id, options)
      }
    }
  } else {
    await reportCollection(db, options.collection, options)
  }

  await app.delete()
  console.log(`[count] done elapsed=${Date.now() - startedAt}ms`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  await run(options)
} catch (error) {
  console.error('[count] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
