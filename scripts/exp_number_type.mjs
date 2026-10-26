// 実験: 整数と小数（1 と 1.0）、2^53 を超える整数を、型つきのまま書いて読めるか。
// Emulator（127.0.0.1:8080）に対して動かす。
//   node scripts/exp_number_type.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { Firestore, v1 } = require('@google-cloud/firestore')

const grpc = require('google-gax').grpc

const HOST = '127.0.0.1'
const PORT = 8080
const PROJECT = 'exp-number-type'
const DOC_PATH = 'exp/numbers'
const DB = `projects/${PROJECT}/databases/(default)`
const NAME = `${DB}/documents/${DOC_PATH}`

process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PORT}`

function describe(value) {
  if (typeof value === 'bigint') return `bigint ${value}`
  return `${typeof value} ${String(value)}`
}

// ── A. 低レベルのクライアント（v1）で、型を明示して書く ──
const client = new v1.FirestoreClient({
  servicePath: HOST,
  port: PORT,
  sslCreds: grpc.credentials.createInsecure(),
  customHeaders: { Authorization: 'Bearer owner' }
})

await client.commit({
  database: DB,
  writes: [
    {
      update: {
        name: NAME,
        fields: {
          int1: { integerValue: '1' },
          double1: { doubleValue: 1 },
          double1_5: { doubleValue: 1.5 },
          bigInt: { integerValue: '9007199254740993' },
          nan: { doubleValue: NaN },
          inf: { doubleValue: Infinity },
          nested: {
            mapValue: { fields: { d: { doubleValue: 2 }, i: { integerValue: '2' } } }
          },
          arr: { arrayValue: { values: [{ doubleValue: 3 }, { integerValue: '3' }] } }
        }
      }
    }
  ]
})
console.log('A. v1 commit: OK')

// ── B. v1 で読み戻す（生の値の型） ──
const stream = client.batchGetDocuments({ database: DB, documents: [NAME] })
for await (const res of stream) {
  const fields = res.found?.fields ?? {}
  console.log('B. v1 read (raw):')
  for (const [key, value] of Object.entries(fields)) {
    console.log(`   ${key.padEnd(10)} ${value.valueType} ${JSON.stringify(value[value.valueType])}`)
  }
}

// ── C. 通常の API で読む（useBigInt なし / あり） ──
for (const useBigInt of [false, true]) {
  const db = new Firestore({ projectId: PROJECT, useBigInt })
  const snap = await db.doc(DOC_PATH).get()
  const data = snap.data()
  console.log(`C. high-level read useBigInt=${useBigInt}:`)
  for (const key of ['int1', 'double1', 'double1_5', 'bigInt', 'nan', 'inf']) {
    console.log(`   ${key.padEnd(10)} ${describe(data[key])}`)
  }
  console.log(`   nested.d   ${describe(data.nested.d)}   nested.i ${describe(data.nested.i)}`)
  console.log(`   arr        ${data.arr.map(describe).join(' / ')}`)
  await db.terminate()
}

// ── D. 通常の API で書いて、v1 で型を見る（useBigInt あり） ──
{
  const db = new Firestore({ projectId: PROJECT, useBigInt: true })
  await db.doc('exp/highlevel').set({
    number1: 1,
    number1_5: 1.5,
    bigint1: 1n,
    bigInt: 9007199254740993n
  })
  await db.terminate()
  const s = client.batchGetDocuments({ database: DB, documents: [`${DB}/documents/exp/highlevel`] })
  for await (const res of s) {
    console.log('D. high-level write → v1 read (raw):')
    for (const [key, value] of Object.entries(res.found?.fields ?? {})) {
      console.log(`   ${key.padEnd(10)} ${value.valueType} ${JSON.stringify(value[value.valueType])}`)
    }
  }
}

// ── E. v1 の batchWrite で、追記（無い時だけ作る）と上書きを書き、1 件ずつの成否を見る ──
{
  const doc = (id) => `${DB}/documents/exp_batch/${id}`
  const fields = { v: { doubleValue: 1 } }
  const owner = { otherArgs: { headers: { Authorization: 'Bearer owner' } } }
  // 1 回目: a, b を作る
  await client.batchWrite({
    database: DB,
    writes: [
      { update: { name: doc('a'), fields }, currentDocument: { exists: false } },
      { update: { name: doc('b'), fields }, currentDocument: { exists: false } }
    ]
  }, owner)
  // 2 回目: 追記で a（既にある）、c（無い）。上書きで b
  const [res] = await client.batchWrite({
    database: DB,
    writes: [
      { update: { name: doc('a'), fields }, currentDocument: { exists: false } },
      { update: { name: doc('c'), fields }, currentDocument: { exists: false } },
      { update: { name: doc('b'), fields: { v: { doubleValue: 2 } } } }
    ]
  }, owner)
  console.log('E. v1 batchWrite (append a, append c, overwrite b):')
  res.status.forEach((s, i) => console.log(`   write ${i}  code=${s.code} ${s.message ?? ''}`))
}

await client.close()
