// 実験: 本番の Firestore で、v1 クライアントを SA JSON で繋ぎ、整数と小数を型つきのまま書いて読めるか。
// gRPC と REST（preferRest と同じ fallback: 'rest'）の両方で試す。
// 書くのは _firemint_exp の下だけ。最後に全部消す。
//   node scripts/exp_number_type_prod.mjs [SA JSON のパス]
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { Firestore, v1 } = require('@google-cloud/firestore')

if (process.platform === 'win32') {
  try {
    require('win-ca')
  } catch {
    console.warn('win-ca load failed')
  }
}

const saPath = process.argv[2] ?? './config/mintfarm-b62db-firebase-adminsdk-fbsvc-22410df188.json'
const sa = JSON.parse(readFileSync(saPath, 'utf8'))
const PROJECT = sa.project_id
const credentials = { client_email: sa.client_email, private_key: sa.private_key }
const DB = `projects/${PROJECT}/databases/(default)`
const COLLECTION = '_firemint_exp'
const docName = (id) => `${DB}/documents/${COLLECTION}/${id}`

function describe(value) {
  if (typeof value === 'bigint') return `bigint ${value}`
  return `${typeof value} ${String(value)}`
}

function printRaw(fields) {
  for (const [key, value] of Object.entries(fields)) {
    const type = value.valueType ?? Object.keys(value).find((k) => k.endsWith('Value'))
    console.log(`   ${key.padEnd(10)} ${type} ${JSON.stringify(value[type])}`)
  }
}

function createClient(transport) {
  if (transport === 'rest') {
    return new v1({ credentials, projectId: PROJECT, fallback: 'rest' }, require('google-gax/build/src/fallback'))
  }
  return new v1({ credentials, projectId: PROJECT })
}

const written = new Set()

async function run(transport) {
  console.log(`\n===== ${transport} =====`)
  const client = createClient(transport)
  const id = (name) => `${transport}_${name}`

  // A. 型を明示して書く
  const numbers = docName(id('numbers'))
  await client.batchWrite({
    database: DB,
    writes: [
      {
        update: {
          name: numbers,
          fields: {
            int1: { integerValue: '1' },
            double1: { doubleValue: 1 },
            double1_5: { doubleValue: 1.5 },
            bigInt: { integerValue: '9007199254740993' },
            nan: { doubleValue: NaN },
            nested: { mapValue: { fields: { d: { doubleValue: 2 }, i: { integerValue: '2' } } } },
            arr: { arrayValue: { values: [{ doubleValue: 3 }, { integerValue: '3' }] } }
          }
        }
      }
    ]
  })
  written.add(numbers)
  console.log('A. v1 batchWrite: OK')

  // B. v1 で読み戻す（生の値の型）
  const [doc] = await client.getDocument({ name: numbers })
  console.log('B. v1 read (raw):')
  printRaw(doc.fields)

  // C. 通常の API（useBigInt、アプリと同じ preferRest）で読む
  const db = new Firestore({ projectId: PROJECT, credentials, useBigInt: true, preferRest: true })
  const data = (await db.collection(COLLECTION).doc(id('numbers')).get()).data()
  console.log('C. high-level read useBigInt=true:')
  for (const key of ['int1', 'double1', 'double1_5', 'bigInt', 'nan']) {
    console.log(`   ${key.padEnd(10)} ${describe(data[key])}`)
  }
  console.log(`   nested.d   ${describe(data.nested.d)}   nested.i ${describe(data.nested.i)}`)
  console.log(`   arr        ${data.arr.map(describe).join(' / ')}`)
  await db.terminate()

  // D. 追記と上書き。1 件ずつの成否
  const a = docName(id('a'))
  const b = docName(id('b'))
  const c = docName(id('c'))
  const fields = { v: { doubleValue: 1 } }
  await client.batchWrite({
    database: DB,
    writes: [
      { update: { name: a, fields }, currentDocument: { exists: false } },
      { update: { name: b, fields }, currentDocument: { exists: false } }
    ]
  })
  written.add(a).add(b)
  const [res] = await client.batchWrite({
    database: DB,
    writes: [
      { update: { name: a, fields }, currentDocument: { exists: false } },
      { update: { name: c, fields }, currentDocument: { exists: false } },
      { update: { name: b, fields: { v: { doubleValue: 2 } } } }
    ]
  })
  written.add(c)
  console.log('D. batchWrite (append a = exists, append c = new, overwrite b):')
  res.status.forEach((s, i) => console.log(`   write ${i}  code=${s.code} ${s.message ?? ''}`))
  const [bDoc] = await client.getDocument({ name: b })
  console.log(`   b after overwrite: ${JSON.stringify(bDoc.fields.v)}`)

  await client.close()
}

const cleanupClient = createClient('grpc')
try {
  console.log(`project: ${PROJECT}`)
  for (const transport of ['grpc', 'rest']) {
    try {
      await run(transport)
    } catch (error) {
      console.log(`!! ${transport} failed: ${error.code ?? ''} ${error.message}`)
    }
  }
} finally {
  // 後片付け: 書いたドキュメントを消し、_firemint_exp に何も残っていないかを見る
  if (written.size > 0) {
    await cleanupClient.batchWrite({
      database: DB,
      writes: [...written].map((name) => ({ delete: name }))
    })
  }
  const db = new Firestore({ projectId: PROJECT, credentials })
  const left = await db.collection(COLLECTION).limit(10).get()
  console.log(`\ncleanup: deleted ${written.size}, left in ${COLLECTION}: ${left.size}`)
  await db.terminate()
  await cleanupClient.close()
}
