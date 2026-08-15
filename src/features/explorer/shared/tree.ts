export type TreeNodeKind = 'collection' | 'document'

export type TreeNode = {
  kind: TreeNodeKind
  name: string
  path: string
}

export function getTreeDepth(path: string): number {
  const segments = path.split('/').filter(Boolean)
  return Math.max(0, segments.length - 1)
}

export function getExpandableAncestorPaths(path: string): string[] {
  const segments = path.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return []
  }

  const ancestors: string[] = []
  let current = segments[0]

  for (let index = 1; index < segments.length; index += 1) {
    ancestors.push(current)
    current = `${current}/${segments[index]}`
  }

  return ancestors
}

export function buildSubcollectionPath(documentPath: string, subcollectionId: string): string {
  return `${documentPath}/${subcollectionId}`
}

export function isSubcollectionPath(collectionPath: string): boolean {
  const segments = collectionPath.split('/').filter(Boolean)

  return segments.length >= 3 && segments.length % 2 === 1
}

export function collectionKindLabel(collectionPath: string): 'コレクション' | 'サブコレクション' {
  return isSubcollectionPath(collectionPath) ? 'サブコレクション' : 'コレクション'
}

export function parentDocumentPathOfSubcollection(collectionPath: string): string {
  const segments = collectionPath.split('/').filter(Boolean)

  if (!isSubcollectionPath(collectionPath)) {
    return ''
  }

  return segments.slice(0, -1).join('/')
}

/** `user` → `user_1`。`user_1` があれば `user_2`。path の親は維持する。 */
export function nextDuplicateCollectionPath(
  collectionPath: string,
  siblingIds: string[]
): string {
  const segments = collectionPath.split('/').filter(Boolean)
  const name = segments[segments.length - 1] ?? collectionPath
  const taken = new Set(siblingIds)
  const numbered = name.match(/^(.*)_([1-9]\d*)$/)
  const base = numbered?.[1] || name
  let n = 1

  while (taken.has(`${base}_${n}`)) {
    n += 1
  }

  const nextName = `${base}_${n}`

  if (segments.length <= 1) {
    return nextName
  }

  return [...segments.slice(0, -1), nextName].join('/')
}
