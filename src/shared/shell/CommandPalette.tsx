import { useEffect, useMemo, useRef, useState } from 'react'

export type CommandPaletteItem = {
  id: string
  label: string
  detail?: string
  group?: string
  run: () => void
}

type CommandPaletteProps = {
  open: boolean
  items: CommandPaletteItem[]
  onClose: () => void
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

function CommandPalette({ open, items, onClose }: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) {
      return items
    }

    return items.filter((item) => {
      const haystack = normalize(`${item.label} ${item.detail ?? ''} ${item.group ?? ''}`)
      return haystack.includes(q)
    })
  }, [items, query])

  useEffect(() => {
    if (!open) {
      return
    }

    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setIndex((current) => Math.max(current - 1, 0))
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const item = filtered[index]
        if (item) {
          item.run()
          onClose()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, filtered, index, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command Palette">
      <button type="button" className="command-palette__backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="command-palette__panel">
        <input
          ref={inputRef}
          className="command-palette__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="コレクションや操作を検索…"
          aria-label="コマンド検索"
        />
        <ul className="command-palette__list">
          {filtered.length === 0 && (
            <li className="command-palette__empty">一致するコマンドがありません</li>
          )}
          {filtered.map((item, itemIndex) => (
            <li key={item.id}>
              <button
                type="button"
                className={
                  itemIndex === index
                    ? 'command-palette__item command-palette__item--active'
                    : 'command-palette__item'
                }
                onMouseEnter={() => setIndex(itemIndex)}
                onClick={() => {
                  item.run()
                  onClose()
                }}
              >
                <span className="command-palette__label">
                  {item.group && <span className="command-palette__group">{item.group}</span>}
                  {item.label}
                </span>
                {item.detail && <span className="command-palette__detail">{item.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default CommandPalette
