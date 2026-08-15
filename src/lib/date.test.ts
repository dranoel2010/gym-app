import { describe, expect, it } from 'vitest'
import { localDateStr, parseLocalDate, startOfWeek, weekKey, daysBetween } from './date'

/**
 * Datum nach Spec §6.
 *
 * Diese Tests laufen mit TZ=Europe/Berlin (siehe vite.config.ts), also
 * ausdrücklich NICHT in UTC — genau darin lag der Fehler in v1.
 */

describe('localDateStr', () => {
  it('bleibt um 23:59 beim selben Tag', () => {
    // Mit toISOString() wäre das in Berlin bereits der Folgetag.
    expect(localDateStr(new Date(2026, 7, 15, 23, 59))).toBe('2026-08-15')
  })

  it('bleibt um 00:01 beim selben Tag', () => {
    // Mit toISOString() wäre das in Berlin noch der Vortag.
    expect(localDateStr(new Date(2026, 7, 15, 0, 1))).toBe('2026-08-15')
  })

  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(localDateStr(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('weicht dort von der UTC-Variante ab, wo v1 falsch lag', () => {
    // Berlin liegt östlich von UTC. Kurz nach Mitternacht zeigt toISOString()
    // deshalb noch den VORTAG — genau daran scheiterte in v1 der
    // Backup-Dateiname und jede Tageszuordnung.
    const kurzNachMitternacht = new Date(2026, 7, 15, 0, 30)
    expect(localDateStr(kurzNachMitternacht)).toBe('2026-08-15')
    expect(kurzNachMitternacht.toISOString().slice(0, 10)).toBe('2026-08-14')

    // Und spätabends stimmen beide überein — der Fehler war also nicht
    // durchgängig sichtbar, sondern nur zu bestimmten Uhrzeiten. Das ist der
    // Grund, warum er so lange unbemerkt blieb.
    const spaetAbends = new Date(2026, 7, 15, 23, 30)
    expect(localDateStr(spaetAbends)).toBe('2026-08-15')
    expect(spaetAbends.toISOString().slice(0, 10)).toBe('2026-08-15')
  })
})

describe('parseLocalDate', () => {
  it('liefert lokale Mitternacht, nicht UTC-Mitternacht', () => {
    const d = parseLocalDate('2026-08-15')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
  })

  it('ist die Umkehrung von localDateStr', () => {
    expect(localDateStr(parseLocalDate('2026-01-01'))).toBe('2026-01-01')
    expect(localDateStr(parseLocalDate('2026-12-31'))).toBe('2026-12-31')
  })
})

describe('startOfWeek / weekKey', () => {
  it('setzt den Wochenbeginn auf Montag', () => {
    // 15.08.2026 ist ein Samstag -> Montag ist der 10.08.
    expect(weekKey(new Date(2026, 7, 15, 12))).toBe('2026-08-10')
  })

  it('behandelt Sonntag als letzten Tag der Woche', () => {
    // 16.08.2026 ist ein Sonntag -> gehört noch zur Woche ab 10.08.
    expect(weekKey(new Date(2026, 7, 16, 23, 30))).toBe('2026-08-10')
    // Montag, 17.08. beginnt die neue Woche.
    expect(weekKey(new Date(2026, 7, 17, 0, 30))).toBe('2026-08-17')
  })

  it('normalisiert auf Mitternacht', () => {
    const s = startOfWeek(new Date(2026, 7, 15, 18, 45))
    expect(s.getHours()).toBe(0)
    expect(s.getMinutes()).toBe(0)
  })

  it('trägt über den Jahreswechsel', () => {
    // 01.01.2027 ist ein Freitag -> Montag ist der 28.12.2026.
    expect(weekKey(new Date(2027, 0, 1, 12))).toBe('2026-12-28')
  })
})

describe('daysBetween', () => {
  it('zählt ganze Kalendertage', () => {
    expect(daysBetween(new Date(2026, 7, 15, 23), new Date(2026, 7, 16, 1))).toBe(1)
    expect(daysBetween(new Date(2026, 7, 15, 1), new Date(2026, 7, 15, 23))).toBe(0)
  })

  it('übersteht die Sommerzeitumstellung', () => {
    // In Deutschland endet die Sommerzeit am 25.10.2026 — der Tag hat 25 Stunden.
    expect(daysBetween(new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 12))).toBe(2)
  })
})
