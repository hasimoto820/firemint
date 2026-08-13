import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getFirestore, isFirestoreConnected } from '@shared/firestore/client'
import {
  assertCollectionPath,
  assertDocumentPath,
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
  CreateSubcollectionInput,
  CreateSubcollectionResult,
  DeleteCollectionInput,
  DeleteCollectionResult,
  DocumentDetail,
  DocumentSummary,
  DuplicateCollectionInput,
  DuplicateCollectionResult,
  DuplicateDocumentInput,
  ExplorerResult,
  RenameCollectionInput,
  RenameCollectionResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'
import { isSubcollectionPath } from '@features/explorer/shared/tree'

function ensureConnected(projectId: string): void {
  if (!isFirestoreConnected(projectId)) {
    throw new Error(`Firestore is not connected: ${projectId}`)
  }
}

function assertSubcollectionId(subcollectionId: string): string {
  const trimmed = subcollectionId.trim()

  if (!trimmed) {
    throw new Error('サブコレクション名を入力してください')
  }

  if (trimmed.includes('/')) {
    throw new Error('サブコレクション名に / は使えません')
  }

  return trimmed
}

const DUPLICATE_COLLECTION_LIMIT = 500
const BATCH_LIMIT = 500
const PAGE_SIZE = 500

function toExplorerError<T>(error: unknown): ExplorerResult<T> {
  logError('explorer', 'operation failed', error)
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Explorer operation failed'
  }
}

class DocumentConflictError extends Error {
  readonly code = 'conflict' as const

  constructor(readonly currentUpdateTime: string | null) {
    super('Document was modified elsewhere')
    this.name = 'DocumentConflictError'
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

    const ref = getDocumentRef(input.documentPath, input.projectId)
    const data = deserializeDocumentData(input.data)
    const skipConflictCheck =
      input.forceOverwrite === true || input.expectedUpdateTime === undefined

    if (skipConflictCheck) {
      await ref.set(data)
      return { ok: true, data: null }
    }

    // 開いた時点の updateTime と一致するときだけ set（楽観ロック）
    await getFirestore(input.projectId).runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      const currentUpdateTime = snapshot.exists
        ? (snapshot.updateTime?.toDate().toISOString() ?? null)
        : null

      if (!snapshot.exists || currentUpdateTime !== input.expectedUpdateTime) {
        throw new DocumentConflictError(currentUpdateTime)
      }

      tx.set(ref, data)
    })

    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      logInfo(
        'explorer',
        `updateDocument conflict path=${input.documentPath} current=${error.currentUpdateTime ?? 'null'}`
      )
      return {
        ok: false,
        error: 'Document was modified elsewhere',
        code: 'conflict',
        currentUpdateTime: error.currentUpdateTime
      }
    }

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

async function copyCollectionRecursive(
  projectId: string,
  sourceCollectionPath: string,
  targetCollectionPath: string
): Promise<number> {
  const sourceRef = getCollectionRef(sourceCollectionPath, projectId)
  const targetRef = getCollectionRef(targetCollectionPath, projectId)
  let movedCount = 0
  let lastDocument: QueryDocumentSnapshot | undefined

  while (true) {
    let query = sourceRef.orderBy('__name__').limit(PAGE_SIZE)

    if (lastDocument) {
      query = query.startAfter(lastDocument)
    }

    const snapshot = await query.get()

    if (snapshot.empty) {
      break
    }

    for (let index = 0; index < snapshot.docs.length; index += BATCH_LIMIT) {
      const chunk = snapshot.docs.slice(index, index + BATCH_LIMIT)
      const batch = getFirestore(projectId).batch()

      for (const doc of chunk) {
        batch.set(targetRef.doc(doc.id), doc.data())
        movedCount += 1
      }

      await batch.commit()
    }

    for (const doc of snapshot.docs) {
      const sourceDocumentPath = joinDocumentPath(sourceCollectionPath, doc.id)
      const targetDocumentPath = joinDocumentPath(targetCollectionPath, doc.id)
      const subcollections = await getDocumentRef(sourceDocumentPath, projectId).listCollections()

      for (const subcollection of subcollections) {
        movedCount += await copyCollectionRecursive(
          projectId,
          joinCollectionPath(sourceDocumentPath, subcollection.id),
          joinCollectionPath(targetDocumentPath, subcollection.id)
        )
      }
    }

    lastDocument = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < PAGE_SIZE) {
      break
    }
  }

  return movedCount
}

