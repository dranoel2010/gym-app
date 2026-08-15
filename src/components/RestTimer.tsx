import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { RoundButton } from './ui/Button'
import { IconPlay, IconTimer, IconX } from './ui/Icons'

/**
 * Pausen-Timer zwischen den Saetzen.
 *
 * Nicht Teil der Funktions-Spec (dort unter "bewusst nicht geaendert"), auf
 * ausdrueckliche Anforderung ergaenzt und im Design als eigene Karte angelegt.
 *
 * Zwei Dinge sind hier wichtiger als die Optik:
 *
 * 1. Der Timer laeuft ueber einen Zeitstempel, nicht ueber einen Zaehler.
 *    Sperrt sich das Handy in der Hosentasche, drosselt der Browser
 *    `setInterval` — ein hochgezaehlter Wert waere danach zu niedrig. So ist
 *    die Restzeit immer die tatsaechlich verstrichene.
 * 2. Beim Ablauf vibriert das Geraet. Im Studio ist Ton keine Option, und aufs
 *    Display schaut man zwischen den Saetzen nicht dauernd.
 */

const PRESETS = [60, 90, 120, 180]
const STORAGE_KEY = 'gt.restDuration'

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function readDefaultDuration(): number {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY))
    if (PRESETS.includes(raw)) return raw
  } catch {
    /* privater Modus */
  }
  return 90
}

export interface RestTimerHandle {
  start: () => void
}

export function RestTimer({
  /** Zaehlt hoch, wenn ein Satz gespeichert wurde — startet den Timer neu. */
  restartSignal,
  className,
}: {
  restartSignal: number
  className?: string
}) {
  const [duration, setDuration] = useState(readDefaultDuration)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const firedRef = useRef(false)
  const firstRender = useRef(true)

  const start = useCallback(
    (seconds: number) => {
      firedRef.current = false
      setEndsAt(Date.now() + seconds * 1000)
      setRemaining(seconds)
    },
    []
  )

  // Nach jedem gespeicherten Satz automatisch loslaufen.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    start(duration)
  }, [restartSignal, duration, start])

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const left = Math.round((endsAt - Date.now()) / 1000)
      setRemaining(left)
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        if ('vibrate' in navigator) navigator.vibrate?.([120, 80, 120])
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [endsAt])

  const running = endsAt !== null && remaining > 0
  const done = endsAt !== null && remaining <= 0

  const adjust = (delta: number) => {
    if (endsAt === null) return
    const next = Math.max(0, remaining + delta)
    firedRef.current = false
    setEndsAt(Date.now() + next * 1000)
    setRemaining(next)
  }

  const pickPreset = (seconds: number) => {
    setDuration(seconds)
    try {
      localStorage.setItem(STORAGE_KEY, String(seconds))
    } catch {
      /* privater Modus */
    }
    start(seconds)
  }

  return (
    <div
      className={cn(
        'rounded-[20px] border p-4 transition-colors duration-[var(--dur)]',
        done
          ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_16%,var(--ink-2))]'
          : 'border-transparent bg-[var(--ink-2)]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-on-ink-muted">
            <IconTimer className="text-[13px]" />
            {done ? 'Pause vorbei' : running ? 'Pause' : 'Pause bereit'}
          </div>
          <div
            className={cn(
              'font-display tnum mt-1 text-[26px] leading-none',
              done ? 'text-accent' : 'text-on-ink'
            )}
            aria-live="off"
          >
            {mmss(endsAt === null ? duration : remaining)}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {endsAt === null ? (
            <RoundButton label="Pause starten" onClick={() => start(duration)}>
              <IconPlay className="text-[13px]" />
            </RoundButton>
          ) : (
            <>
              <RoundButton label="15 Sekunden abziehen" onClick={() => adjust(-15)}>
                −15
              </RoundButton>
              <RoundButton label="15 Sekunden zugeben" onClick={() => adjust(15)}>
                +15
              </RoundButton>
              <RoundButton
                label="Pause beenden"
                onClick={() => {
                  setEndsAt(null)
                  setRemaining(0)
                }}
              >
                <IconX className="text-[14px]" />
              </RoundButton>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pickPreset(p)}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-extrabold transition-colors',
              duration === p
                ? 'bg-accent text-accent-ink'
                : 'bg-[var(--ink-3)] text-on-ink-muted hover:text-on-ink'
            )}
          >
            {p < 60 ? `${p}s` : `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')}`}
          </button>
        ))}
      </div>
    </div>
  )
}
