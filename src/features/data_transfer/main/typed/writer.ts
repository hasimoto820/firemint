import type { FirestoreV1Handle } from '@shared/firestore/client'
import { throwIfCanceled } from '@shared/safety/canceled'
import type { ImportWriteMode } from '../../shared/official'
import type { TypedDocument } from '../../shared/typed_value'
import { toV1Fields } from './convert'

/** batchWrite 1 回の上限 */
const MAX_WRITES = 500
/** 1 回のリクエストの大きさの目安（上限 10 MiB より小さく） */
const MAX_BYTES = 8 * 1024 * 1024
const MAX_ATTEMPTS = 3
const SAMPLE_LIMIT = 20

const CODE_OK = 0
const CODE_ALREADY_EXISTS = 6
/** やり直せば通る見込みがあるもの: DEADLINE_EXCEEDED / RESOURCE_EXHAUSTED / ABORTED / UNAVAILABLE */
const RETRYABLE_CODES = new Set([4, 8, 10, 14])

type Pending = { path: string; write: Record<string, unknown>; bytes: number }

export type WriteCounts = {
  writtenCount: number
  skippedCount: number
  failedCount: number
  skippedSamples: string[]
  failedSamples: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 型を明示して書く（v1 の batchWrite）。1 件ずつ成否が返るので、
 * 1 件が断られても他の書き込みは道連れにならない。
 *
 * 追記    無い時だけ作る（currentDocument.exists = false）。既にあるものは飛ばした件数
 * 上書き  ドキュメントを丸ごと置き換える。無ければ作る
 */
export class TypedBatchWriter {
  readonly counts: WriteCounts = {
    writtenCount: 0,
    skippedCount: 0,
    failedCount: 0,
    skippedSamples: [],
    failedSamples: []
  }

  private pending: Pending[] = []
  private pendingBytes = 0

  constructor(
    private readonly handle: FirestoreV1Handle,
    private readonly mode: ImportWriteMode,
    private readonly signal?: AbortSignal
  ) {}

  async add(document: TypedDocument): Promise<void> {
    const write: Record<string, unknown> = {
      update: {
        name: `${this.handle.database}/documents/${document.path}`,
        fields: toV1Fields(document.fields, this.handle.database)
      }
    }
    if (this.mode === 'append') {
      write.currentDocument = { exists: false }
    }

    const bytes = JSON.stringify(document.fields).length + document.path.length
    if (this.pending.length > 0 && this.pendingBytes + bytes > MAX_BYTES) {
      await this.flush()
    }

    this.pending.push({ path: document.path, write, bytes })
    this.pendingBytes += bytes

    if (this.pending.length >= MAX_WRITES) {
      await this.flush()
    }
  }

  /** 書く前に数える（読めない行など）。書けなかった件数に足す */
  countFailed(label: string): void {
    this.counts.failedCount += 1
    if (this.counts.failedSamples.length < SAMPLE_LIMIT) {
      this.counts.failedSamples.push(label)
    }
  }

  /** 書く前に数える（同じパスの 2 回目以降など）。飛ばした件数に足す */
  countSkipped(label: string): void {
    this.counts.skippedCount += 1
    if (this.counts.skippedSamples.length < SAMPLE_LIMIT) {
      this.counts.skippedSamples.push(label)
    }
  }

  async flush(): Promise<void> {
    let batch = this.pending
    this.pending = []
    this.pendingBytes = 0

    for (let attempt = 1; batch.length > 0; attempt += 1) {
      throwIfCanceled(this.signal)
      const [response] = await this.handle.client.batchWrite(
        { database: this.handle.database, writes: batch.map((item) => item.write) },
        this.handle.callOptions
      )

      const retry: Pending[] = []
      const statuses = response.status ?? []
      batch.forEach((item, index) => {
        const code = statuses[index]?.code ?? CODE_OK
        if (code === CODE_OK) {
          this.counts.writtenCount += 1
        } else if (code === CODE_ALREADY_EXISTS && this.mode === 'append') {
          this.countSkipped(item.path)
        } else if (RETRYABLE_CODES.has(code) && attempt < MAX_ATTEMPTS) {
          retry.push(item)
        } else {
          this.countFailed(`${item.path}（${statuses[index]?.message ?? `code=${code}`}）`)
        }
      })

      batch = retry
      if (batch.length > 0) {
        await sleep(500 * attempt)
      }
    }
  }
}
