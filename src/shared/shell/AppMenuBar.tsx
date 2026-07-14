import { useEffect, useRef, useState } from 'react'
import type { AppMenuEntry, AppMenuSection } from './app_menu'

type AppMenuBarProps = {
  menus: AppMenuSection[]
}

function AppMenuBar({ menus }: AppMenuBarProps): React.JSX.Element {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!openMenuId) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (barRef.current?.contains(event.target as Node)) {
        return
      }

      setOpenMenuId(null)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuId])

  const handleToggleMenu = (menuId: string): void => {
    setOpenMenuId((current) => (current === menuId ? null : menuId))
  }

  const handleItemClick = (entry: AppMenuEntry): void => {
    if (entry.type !== 'item' || entry.disabled) {
      return
    }

    entry.onClick?.()
    setOpenMenuId(null)
  }

  return (
    <nav ref={barRef} className="app-menu-bar" aria-label="Application menu">
      {menus.map((section) => {
        const isOpen = openMenuId === section.id

        return (
          <div key={section.id} className="app-menu-bar__group">
            <button
              type="button"
              className={
                isOpen
                  ? 'app-menu-bar__trigger app-menu-bar__trigger--open'
                  : 'app-menu-bar__trigger'
              }
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => handleToggleMenu(section.id)}
            >
              {section.label}
            </button>
            {isOpen && (
              <div className="app-menu-bar__dropdown" role="menu">
                {section.items.map((entry, index) => {
                  if (entry.type === 'separator') {
                    return <div key={`${section.id}-sep-${index}`} className="app-menu-bar__separator" />
                  }

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="menuitem"
                      className={
                        entry.disabled
                          ? 'app-menu-bar__item app-menu-bar__item--disabled'
                          : 'app-menu-bar__item'
                      }
                      disabled={entry.disabled}
                      onClick={() => handleItemClick(entry)}
                    >
                      <span className="app-menu-bar__label">{entry.label}</span>
                      {entry.shortcut && (
                        <span className="app-menu-bar__shortcut">{entry.shortcut}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export default AppMenuBar
