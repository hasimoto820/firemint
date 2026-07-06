import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import {
  getCollectionRef,
  getDocumentRef,
  joinCollectionPath,
  joinDocumentPath
} from '@shared/firestore/paths'
import {
  deserializeDocumentData,
  serializeFirestoreValue
} from '@shared/firestore/serialize'
import { logError, logInfo } from '@shared/logging/logger'
import { ensureWritable } from '@features/workspace/main/guard'
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentSummary,
  DuplicateCollectionInput,
  DuplicateCollectionResult,
  DuplicateDocumentInput,
  ExplorerResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

const DUPLICATE_COLLECTION_LIMIT = 500
const BATCH_LIMIT = 500

function toExplorerError<T>(error: unknown): ExplorerResult<T> {
  logError('explorer', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Explorer operation failed'
  }
}

function snapshotTimestamps(snapshot: DocumentSnapshot | QueryDocumentSnapshot): {
  createTime: string | null
  updateTime: string | null
} {
  return {
    createTime: snapshot.createTime?.toDate().toISOString() ?? null,
    updateTime: snapshot.updateTime?.toDate().toISOString() ?? null
  }
}

function toDocumentSummary(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>,
  timestamps?: { createTime: string | null; updateTime: string | null }
): DocumentSummary {
  return {
    id,
    path: joinDocumentPath(collectionPath, id),
    data: serializeFirestoreValue(data) as Record<string, unknown>,
    createTime: timestamps?.createTime ?? null,
    updateTime: timestamps?.updateTime ?? null
  }
}

function toDocumentSummaryFromSnapshot(
  collectionPath: string,
  snapshot: DocumentSnapshot | QueryDocumentSnapshot
): DocumentSummary {
  return toDocumentSummary(
    collectionPath,
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
    snapshotTimestamps(snapshot)
  )
}

export async function listRootCollections(projectId: string): Promise<ExplorerResult<string[]>> {
  try {
    ensureConnected(projectId)
    logInfo('explorer', `listRootCollections projectId=${projectId}`)
    const collections = await getFirestore(projectId).listCollections()
    const names = collections.map((collection) => collection.id)
    return { ok: true, data: names }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function listDocuments(
  projectId: string,
  collectionPath: string
): Promise<ExplorerResult<DocumentSummary[]>> {
  try {
    ensureConnected(projectId)
    logInfo('explorer', `listDocuments projectId=${projectId} path=${collectionPath}`)
    const snapshot = await getCollectionRef(collectionPath, projectId).limit(200).get()

    const documents = snapshot.docs.map((doc) => toDocumentSummaryFromSnapshot(collectionPath, doc))

    return { ok: true, data: documents }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function getDocument(
  projectId: string,
  documentPath: string
): Promise<ExplorerResult<DocumentDetail>> {
  try {
    ensureConnected(projectId)
    logInfo('explorer', `getDocument projectId=${projectId} path=${documentPath}`)
    const snapshot = await getDocumentRef(documentPath, projectId).get()

    if (!snapshot.exists) {
      throw new Error('Document not found')
    }

    const segments = documentPath.split('/').filter(Boolean)
    const collectionPath = segments.slice(0, -1).join('/')

    return {
      ok: true,
      data: toDocumentSummaryFromSnapshot(collectionPath, snapshot)
    }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function createDocument(input: CreateDocumentInput): Promise<ExplorerResult<string>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)
    logInfo('explorer', `createDocument projectId=${input.projectId} path=${input.collectionPath}`)
    const collectionRef = getCollectionRef(input.collectionPath, input.projectId)
    const documentRef = input.documentId ? collectionRef.doc(input.documentId) : collectionRef.doc()

    await documentRef.set(deserializeDocumentData(input.data))

    return { ok: true, data: documentRef.id }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function updateDocument(input: UpdateDocumentInput): Promise<ExplorerResult<null>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)
    logInfo('explorer', `updateDocument projectId=${input.projectId} path=${input.documentPath}`)
    await getDocumentRef(input.documentPath, input.projectId).set(deserializeDocumentData(input.data))

    return { ok: true, data: null }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function deleteDocument(
  projectId: string,
  documentPath: string
): Promise<ExplorerResult<null>> {
  try {
    ensureConnected(projectId)
    ensureWritable(projectId)
    logInfo('explorer', `deleteDocument projectId=${projectId} path=${documentPath}`)
    await getDocumentRef(documentPath, projectId).delete()

    return { ok: true, data: null }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function listSubcollections(
  projectId: string,
  documentPath: string
): Promise<ExplorerResult<string[]>> {
  try {
    ensureConnected(projectId)
    logInfo('explorer', `listSubcollections projectId=${projectId} path=${documentPath}`)
    const collections = await getDocumentRef(documentPath, projectId).listCollections()
    const names = collections.map((collection) => collection.id)

    return { ok: true, data: names }
  } catch (error) {
    return toExplorerError(error)
  }
}

export function buildSubcollectionPath(documentPath: string, subcollectionId: string): string {
  return joinCollectionPath(documentPath, subcollectionId)
}

export async function duplicateDocument(
  input: DuplicateDocumentInput
): Promise<ExplorerResult<string>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    logInfo('explorer', `duplicateDocument projectId=${input.projectId} path=${input.documentPath}`)

    const snapshot = await getDocumentRef(input.documentPath, input.projectId).get()

    if (!snapshot.exists) {
      throw new Error('Document not found')
    }

    const segments = input.documentPath.split('/').filter(Boolean)
    const collectionPath = segments.slice(0, -1).join('/')
    const collectionRef = getCollectionRef(collectionPath, input.projectId)
    const targetRef = input.targetDocumentId
      ? collectionRef.doc(input.targetDocumentId)
      : collectionRef.doc()

    const existing = await targetRef.get()

    if (existing.exists) {
      throw new Error('複製先のドキュメント ID は既に存在します')
    }

    await targetRef.set(snapshot.data() as Record<string, unknown>)

    return { ok: true, data: targetRef.id }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function duplicateCollection(
  input: DuplicateCollectionInput
): Promise<ExplorerResult<DuplicateCollectionResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const sourceCollectionPath = input.sourceCollectionPath.trim()
    const targetCollectionPath = input.targetCollectionPath.trim()

    if (!sourceCollectionPath || !targetCollectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    if (sourceCollectionPath === targetCollectionPath) {
      throw new Error('複製先は別のコレクション path を指定してください')
    }

    logInfo(
      'explorer',
      `duplicateCollection projectId=${input.projectId} from=${sourceCollectionPath} to=${targetCollectionPath}`
    )

    const snapshot = await getCollectionRef(sourceCollectionPath, input.projectId)
      .limit(DUPLICATE_COLLECTION_LIMIT)
      .get()

    if (snapshot.empty) {
      throw new Error('複製元のコレクションにドキュメントがありません')
    }

    const targetRef = getCollectionRef(targetCollectionPath, input.projectId)
    const targetSnapshot = await targetRef.limit(1).get()

    if (!targetSnapshot.empty) {
      throw new Error('複製先コレクションは空である必要があります')
    }

    let copiedCount = 0

    for (let index = 0; index < snapshot.docs.length; index += BATCH_LIMIT) {
      const chunk = snapshot.docs.slice(index, index + BATCH_LIMIT)
      const batch = getFirestore(input.projectId).batch()

      for (const doc of chunk) {
        batch.set(targetRef.doc(doc.id), doc.data())
        copiedCount += 1
      }

      await batch.commit()
    }

    return {
      ok: true,
      data: {
        copiedCount,
        targetCollectionPath
      }
    }
  } catch (error) {
    return toExplorerError(error)
  }
}
