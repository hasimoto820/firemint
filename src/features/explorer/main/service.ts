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
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentSummary,
  ExplorerResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'

function ensureConnected(): void {
  if (!isFirestoreConnected()) {
    throw new Error('Firestore is not connected')
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

export async function listRootCollections(): Promise<ExplorerResult<string[]>> {
  try {
    ensureConnected()
    logInfo('explorer', 'listRootCollections')
    const collections = await getFirestore().listCollections()
    const names = collections.map((collection) => collection.id)
    return { ok: true, data: names }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function listDocuments(
  collectionPath: string
): Promise<ExplorerResult<DocumentSummary[]>> {
  try {
    ensureConnected()
    logInfo('explorer', `listDocuments path=${collectionPath}`)
    const snapshot = await getCollectionRef(collectionPath).limit(200).get()

    const documents = snapshot.docs.map((doc) =>
      toDocumentSummary(collectionPath, doc.id, doc.data() as Record<string, unknown>)
    )

    return { ok: true, data: documents }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function getDocument(documentPath: string): Promise<ExplorerResult<DocumentDetail>> {
  try {
    ensureConnected()
    logInfo('explorer', `getDocument path=${documentPath}`)
    const snapshot = await getDocumentRef(documentPath).get()

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

export async function createDocument(
  input: CreateDocumentInput
): Promise<ExplorerResult<string>> {
  try {
    ensureConnected()
    logInfo('explorer', `createDocument path=${input.collectionPath}`)
    const collectionRef = getCollectionRef(input.collectionPath)
    const documentRef = input.documentId ? collectionRef.doc(input.documentId) : collectionRef.doc()

    await documentRef.set(deserializeDocumentData(input.data))

    return { ok: true, data: documentRef.id }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function updateDocument(input: UpdateDocumentInput): Promise<ExplorerResult<null>> {
  try {
    ensureConnected()
    logInfo('explorer', `updateDocument path=${input.documentPath}`)
    await getDocumentRef(input.documentPath).set(deserializeDocumentData(input.data))

    return { ok: true, data: null }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function deleteDocument(documentPath: string): Promise<ExplorerResult<null>> {
  try {
    ensureConnected()
    logInfo('explorer', `deleteDocument path=${documentPath}`)
    await getDocumentRef(documentPath).delete()

    return { ok: true, data: null }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function listSubcollections(
  documentPath: string
): Promise<ExplorerResult<string[]>> {
  try {
    ensureConnected()
    logInfo('explorer', `listSubcollections path=${documentPath}`)
    const collections = await getDocumentRef(documentPath).listCollections()
    const names = collections.map((collection) => collection.id)

    return { ok: true, data: names }
  } catch (error) {
    return toExplorerError(error)
  }
}

export function buildSubcollectionPath(documentPath: string, subcollectionId: string): string {
  return joinCollectionPath(documentPath, subcollectionId)
}