async function deleteCollectionRecursive(
  projectId: string,
  collectionPath: string
): Promise<number> {
  const collectionRef = getCollectionRef(collectionPath, projectId)
  let deletedCount = 0

  while (true) {
    const snapshot = await collectionRef.orderBy('__name__').limit(PAGE_SIZE).get()

    if (snapshot.empty) {
      break
    }

    for (const doc of snapshot.docs) {
      const documentPath = joinDocumentPath(collectionPath, doc.id)
      const subcollections = await getDocumentRef(documentPath, projectId).listCollections()

      for (const subcollection of subcollections) {
        deletedCount += await deleteCollectionRecursive(
          projectId,
          joinCollectionPath(documentPath, subcollection.id)
        )
      }
    }

    for (let index = 0; index < snapshot.docs.length; index += BATCH_LIMIT) {
      const chunk = snapshot.docs.slice(index, index + BATCH_LIMIT)
      const batch = getFirestore(projectId).batch()

      for (const doc of chunk) {
        batch.delete(doc.ref)
      }

      await batch.commit()
      deletedCount += chunk.length
    }
  }

  return deletedCount
}

export async function renameCollection(
  input: RenameCollectionInput
): Promise<ExplorerResult<RenameCollectionResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const sourceCollectionPath = input.sourceCollectionPath.trim()
    const targetCollectionPath = input.targetCollectionPath.trim()

    if (!sourceCollectionPath || !targetCollectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    assertCollectionPath(sourceCollectionPath)
    assertCollectionPath(targetCollectionPath)

    if (sourceCollectionPath === targetCollectionPath) {
      throw new Error('リネーム先は別のコレクション path を指定してください')
    }

    const sourceSegments = sourceCollectionPath.split('/').filter(Boolean)
    const targetSegments = targetCollectionPath.split('/').filter(Boolean)

    if (sourceSegments.length !== targetSegments.length) {
      throw new Error('リネームではコレクション階層の深さを変えられません')
    }

    if (targetCollectionPath.startsWith(`${sourceCollectionPath}/`)) {
      throw new Error('リネーム先を元コレクションの配下にはできません')
    }

    logInfo(
      'explorer',
      `renameCollection projectId=${input.projectId} from=${sourceCollectionPath} to=${targetCollectionPath}`
    )

    const sourceSnapshot = await getCollectionRef(sourceCollectionPath, input.projectId)
      .limit(1)
      .get()

    if (sourceSnapshot.empty) {
      throw new Error('リネーム元のコレクションにドキュメントがありません')
    }

    const targetSnapshot = await getCollectionRef(targetCollectionPath, input.projectId)
      .limit(1)
      .get()

    if (!targetSnapshot.empty) {
      throw new Error('リネーム先コレクションは空である必要があります')
    }

    const movedCount = await copyCollectionRecursive(
      input.projectId,
      sourceCollectionPath,
      targetCollectionPath
    )

    await deleteCollectionRecursive(input.projectId, sourceCollectionPath)

    return {
      ok: true,
      data: {
        movedCount,
        targetCollectionPath
      }
    }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function createSubcollection(
  input: CreateSubcollectionInput
): Promise<ExplorerResult<CreateSubcollectionResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const documentPath = input.documentPath.trim()
    assertDocumentPath(documentPath)

    const subcollectionId = assertSubcollectionId(input.subcollectionId)
    const subcollectionPath = joinCollectionPath(documentPath, subcollectionId)

    assertCollectionPath(subcollectionPath)

    logInfo(
      'explorer',
      `createSubcollection projectId=${input.projectId} document=${documentPath} sub=${subcollectionId}`
    )

    const documentSnapshot = await getDocumentRef(documentPath, input.projectId).get()

    if (!documentSnapshot.exists) {
      throw new Error('親ドキュメントが見つかりません')
    }

    const existingSubcollections = await getDocumentRef(documentPath, input.projectId).listCollections()

    if (existingSubcollections.some((collection) => collection.id === subcollectionId)) {
      throw new Error('同名のサブコレクションが既に存在します')
    }

    const createResult = await createDocument({
      projectId: input.projectId,
      collectionPath: subcollectionPath,
      data: {}
    })

    if (!createResult.ok) {
      throw new Error(createResult.error)
    }

    return {
      ok: true,
      data: {
        subcollectionPath,
        documentId: createResult.data
      }
    }
  } catch (error) {
    return toExplorerError(error)
  }
}

export async function deleteCollection(
  input: DeleteCollectionInput
): Promise<ExplorerResult<DeleteCollectionResult>> {
  try {
    ensureConnected(input.projectId)
    ensureWritable(input.projectId)

    const collectionPath = input.collectionPath.trim()

    if (!collectionPath) {
      throw new Error('コレクション path を指定してください')
    }

    assertCollectionPath(collectionPath)

    if (!isSubcollectionPath(collectionPath)) {
      throw new Error('ルートコレクションは削除できません')
    }

    logInfo('explorer', `deleteCollection projectId=${input.projectId} path=${collectionPath}`)

    const deletedDocumentCount = await deleteCollectionRecursive(input.projectId, collectionPath)

    return {
      ok: true,
      data: {
        deletedDocumentCount
      }
    }
  } catch (error) {
    return toExplorerError(error)
  }
}
