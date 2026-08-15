import { describe, expect, it } from 'vitest'
import {
  avgWorkoutsPerWeek,
  bestSet,
  dailySeries,
  isBodyweightExercise,
  setVolume,
  totalVolume,
  weekStreak,
} from './formulas'

/** Formeln nach Spec §6. */

/** Lokale Mitternacht — nie `new Date('...')`, das wäre UTC. */
const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h)

describe('setVolume / totalVolume', () => {
  it('rechnet Wiederholungen × Gewicht', () => {
    expect(setVolume(10, 60)).toBe(600)
    expect(setVolume(8, 62.5)).toBe(500)
  })

  it('summiert und rundet auf ganze Zahlen', () => {
    expect(totalVolume([{ reps: 10, weight: 60 }, { reps: 8, weight: 62.5 }])).toBe(1100)
  })

  it('ergibt 0 bei Körpergewichtsübungen', () => {
    expect(setVolume(12, 0)).toBe(0)
  })
})

describe('weekStreak', () => {
  it('ist 0 ohne Trainings', () => {
    expect(weekStreak([], d(2026, 8, 15))).toBe(0)
  })

  it('zählt aufeinanderfolgende Wochen', () => {
    // Samstag, 15.08.2026. Woche beginnt Montag.
    const now = d(2026, 8, 15)
    const dates = [d(2026, 8, 11), d(2026, 8, 4), d(2026, 7, 28)]
    expect(weekStreak(dates, now)).toBe(3)
  })

  it('beendet den Streak bei einer Lücke', () => {
    const now = d(2026, 8, 15)
    // Diese Woche und letzte Woche, dann eine Lücke.
    const dates = [d(2026, 8, 11), d(2026, 8, 4), d(2026, 7, 14)]
    expect(weekStreak(dates, now)).toBe(2)
  })

  it('lässt die laufende Woche ohne Training den Streak NICHT beenden', () => {
    // Montagmorgen, noch nicht trainiert — die Vorwochen zählen weiter.
    const now = d(2026, 8, 17, 8)
    const dates = [d(2026, 8, 13), d(2026, 8, 6)]
    expect(weekStreak(dates, now)).toBe(2)
  })

  it('zählt mehrere Trainings derselben Woche nur einmal', () => {
    const now = d(2026, 8, 15)
    const dates = [d(2026, 8, 10), d(2026, 8, 12), d(2026, 8, 14)]
    expect(weekStreak(dates, now)).toBe(1)
  })

  it('trägt über den Jahreswechsel', () => {
    // 08.01.2027 ist ein Freitag. Rückwärts über den Jahreswechsel:
    // KW mit 04.01.2027, KW mit 28.12.2026, KW mit 21.12.2026.
    const now = d(2027, 1, 8)
    const dates = [d(2027, 1, 5), d(2026, 12, 29), d(2026, 12, 22)]
    expect(weekStreak(dates, now)).toBe(3)
  })

  it('rechnet in lokaler Zeit — ein Training um 23:30 zählt zu seinem Tag', () => {
    // Sonntag, 23:30 lokal. In UTC wäre das bereits Montag und damit die
    // Folgewoche — der Streak würde auseinanderfallen.
    const now = d(2026, 8, 17, 10) // Montag
    const dates = [d(2026, 8, 16, 23), d(2026, 8, 9, 23)]
    expect(weekStreak(dates, now)).toBe(2)
  })
})

describe('avgWorkoutsPerWeek', () => {
  it('teilt die Trainings der letzten 28 Tage durch 4', () => {
    const now = d(2026, 8, 15)
    const dates = [d(2026, 8, 14), d(2026, 8, 12), d(2026, 8, 10), d(2026, 8, 7)]
    expect(avgWorkoutsPerWeek(dates, now)).toBe(1)
  })

  it('rundet auf eine Nachkommastelle', () => {
    const now = d(2026, 8, 15)
    const dates = [d(2026, 8, 14), d(2026, 8, 13), d(2026, 8, 12), d(2026, 8, 11), d(2026, 8, 10)]
    expect(avgWorkoutsPerWeek(dates, now)).toBe(1.3) // 5/4 = 1.25 -> 1.3
  })

  it('ignoriert alles außerhalb der 28 Tage', () => {
    const now = d(2026, 8, 15)
    expect(avgWorkoutsPerWeek([d(2026, 6, 1)], now)).toBe(0)
  })
})

describe('bestSet', () => {
  it('nimmt den Satz mit dem höchsten Gewicht, nicht den letzten', () => {
    // Klassisches Dropset: der letzte Satz ist der leichteste.
    const sets = [
      { reps: 10, weight: 60 },
      { reps: 8, weight: 70 },
      { reps: 12, weight: 40 },
    ]
    expect(bestSet(sets)).toEqual({ reps: 8, weight: 70 })
  })

  it('entscheidet bei Gleichstand nach den meisten Wiederholungen', () => {
    const sets = [
      { reps: 8, weight: 70 },
      { reps: 10, weight: 70 },
      { reps: 6, weight: 70 },
    ]
    expect(bestSet(sets)).toEqual({ reps: 10, weight: 70 })
  })

  it('gibt null für eine leere Liste zurück', () => {
    expect(bestSet([])).toBeNull()
  })

  it('kommt mit reinen Körpergewichtssätzen zurecht', () => {
    const sets = [
      { reps: 8, weight: 0 },
      { reps: 12, weight: 0 },
    ]
    expect(bestSet(sets)).toEqual({ reps: 12, weight: 0 })
  })
})

describe('isBodyweightExercise / dailySeries', () => {
  it('erkennt Körpergewichtsübungen', () => {
    expect(isBodyweightExercise([{ weight: 0 }, { weight: 0 }])).toBe(true)
    expect(isBodyweightExercise([{ weight: 0 }, { weight: 20 }])).toBe(false)
    expect(isBodyweightExercise([])).toBe(false)
  })

  it('wertet Körpergewichtsübungen nach Wiederholungen aus', () => {
    const sets = [
      { exercise_name: 'Klimmzüge', set_number: 1, reps: 8, weight: 0, day: '2026-08-15' },
      { exercise_name: 'Klimmzüge', set_number: 2, reps: 7, weight: 0, day: '2026-08-15' },
    ]
    const r = dailySeries(sets, 'Klimmzüge')
    expect(r.unit).toBe('reps')
    expect(r.points).toEqual([{ date: '2026-08-15', value: 15 }])
  })

  it('summiert das Tagesvolumen je Übung und sortiert nach Datum', () => {
    const sets = [
      { exercise_name: 'Bank', set_number: 1, reps: 10, weight: 60, day: '2026-08-15' },
      { exercise_name: 'Bank', set_number: 2, reps: 8, weight: 65, day: '2026-08-15' },
      { exercise_name: 'Bank', set_number: 1, reps: 10, weight: 60, day: '2026-08-10' },
      { exercise_name: 'Kniebeuge', set_number: 1, reps: 5, weight: 100, day: '2026-08-15' },
    ]
    const r = dailySeries(sets, 'Bank')
    expect(r.unit).toBe('volume')
    expect(r.points).toEqual([
      { date: '2026-08-10', value: 600 },
      { date: '2026-08-15', value: 1120 },
    ])
  })
})
