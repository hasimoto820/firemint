import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore'
import { getFirestore } from './client'

export function assertCollectionPath(collectionPath: string): void {
  const segments = collectionPath.split('/').filter(Boolean)

  if (segments.length === 0 || segments.length % 2 === 0) {
    throw new Error(`Invalid collection path: ${collectionPath}`)
  }
}

export function assertDocumentPath(documentPath: string): void {
  const segments = documentPath.split('/').filter(Boolean)

  if (segments.length === 0 || segments.length % 2 !== 0) {
    throw new Error(`Invalid document path: ${documentPath}`)
  }
}

export function getCollectionRef(
  collectionPath: string,
  projectId?: string
): CollectionReference {
  assertCollectionPath(collectionPath)

  const segments = collectionPath.split('/').filter(Boolean)
  let ref = getFirestore(projectId).collection(segments[0])

  for (let index = 1; index < segments.length; index += 2) {
    ref = ref.doc(segments[index]).collection(segments[index + 1])
  }

  return ref
}

export function getDocumentRef(documentPath: string, projectId?: string): DocumentReference {
  assertDocumentPath(documentPath)

  const segments = documentPath.split('/').filter(Boolean)
  const collectionPath = segments.slice(0, -1).join('/')

  return getCollectionRef(collectionPath, projectId).doc(segments[segments.length - 1])
}

export function joinDocumentPath(collectionPath: string, documentId: string): string {
  return `${collectionPath}/${documentId}`
}

export function joinCollectionPath(documentPath: string, subcollectionId: string): string {
  return `${documentPath}/${subcollectionId}`
}
