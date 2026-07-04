import Button from '@shared/ui/Button'

type CollectionSidebarProps = {
  rootCollections: string[]
  activeCollectionPath: string | null
  subcollections: string[]
  selectedDocumentPath: string | null
  onSelectCollection: (collectionPath: string) => void
  onSelectSubcollection: (collectionPath: string) => void
}

function CollectionSidebar({
  rootCollections,
  activeCollectionPath,
  subcollections,
  selectedDocumentPath,
  onSelectCollection,
  onSelectSubcollection
}: CollectionSidebarProps): React.JSX.Element {
  return (
    <div className="collection-sidebar">
      <h2 className="collection-sidebar__title">コレクション</h2>
      <ul className="collection-sidebar__list">
        {rootCollections.map((name) => (
          <li key={name}>
            <Button
              variant={activeCollectionPath === name ? 'primary' : 'default'}
              onClick={() => onSelectCollection(name)}
            >
              {name}
            </Button>
          </li>
        ))}
      </ul>

      {selectedDocumentPath && (
        <div className="collection-sidebar__sub">
          <h3 className="collection-sidebar__subtitle">サブコレクション</h3>
          <p className="collection-sidebar__doc">{selectedDocumentPath}</p>
          {subcollections.length > 0 ? (
            <ul className="collection-sidebar__list">
              {subcollections.map((name) => {
                const path = `${selectedDocumentPath}/${name}`
                return (
                  <li key={path}>
                    <Button
                      variant={activeCollectionPath === path ? 'primary' : 'default'}
                      onClick={() => onSelectSubcollection(path)}
                    >
                      {name}
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="collection-sidebar__empty">（なし）</p>
          )}
        </div>
      )}
    </div>
  )
}

export default CollectionSidebar
