import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeLeveldbRecord, writeLeveldbRecords } from './leveldb_log'
import { documentToEntity } from './document_to_entity'
import {
  encodeBytesField,
  encodeGroupField,
  encodeMessageField,
  encodeUtf8Field,
  encodeVarintField
} from './proto_wire'
import { readOfficialDump } from './read_dump'
import type { ExportDocument } from '../../shared/types'

function encodePath(collectionId: string, documentId: string): Buffer {
  return encodeGroupField(
    1,
    Buffer.concat([encodeUtf8Field(2, collectionId), encodeUtf8Field(4, documentId)])
  )
}

function encodeReference(app: string, collectionId: string, documentId: string): Buffer {
  return Buffer.concat([encodeUtf8Field(13, app), encodeMessageField(14, encodePath(collectionId, documentId))])
}

function encodeIntProperty(name: string, value: bigint): Buffer {
  return Buffer.concat([
    encodeUtf8Field(3, name),
    encodeVarintField(4, 0n),
    encodeMessageField(5, encodeVarintField(1, value))
  ])
}

function encodeStringProperty(name: string, value: string): Buffer {
  return Buffer.concat([
    encodeUtf8Field(3, name),
    encodeVarintField(4, 0n),
    encodeMessageField(5, encodeBytesField(3, Buffer.from(value, 'utf8')))
  ])
}

function encodeTimestampProperty(name: string, micros: bigint): Buffer {
  return Buffer.concat([
    encodeVarintField(1, 7n),
    encodeUtf8Field(3, name),
    encodeVarintField(4, 0n),
    encodeMessageField(5, encodeVarintField(1, micros))
  ])
}

function encodeEntity(): Buffer {
  const collectionId = 'demo'
  const documentId = 'one'
  const properties = Buffer.concat([
    encodeMessageField(14, encodeStringProperty('title', 'hello')),
    encodeMessageField(14, encodeIntProperty('count', 3n)),
    encodeMessageField(14, encodeTimestampProperty('at', 1_700_000_000_000_000n))
  ])

  return Buffer.concat([
    encodeMessageField(13, encodeReference('demo-app', collectionId, documentId)),
    properties,
    encodeMessageField(16, encodePath(collectionId, documentId))
  ])
}

export async function runOfficialDumpSelfCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'firemint-official-self-'))
  try {
    const outputDir = join(tempDir, 'all_namespaces', 'all_kinds')
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'output-0'), writeLeveldbRecord(encodeEntity()))

    const result = await readOfficialDump(tempDir)
    if (!result.ok) {
      return result
    }

    const document = result.data.documents[0]
    if (!document) {
      return { ok: false, error: 'self-check: ドキュメントが 0 件' }
    }

    if (document.path !== 'demo/one' || document.id !== 'one') {
      return { ok: false, error: `self-check: path が違う ${document.path}` }
    }

    if (document.data.title !== 'hello' || document.data.count !== 3) {
      return { ok: false, error: `self-check: フィールドが違う ${JSON.stringify(document.data)}` }
    }

    const at = document.data.at as { __firemint_type?: string; iso?: string } | undefined
    if (at?.__firemint_type !== 'timestamp' || typeof at.iso !== 'string') {
      return { ok: false, error: `self-check: timestamp が解けない ${JSON.stringify(document.data.at)}` }
    }

    const roundDir = join(tempDir, 'round')
    const roundOutput = join(roundDir, 'all_namespaces', 'all_kinds')
    await mkdir(roundOutput, { recursive: true })

    const source: ExportDocument = {
      id: 'one',
      path: 'demo/one',
      data: {
        title: 'hello',
        count: 3,
        flag: true,
        tags: ['a', 'b'],
        nested: { inner: 'x' },
        at: { __firemint_type: 'timestamp', iso: '2023-11-14T22:13:20.000Z' },
        loc: { __firemint_type: 'geopoint', latitude: 35, longitude: 139 },
        ref: { __firemint_type: 'reference', path: 'demo/two' },
        blob: { __firemint_type: 'bytes', base64: Buffer.from('hi', 'utf8').toString('base64') }
      }
    }

    await writeFile(
      join(roundOutput, 'output-0'),
      writeLeveldbRecords([documentToEntity(source, 's~demo-project')])
    )

    const round = await readOfficialDump(roundDir)
    if (!round.ok) {
      return { ok: false, error: `self-check round-trip: ${round.error}` }
    }

    const decoded = round.data.documents[0]
    if (!decoded || decoded.path !== 'demo/one' || decoded.id !== 'one') {
      return { ok: false, error: `self-check round-trip: path が違う ${decoded?.path}` }
    }

    if (decoded.data.title !== 'hello' || decoded.data.count !== 3 || decoded.data.flag !== true) {
      return {
        ok: false,
        error: `self-check round-trip: 基本フィールドが違う ${JSON.stringify(decoded.data)}`
      }
    }

    const tags = decoded.data.tags
    if (!Array.isArray(tags) || tags.join(',') !== 'a,b') {
      return { ok: false, error: `self-check round-trip: 配列が違う ${JSON.stringify(tags)}` }
    }

    const nested = decoded.data.nested as { inner?: unknown } | undefined
    if (nested?.inner !== 'x') {
      return { ok: false, error: `self-check round-trip: ネストが違う ${JSON.stringify(nested)}` }
    }

    const roundAt = decoded.data.at as { __firemint_type?: string; iso?: string } | undefined
    if (roundAt?.__firemint_type !== 'timestamp' || roundAt.iso !== '2023-11-14T22:13:20.000Z') {
      return { ok: false, error: `self-check round-trip: timestamp が違う ${JSON.stringify(roundAt)}` }
    }

    const loc = decoded.data.loc as
      | { __firemint_type?: string; latitude?: number; longitude?: number }
      | undefined
    if (
      loc?.__firemint_type !== 'geopoint' ||
      loc.latitude !== 35 ||
      loc.longitude !== 139
    ) {
      return { ok: false, error: `self-check round-trip: geopoint が違う ${JSON.stringify(loc)}` }
    }

    const ref = decoded.data.ref as { __firemint_type?: string; path?: string } | undefined
    if (ref?.__firemint_type !== 'reference' || ref.path !== 'demo/two') {
      return { ok: false, error: `self-check round-trip: reference が違う ${JSON.stringify(ref)}` }
    }

    const blob = decoded.data.blob as { __firemint_type?: string; base64?: string } | undefined
    if (blob?.__firemint_type !== 'bytes' || blob.base64 !== Buffer.from('hi', 'utf8').toString('base64')) {
      return { ok: false, error: `self-check round-trip: bytes が違う ${JSON.stringify(blob)}` }
    }

    if (round.data.sourceProjectId !== 'demo-project') {
      return {
        ok: false,
        error: `self-check round-trip: projectId が違う ${round.data.sourceProjectId}`
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'self-check に失敗しました'
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
