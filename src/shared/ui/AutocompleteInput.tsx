import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type { AutocompleteItem } from '@features/autocomplete/shared/types'

type AutocompleteInputProps = {
  value: string
  items: AutocompleteItem[]
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  multiline?: boolean
  /** true: カーソル位置の単語だけを差し替える（Query 等） */
  wordCompletion?: boolean
  className?: string
  fieldClassName?: string
  'aria-label'?: string
  onChange: (value: string) => void
  onMetaEnter?: () => void
}

const LIST_MAX_HEIGHT = 200
const LIST_MAX_WIDTH = 260
const LIST_GAP = 4

function getWordRange(
  text: string,
  caret: number
): { start: number; end: number; word: string } {
  // `.` はメソッド連鎖用なので単語に含めない（`.na` → `na`）。`/` は path 用。
  const wordChar = /[A-Za-z0-9_/-]/
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  let start = safeCaret
  let end = safeCaret

  while (start > 0 && wordChar.test(text[start - 1] ?? '')) {
    start -= 1
  }

  while (end < text.length && wordChar.test(text[end] ?? '')) {
    end += 1
  }

  return {
    start,
    end,
    word: text.slice(start, end)
  }
}

function AutocompleteInput({
  value,
  items,
  disabled = false,
  autoFocus = false,
  placeholder,
  multiline = false,
  wordCompletion = false,
  className,
  fieldClassName,
  'aria-label': ariaLabel,
  onChange,
  onMetaEnter
}: AutocompleteInputProps): React.JSX.Element {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [caret, setCaret] = useState(value.length)
  const [listStyle, setListStyle] = useState<CSSProperties | undefined>(undefined)
  const ignoreOpenRef = useRef(false)

  const closeList = (): void => {
    ignoreOpenRef.current = true
    setOpen(false)
    window.setTimeout(() => {
      ignoreOpenRef.current = false
    }, 0)
  }

  const requestOpen = (): void => {
    if (!ignoreOpenRef.current) {
      setOpen(true)
    }
  }

  const currentWord = useMemo(() => {
    if (!wordCompletion) {
      return value
    }

    return getWordRange(value, caret).word
  }, [caret, value, wordCompletion])

  const filteredItems = useMemo(() => {
    const needle = currentWord.trim().toLowerCase()

    if (!needle) {
      return wordCompletion ? [] : items
    }

    return items.filter((item) => {
      const lower = item.value.toLowerCase()

      if (lower.startsWith(needle)) {
        return true
      }

      // path のセグメント先頭一致のみ（途中の文字 includes はしない）
      if (!lower.includes('/')) {
        return false
      }

      return lower.split('/').some((segment) => segment.startsWith(needle))
    })
  }, [currentWord, items, wordCompletion])

  const listVisible = open && filteredItems.length > 0

  useEffect(() => {
    setActiveIndex(0)
  }, [currentWord, filteredItems.length])

  useLayoutEffect(() => {
    if (!listVisible) {
      setListStyle(undefined)
      return
    }

    const updatePosition = (): void => {
      const rect = containerRef.current?.getBoundingClientRect()

      if (!rect) {
        return
      }

      const spaceBelow = window.innerHeight - rect.bottom - LIST_GAP
      const spaceAbove = rect.top - LIST_GAP
      const placeBelow =
        spaceBelow >= Math.min(LIST_MAX_HEIGHT, 120) || spaceBelow >= spaceAbove
      const maxHeight = Math.max(
        72,
        Math.min(LIST_MAX_HEIGHT, placeBelow ? spaceBelow : spaceAbove)
      )

      if (placeBelow) {
        setListStyle({
          top: rect.bottom + LIST_GAP,
          bottom: 'auto',
          left: rect.left,
          maxWidth: Math.min(LIST_MAX_WIDTH, rect.width),
          maxHeight
        })
      } else {
        setListStyle({
          top: 'auto',
          bottom: window.innerHeight - rect.top + LIST_GAP,
          left: rect.left,
          maxWidth: Math.min(LIST_MAX_WIDTH, rect.width),
          maxHeight
        })
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [listVisible, value, filteredItems.length])

  useEffect(() => {
    if (!open) {
      return
    }

    const close = (event: MouseEvent): void => {
      const target = event.target as Node

      if (
        containerRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return
      }

      setOpen(false)
    }

    window.addEventListener('mousedown', close)

    return () => {
      window.removeEventListener('mousedown', close)
    }
  }, [open])

  const focusField = (nextCaret: number): void => {
    requestAnimationFrame(() => {
      const element = multiline ? textareaRef.current : inputRef.current

      if (!element) {
        return
      }

      element.focus()
      element.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const applyItem = (item: AutocompleteItem): void => {
    const element = multiline ? textareaRef.current : inputRef.current

    if (wordCompletion && element) {
      const range = getWordRange(value, caret)
      element.focus()
      element.setSelectionRange(range.start, range.end)

      // React の value 丸ごと差し替えだと Undo 履歴が消える。
      // insertText ならブラウザの Ctrl+Z が効く。
      const inserted =
        typeof document.execCommand === 'function' &&
        document.execCommand('insertText', false, item.value)

      if (inserted) {
        setCaret(range.start + item.value.length)
        closeList()
        return
      }

      const next = `${value.slice(0, range.start)}${item.value}${value.slice(range.end)}`
      const nextCaret = range.start + item.value.length
      onChange(next)
      setCaret(nextCaret)
      focusField(nextCaret)
      closeList()
      return
    }

    if (element && !wordCompletion) {
      element.focus()
      element.setSelectionRange(0, element.value.length)
      const inserted =
        typeof document.execCommand === 'function' &&
        document.execCommand('insertText', false, item.value)

      if (inserted) {
        closeList()
        return
      }
    }

    onChange(item.value)
    closeList()
  }

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (onMetaEnter) {
        event.preventDefault()
        onMetaEnter()
      }
      return
    }

    // Ctrl+Z 等はブラウザに任せ、候補操作と干渉させない
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    if (!open || filteredItems.length === 0) {
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        setOpen(true)
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % filteredItems.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + filteredItems.length) % filteredItems.length)
      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const active = filteredItems[activeIndex]

      if (active) {
        event.preventDefault()
        applyItem(active)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const syncCaret = (element: HTMLInputElement | HTMLTextAreaElement): void => {
    setCaret(element.selectionStart ?? element.value.length)
  }

  const fieldClass = ['autocomplete-input__field', fieldClassName].filter(Boolean).join(' ')

  return (
    <div
      className={['autocomplete-input', className].filter(Boolean).join(' ')}
      ref={containerRef}
    >
      {multiline ? (
        <textarea
          ref={textareaRef}
          className={`${fieldClass} autocomplete-input__field--multiline`}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={listVisible}
          onFocus={requestOpen}
          onClick={(event) => {
            syncCaret(event.currentTarget)
            requestOpen()
          }}
          onKeyUp={(event) => syncCaret(event.currentTarget)}
          onSelect={(event) => syncCaret(event.currentTarget)}
          onChange={(event) => {
            onChange(event.target.value)
            syncCaret(event.target)
            requestOpen()
          }}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <input
          ref={inputRef}
          className={fieldClass}
          type="text"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={listVisible}
          onFocus={requestOpen}
          onClick={(event) => {
            syncCaret(event.currentTarget)
            requestOpen()
          }}
          onKeyUp={(event) => syncCaret(event.currentTarget)}
          onSelect={(event) => syncCaret(event.currentTarget)}
          onChange={(event) => {
            onChange(event.target.value)
            syncCaret(event.target)
            requestOpen()
          }}
          onKeyDown={handleKeyDown}
        />
      )}
      {listVisible && (
        <ul
          className="autocomplete-input__list"
          id={listId}
          role="listbox"
          ref={listRef}
          style={listStyle}
        >
          {filteredItems.map((item, index) => (
            <li key={`${item.kind}:${item.value}`}>
              <button
                type="button"
                className={
                  index === activeIndex
                    ? 'autocomplete-input__option autocomplete-input__option--active'
                    : 'autocomplete-input__option'
                }
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  applyItem(item)
                }}
              >
                {item.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AutocompleteInput
