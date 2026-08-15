import { useCallback, useEffect, useRef, useState } from 'react'
import type { BulkFieldMode } from '@features/bulk_operations/shared/types'
import { useOptionalAutocompleteApi } from '@features/autocomplete/renderer/hooks'
import {
  buildSubcollectionPath,
  collectionKindLabel,
  getExpandableAncestorPaths,
  getTreeDepth,
  type TreeNode,
  type TreeNodeKind
} from '@features/explorer/shared/tree'

type CollectionTreeProps = {
  projectId: string
  rootCollections: string[]
  activeCollectionPath: string | null
  selectedDocumentPath: string | null
  onSelectCollection: (collectionPath: string) => void
  onSelectDocument: (documentPath: string) => void
  onRenameCollection?: (collectionPath: string) => void
  onDuplicateCollection?: (collectionPath: string) => void
  onDeleteCollection?: (collectionPath: string) => void
  onFieldBulk?: (collectionPath: string, mode: BulkFieldMode) => void
  onDuplicateDocument?: (documentPath: string) => void
  onDeleteDocument?: (documentPath: string) => void
  onCreateSubcollection?: (documentPath: string) => void
  canRename?: boolean
  canManageSubcollections?: boolean
  reloadToken?: number
  /** 展開は維持したまま、キャッシュ済みの子だけ再取得する */
  contentReloadToken?: number
  disabled?: boolean
  title?: string
}

type ContextMenuState =
  | {
      x: number
      y: number
      kind: 'collection'
      collectionPath: string
    }
  | {
      x: number
      y: number
      kind: 'document'
      documentPath: string
    }

