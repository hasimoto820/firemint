import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildSubcollectionPath,
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
  onRenameFieldBulk?: (collectionPath: string) => void
  canRename?: boolean
  reloadToken?: number
  disabled?: boolean
  title?: string
}

type ContextMenuState = {
  x: number
  y: number
  collectionPath: string
}

function CollectionTree({
  projectId,
  rootCollections,
  activeCollectionPath,
  selectedDocumentPath,
  onSelectCollection,
  onSelectDocument,
  onRenameCollection,
  onRenameFieldBulk,
  canRename = false,
  reloadToken = 0,
  disabled = false,
  title = 'コレクション'
}: CollectionTreeProps): React.JSX.Element {
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
    [loadChildren]
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
      return
    }

    onSelectDocument(node.path)
  }

  const handleCollectionContextMenu = (
    event: React.MouseEvent,
    collectionPath: string
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    if (disabled || !canRename) {
      return
    }

    if (!onRenameCollection && !onRenameFieldBulk) {
      return
    }

    onSelectCollection(collectionPath)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      collectionPath
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
                : undefined
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
          <div className="collection-tree__context-header">リネーム</div>
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
            コレクション
          </button>
          <button
            type="button"
            className="collection-tree__context-item collection-tree__context-item--indent"
            role="menuitem"
            disabled={!onRenameFieldBulk}
            onClick={(event) => {
              event.stopPropagation()
              const path = contextMenu.collectionPath
              setContextMenu(null)
              onRenameFieldBulk?.(path)
            }}
          >
            フィールド一括
          </button>
        </div>
      )}
    </div>
  )
}

export default CollectionTree
