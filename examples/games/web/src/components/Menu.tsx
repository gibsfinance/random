import { useEffect, useRef, useState } from 'react'

/**
 * The house menu — a div-reveal replacement for native <select> (the venue doesn't do
 * native selects). Trigger button + positioned options panel, click-outside and Escape
 * close, arrow keys move, Enter/Space picks. Same onChange shape as the selects it replaced.
 */
export const Menu = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: number
  onChange: (index: number) => void
}) => {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(value)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const pick = (index: number) => {
    onChange(index)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setHighlight(value)
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(highlight)
    }
  }

  return (
    <span className="menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setHighlight(value)
          setOpen((o) => !o)
        }}
      >
        <span>{options[value]}</span>
        <span className="menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <span className="menu-panel" role="listbox" aria-label={label}>
          {options.map((option, i) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={i === value}
              className={`menu-option${i === value ? ' selected' : ''}${i === highlight ? ' highlight' : ''}`}
              onPointerEnter={() => setHighlight(i)}
              onClick={() => pick(i)}
            >
              {option}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
