import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { useExerciseNames } from '@/hooks/useExerciseNames'

/**
 * Eingabefeld fuer Uebungsnamen mit Vorschlaegen aus der Historie (Spec §3.9).
 *
 * Bewusst als eigene Liste statt `<datalist>`: deren Darstellung ist je nach
 * Browser voellig verschieden, auf dem Handy teils gar nicht vorhanden — und
 * genau dort wird die App benutzt.
 *
 * Barrierefreiheit nach dem Combobox-Muster: Pfeiltasten waehlen, Enter
 * uebernimmt, Escape schliesst.
 */
export function ExerciseNameInput({
  value,
  onChange,
  onEnter,
  placeholder = 'z. B. Bankdrücken',
  invalid,
  id: idProp,
  className,
  autoFocus,
  'aria-describedby': describedBy,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter ohne offene Vorschlagsliste. */
  onEnter?: () => void
  placeholder?: string
  invalid?: boolean
  id?: string
  className?: string
  autoFocus?: boolean
  'aria-describedby'?: string
}) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const listId = `${id}-list`

  const allNames = useExerciseNames()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<number | null>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return allNames
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, 6)
  }, [allNames, value])

  const showList = open && matches.length > 0

  const choose = (name: string) => {
    onChange(name)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault()
        onEnter()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0) choose(matches[active])
      else {
        setOpen(false)
        onEnter?.()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Kurz warten, damit ein Klick auf einen Vorschlag noch ankommt.
          blurTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'h-12 w-full rounded-[var(--radius-md)] border bg-surface-2 px-3.5 text-base text-fg',
          'placeholder:text-subtle outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)]',
          'focus:border-[var(--accent)] focus:bg-surface',
          'focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]',
          invalid ? 'border-[var(--danger)]' : 'border-line'
        )}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="animate-fade-in absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-[var(--shadow-lg)]"
        >
          {matches.map((name, i) => (
            <li key={name} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) window.clearTimeout(blurTimer.current)
                  choose(name)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center px-3.5 py-2.5 text-left text-[15px] transition-colors',
                  i === active ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'
                )}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
