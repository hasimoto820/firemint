export type TransportTarget = 'collection' | 'project'

export type TransportInput = {
  sourceProjectId: string
  destinationProjectId: string
  target: TransportTarget
  includeSubcollections: boolean
  /** target === 'collection' */
  sourceCollectionPath?: string
  /** target === 'collection'。省略時はソースと同じ path */
  destinationCollectionPath?: string
  /** target === 'project'。空は不可 */
  rootCollectionIds?: string[]
}

export type TransportProgress = {
  phase: 'reading' | 'validating' | 'writing' | 'done'
  processedCount: number
  writtenCount: number
  skippedCount: number
  percent: number
  detail: string | null
}

export type TransportValidation = {
  documentCount: number
  collisionCount: number
  writeCount: number
  collisionSamples: string[]
  includeSubcollections: boolean
}

export type TransportValidationResult =
  | {
      ok: true
      data: TransportValidation
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }

export type TransportSummary = {
  documentCount: number
  writtenCount: number
  skippedCount: number
  collisionSamples: string[]
  includeSubcollections: boolean
}

export type TransportResult =
  | {
      ok: true
      data: TransportSummary
    }
  | {
      ok: false
      error: string
      canceled?: boolean
    }