function CollectionTree({
  projectId,
  rootCollections,
  activeCollectionPath,
  selectedDocumentPath,
  onSelectCollection,
  onSelectDocument,
  onRenameCollection,
  onDuplicateCollection,
  onDeleteCollection,
  onFieldBulk,
  onDuplicateDocument,
  onDeleteDocument,
  onCreateSubcollection,
  canManageSubcollections = false,
  canRename = false,
  reloadToken = 0,
  contentReloadToken = 0,
  disabled = false,
  title = 'コレクション'
}: CollectionTreeProps): React.JSX.Element {
  const autocomplete = useOptionalAutocompleteApi()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [childrenByPath, setChildrenByPath] = useState<Record<string, TreeNode[]>>({})
  const childrenRef = useRef<Record<string, TreeNode[]>>({})
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const resetTree = useCallback((): void => {
    childrenRef.current = {}
    setExpandedPaths(new Set())
    setChildrenByPath({})
    setLoadingPaths(new Set())
    setError(null)
  }, [])

  useEffect(() => {
    resetTree()
  }, [projectId, resetTree])

  useEffect(() => {
    if (reloadToken <= 0) {
      return
    }

    resetTree()
  }, [reloadToken, resetTree])

  const registerCollectionPaths = useCallback(
    (nodes: TreeNode[]): void => {
      const paths = nodes
        .filter((node) => node.kind === 'collection')
        .map((node) => node.path)

      if (paths.length > 0) {
        autocomplete.addCollectionPaths(projectId, paths)
      }
    },
    [autocomplete, projectId]
  )

  const loadChildren = useCallback(
    async (node: TreeNode): Promise<TreeNode[]> => {
      if (node.kind === 'collection') {
        const result = await window.api.explorer.listDocuments(projectId, node.path)

        if (!result.ok) {
          throw new Error(result.error)
        }

        return result.data.map((document) => ({
          kind: 'document' as const,
          name: document.id,
          path: document.path
        }))
      }

      const result = await window.api.explorer.listSubcollections(projectId, node.path)

      if (!result.ok) {
        throw new Error(result.error)
      }

      return result.data.map((name) => ({
        kind: 'collection' as const,
        name,
        path: buildSubcollectionPath(node.path, name)
      }))
    },
    [projectId]
  )

  const refreshChildren = useCallback(
    async (path: string, kind: TreeNodeKind): Promise<void> => {
      const node: TreeNode = { kind, name: path.split('/').pop() ?? path, path }

      setLoadingPaths((current) => new Set(current).add(path))
      setError(null)

      try {
        const children = await loadChildren(node)
        childrenRef.current[path] = children
        setChildrenByPath((current) => ({ ...current, [path]: children }))
        registerCollectionPaths(children)
      } catch (loadError) {
        delete childrenRef.current[path]
        setChildrenByPath((current) => {
          const next = { ...current }
          delete next[path]
          return next
        })
        setError(loadError instanceof Error ? loadError.message : 'ツリーの読み込みに失敗しました')
      } finally {
        setLoadingPaths((current) => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
      }
    },
    [loadChildren, registerCollectionPaths]
  )

  useEffect(() => {
    if (contentReloadToken <= 0) {
      return
    }

    const paths = Object.keys(childrenRef.current)

    for (const path of paths) {
      const segmentCount = path.split('/').filter(Boolean).length
      const kind: TreeNodeKind = segmentCount % 2 === 1 ? 'collection' : 'document'
      void refreshChildren(path, kind)
    }
  }, [contentReloadToken, refreshChildren])

  useEffect(() => {
    if (rootCollections.length === 0) {
      return
    }

    autocomplete.addCollectionPaths(projectId, rootCollections)
  }, [autocomplete, projectId, rootCollections])

  const ensureExpandedWithChildren = useCallback(
    async (path: string, kind: TreeNodeKind): Promise<void> => {
      const node: TreeNode = { kind, name: path.split('/').pop() ?? path, path }

      if (childrenRef.current[path]) {
        setExpandedPaths((current) => new Set(current).add(path))
        return
      }

      setLoadingPaths((current) => new Set(current).add(path))
      setError(null)

      try {
        const children = await loadChildren(node)
        childrenRef.current[path] = children
        setChildrenByPath((current) => ({ ...current, [path]: children }))
        setExpandedPaths((current) => new Set(current).add(path))
        registerCollectionPaths(children)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'ツリーの読み込みに失敗しました')
      } finally {
        setLoadingPaths((current) => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
      }
    },
    [loadChildren, registerCollectionPaths]
  )

  const expandPathChain = useCallback(
    async (targetPath: string | null, kind: TreeNodeKind): Promise<void> => {
      if (!targetPath) {
        return
      }

      const ancestors = getExpandableAncestorPaths(targetPath)

      for (const ancestorPath of ancestors) {
        const ancestorKind: TreeNodeKind =
          ancestorPath.split('/').filter(Boolean).length % 2 === 0 ? 'document' : 'collection'
        await ensureExpandedWithChildren(ancestorPath, ancestorKind)
      }

      if (kind === 'document') {
        const parentCollection = targetPath.split('/').slice(0, -1).join('/')
        if (parentCollection) {
          await ensureExpandedWithChildren(parentCollection, 'collection')
        }
      }

      await ensureExpandedWithChildren(targetPath, kind)
    },
    [ensureExpandedWithChildren]
  )

  useEffect(() => {
    void expandPathChain(activeCollectionPath, 'collection')
  }, [activeCollectionPath, expandPathChain])

  useEffect(() => {
    void expandPathChain(selectedDocumentPath, 'document')
  }, [selectedDocumentPath, expandPathChain])

  const handleToggle = async (node: TreeNode): Promise<void> => {
    if (disabled || loadingPaths.has(node.path)) {
      return
    }

    if (expandedPaths.has(node.path)) {
      setExpandedPaths((current) => {
        const next = new Set(current)
        next.delete(node.path)
        return next
      })
      return
    }

    await ensureExpandedWithChildren(node.path, node.kind)
  }

  const handleSelect = (node: TreeNode): void => {
    if (disabled) {
      return
    }

    setContextMenu(null)

    if (node.kind === 'collection') {
      onSelectCollection(node.path)

      if (activeCollectionPath === node.path) {
        void ensureExpandedWithChildren(node.path, 'collection')
      }

      return
    }

    onSelectDocument(node.path)

    if (selectedDocumentPath === node.path) {
      void ensureExpandedWithChildren(node.path, 'document')
    }
  }

  const handleCollectionContextMenu = (
    event: React.MouseEvent,
    collectionPath: string
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    if (disabled || (!canRename && !canManageSubcollections)) {
      return
    }

    if (
      !onRenameCollection &&
      !onDuplicateCollection &&
      !onDeleteCollection &&
      !onFieldBulk
    ) {
      return
    }

    onSelectCollection(collectionPath)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: 'collection',
      collectionPath
    })
  }

  const handleDocumentContextMenu = (event: React.MouseEvent, documentPath: string): void => {
    event.preventDefault()
    event.stopPropagation()

    if (
      disabled ||
      (!canRename && !canManageSubcollections)
    ) {
      return
    }

    if (!onDuplicateDocument && !onDeleteDocument && !onCreateSubcollection) {
      return
    }

    onSelectDocument(documentPath)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: 'document',
      documentPath
    })
  }

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const close = (): void => setContextMenu(null)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  const renderNode = (node: TreeNode): React.JSX.Element => {
    const depth = getTreeDepth(node.path)
    const isExpanded = expandedPaths.has(node.path)
    const isLoading = loadingPaths.has(node.path)
    const children = childrenByPath[node.path] ?? []
    const isActive =
      node.kind === 'collection'
        ? activeCollectionPath === node.path
        : selectedDocumentPath === node.path

    return (
      <li key={node.path} className="collection-tree__branch">
        <div
          className={
            isActive ? 'collection-tree__row collection-tree__row--active' : 'collection-tree__row'
          }
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            className="collection-tree__toggle"
            onClick={() => void handleToggle(node)}
            disabled={disabled || isLoading}
            aria-label={isExpanded ? '折りたたむ' : '展開する'}
          >
            {isLoading ? '…' : isExpanded ? '▼' : '▶'}
          </button>
          <button
            type="button"
            className="collection-tree__label"
            onClick={() => handleSelect(node)}
            onContextMenu={
              node.kind === 'collection'
                ? (event) => handleCollectionContextMenu(event, node.path)
                : (event) => handleDocumentContextMenu(event, node.path)
            }
            disabled={disabled}
          >
            <span className="collection-tree__kind">{node.kind === 'collection' ? '📁' : '📄'}</span>
            {node.name}
          </button>
        </div>
        {isExpanded && children.length > 0 && (
          <ul className="collection-tree__children">{children.map((child) => renderNode(child))}</ul>
        )}
        {isExpanded && !isLoading && children.length === 0 && (
          <p className="collection-tree__empty" style={{ paddingLeft: `${24 + depth * 14}px` }}>
            （なし）
          </p>
        )}
      </li>
    )
  }

  const rootNodes: TreeNode[] = rootCollections.map((name) => ({
    kind: 'collection',
    name,
    path: name
  }))

  return (
    <div className="collection-tree">
      <h2 className="collection-tree__title">{title}</h2>
      {error && <p className="collection-tree__error">{error}</p>}
      {rootNodes.length === 0 ? (
        <p className="collection-tree__empty">（コレクションなし）</p>
      ) : (
        <ul className="collection-tree__roots">{rootNodes.map((node) => renderNode(node))}</ul>
      )}
      {contextMenu && (
        <div
          className="collection-tree__context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'document' ? (
            <>
              <div className="collection-tree__context-header">ドキュメント</div>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onDuplicateDocument}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.documentPath
                  setContextMenu(null)
                  onDuplicateDocument?.(path)
                }}
              >
                複製
              </button>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onDeleteDocument}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.documentPath
                  setContextMenu(null)
                  onDeleteDocument?.(path)
                }}
              >
                削除
              </button>
              <div className="collection-tree__context-header">サブコレクション</div>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onCreateSubcollection}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.documentPath
                  setContextMenu(null)
                  onCreateSubcollection?.(path)
                }}
              >
                作成
              </button>
            </>
          ) : (
            <>
              <div className="collection-tree__context-header">
                {collectionKindLabel(contextMenu.collectionPath)}
              </div>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onRenameCollection}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onRenameCollection?.(path)
                }}
              >
                リネーム
              </button>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onDuplicateCollection}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onDuplicateCollection?.(path)
                }}
              >
                複製
              </button>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onDeleteCollection}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onDeleteCollection?.(path)
                }}
              >
                削除
              </button>
              <div className="collection-tree__context-header">フィールド一括</div>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onFieldBulk}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onFieldBulk?.(path, 'create')
                }}
              >
                新規
              </button>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onFieldBulk}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onFieldBulk?.(path, 'rename')
                }}
              >
                リネーム
              </button>
              <button
                type="button"
                className="collection-tree__context-item collection-tree__context-item--indent"
                role="menuitem"
                disabled={!onFieldBulk}
                onClick={(event) => {
                  event.stopPropagation()
                  const path = contextMenu.collectionPath
                  setContextMenu(null)
                  onFieldBulk?.(path, 'delete')
                }}
              >
                削除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default CollectionTree
