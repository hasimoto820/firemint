import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
  getCollectionRef,
  getDocumentRef,
  joinCollectionPath,
  joinDocumentPath
} from '@shared/firestore/paths'
import { serializeFirestoreValue } from '@shared/firestore/serialize'
import { getFirestore } from '@shared/firestore/client'
import { throwIfCanceled } from '@shared/safety/canceled'
import type { ExportDocument } from '@features/data_transfer/shared/types'

const PAGE_SIZE = 500

function toExportDocument(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>
): ExportDocument {
  return {
    id,
    path: joinDocumentPath(collectionPath, id),
    data: serializeFirestoreValue(data) as Record<string, unknown>
  }
}

async function* iterateCollectionPage(
  projectId: string,
  collectionPath: string,
  signal?: AbortSignal
): AsyncGenerator<ExportDocument> {
  const collectionRef = getCollectionRef(collectionPath, projectId)
  let lastDocument: QueryDocumentSnapshot | undefined

  while (true) {
    throwIfCanceled(signal)

    let query = collectionRef.orderBy('__name__').limit(PAGE_SIZE)

    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()

    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      yield toExportDocument(collectionPath, doc.id, doc.data() as Record<string, unknown>)
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }
}

export async function* iterateGroupDocuments(
  projectId: string,
  collectionId: string,
  signal?: AbortSignal
): AsyncGenerator<ExportDocument> {
  const db = getFirestore(projectId)
  let lastDocument: QueryDocumentSnapshot | undefined

  while (true) {
    throwIfCanceled(signal)
    let query = db.collectionGroup(collectionId).orderBy('__name__').limit(PAGE_SIZE)
    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      yield {
        id: doc.id,
        path: doc.ref.path,
        data: serializeFirestoreValue(doc.data() as Record<string, unknown>) as Record<
          string,
          unknown
        >
      }
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }
}

export async function* iterateExportDocuments(
  projectId: string,
  collectionPath: string,
  includeSubcollections: boolean,
  signal?: AbortSignal
): AsyncGenerator<ExportDocument> {
  for await (const document of iterateCollectionPage(projectId, collectionPath, signal)) {
    throwIfCanceled(signal)
    yield document

    if (!includeSubcollections) {
      continue
    }

    const subcollections = await getDocumentRef(document.path, projectId).listCollections()
    for (const subcollection of subcollections) {
      throwIfCanceled(signal)
      const nestedPath = joinCollectionPath(document.path, subcollection.id)
      yield* iterateExportDocuments(projectId, nestedPath, true, signal)
    }
  }
}
