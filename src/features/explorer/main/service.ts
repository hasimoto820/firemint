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
  ExplorerResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function toExplorerError<T>(error: unknown): ExplorerResult<T> {
  logError('explorer', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Explorer operation failed'
  }
}

function toDocumentSummary(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>
): DocumentSummary {
  return {
    id,
    path: joinDocumentPath(collectionPath, id),
    data: serializeFirestoreValue(data) as Record<string, unknown>
  }
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

    const documents = snapshot.docs.map((doc) =>
      toDocumentSummary(collectionPath, doc.id, doc.data() as Record<string, unknown>)
    )

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
      data: toDocumentSummary(collectionPath, snapshot.id, snapshot.data() as Record<string, unknown>)
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
