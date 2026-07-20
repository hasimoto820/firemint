import { useEffect, useMemo, useRef, useState } from 'react'

type FieldNameSuggestInputProps = {
  value: string
  candidates: string[]
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  onChange: (value: string) => void
}

function FieldNameSuggestInput({
  value,
  candidates,
  disabled = false,
  autoFocus = false,
  placeholder,
  onChange
}: FieldNameSuggestInputProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredCandidates = useMemo(() => {
    const query = value.trim().toLowerCase()

    if (!query) {
      return candidates
    }

    return candidates.filter((candidate) => candidate.toLowerCase().includes(query))
  }, [candidates, value])

  useEffect(() => {
    if (!open) {
      return
    }

    const close = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', close)

    return () => {
      window.removeEventListener('mousedown', close)
    }
  }, [open])

  return (
    <div className="field-suggest" ref={containerRef}>
      <input
        className="bulk-actions__input field-suggest__input"
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
      />
      {open && filteredCandidates.length > 0 && (
        <ul className="field-suggest__list" role="listbox">
          {filteredCandidates.map((field) => (
            <li key={field}>
              <button
                type="button"
                className="field-suggest__option"
                role="option"
                aria-selected={field === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(field)
                  setOpen(false)
                }}
              >
                {field}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FieldNameSuggestInput
