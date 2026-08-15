import { describe, expect, it } from 'vitest'
import { parsePlan, toNum } from './parsePlan'

/**
 * Testsatz nach Spec §6.
 *
 * Der Parser ist das Herzstück des Import-Screens und dort der einzige Ort mit
 * echter Interpretationslogik — jede Zeile hier entspricht einem in der Spec
 * ausdrücklich geforderten Fall.
 */

const first = (text: string) => parsePlan(text).exercises[0]

describe('toNum', () => {
  it('akzeptiert deutsches Dezimalkomma', () => {
    expect(toNum('62,5')).toBe(62.5)
    expect(toNum('62.5')).toBe(62.5)
    expect(toNum(60)).toBe(60)
  })

  it('gibt null für Unbrauchbares zurück', () => {
    expect(toNum('abc')).toBeNull()
    expect(toNum(null)).toBeNull()
    expect(toNum(Infinity)).toBeNull()
  })
})

describe('parsePlan — leerer Text', () => {
  it('ergibt 0 Übungen und KEINE Fehlermeldung', () => {
    expect(parsePlan('')).toEqual({ exercises: [], error: null })
    expect(parsePlan('   \n  \n ')).toEqual({ exercises: [], error: null })
  })
})

describe('parsePlan — Modus A: JSON', () => {
  it('liest ein reines Array', () => {
    const r = parsePlan('[{"exercise_name":"Bankdrücken","target_sets":4,"target_reps":8,"target_weight":60}]')
    expect(r.error).toBeNull()
    expect(r.exercises).toEqual([
      { exercise_name: 'Bankdrücken', target_sets: 4, target_reps: 8, target_weight: 60 },
    ])
  })

  it('liest das Exportformat mit exercises-Schlüssel', () => {
    const r = parsePlan('{"name":"Push","exercises":[{"name":"Dips","sets":3,"reps":12}]}')
    expect(r.error).toBeNull()
    expect(r.exercises).toHaveLength(1)
    expect(r.exercises[0].exercise_name).toBe('Dips')
    expect(r.exercises[0].target_weight).toBe(0)
  })

  it('liest ein einzelnes Objekt', () => {
    const r = parsePlan('{"exercise_name":"Plank"}')
    expect(r.exercises).toEqual([
      { exercise_name: 'Plank', target_sets: 3, target_reps: 10, target_weight: 0 },
    ])
  })

  it('meldet kaputtes JSON', () => {
    const r = parsePlan('[{"exercise_name":')
    expect(r.exercises).toHaveLength(0)
    expect(r.error).toBe('Ungültiges JSON.')
  })

  it('meldet ein JSON ohne brauchbaren Eintrag', () => {
    expect(parsePlan('[]').error).toBe('Kein gültiger Eintrag im JSON gefunden.')
    expect(parsePlan('[{"foo":1}]').error).toBe('Kein gültiger Eintrag im JSON gefunden.')
  })

  it('versteht die deutschen Feldnamen-Aliase', () => {
    const r = parsePlan('[{"uebung":"Kniebeuge","sätze":5,"wiederholungen":5,"gewicht":"100,5"}]')
    expect(r.exercises[0]).toEqual({
      exercise_name: 'Kniebeuge',
      target_sets: 5,
      target_reps: 5,
      target_weight: 100.5,
    })
  })

  it('überspringt Nicht-Objekte und Einträge ohne Namen', () => {
    const r = parsePlan('["x", null, {"name":""}, {"name":"Rudern"}]')
    expect(r.exercises).toHaveLength(1)
    expect(r.exercises[0].exercise_name).toBe('Rudern')
  })
})

describe('parsePlan — Modus B: CSV / TSV', () => {
  it('liest CSV mit Semikolon', () => {
    const r = parsePlan('Bankdrücken;4;8;60')
    expect(r.exercises[0]).toEqual({
      exercise_name: 'Bankdrücken',
      target_sets: 4,
      target_reps: 8,
      target_weight: 60,
    })
  })

  it('liest CSV mit Komma', () => {
    expect(first('Kniebeuge,5,5,100')).toEqual({
      exercise_name: 'Kniebeuge',
      target_sets: 5,
      target_reps: 5,
      target_weight: 100,
    })
  })

  it('liest TSV', () => {
    expect(first('Rudern\t3\t12\t50').exercise_name).toBe('Rudern')
    expect(first('Rudern\t3\t12\t50').target_weight).toBe(50)
  })

  it('behält das Dezimalkomma bei Semikolon-Trennung', () => {
    // Würde an allen Trennzeichen gleichzeitig getrennt, zerfiele "62,5"
    // in zwei Felder und das Gewicht ginge verloren.
    expect(first('Bankdrücken;3;10;62,5').target_weight).toBe(62.5)
  })

  it('füllt fehlende Felder mit Standardwerten', () => {
    expect(first('Klimmzüge;3')).toEqual({
      exercise_name: 'Klimmzüge',
      target_sets: 3,
      target_reps: 10,
      target_weight: 0,
    })
  })
})

describe('parsePlan — Kopfzeilen', () => {
  it('überspringt eine Kopfzeile', () => {
    const r = parsePlan('Übung;Sätze;Wdh;Gewicht\nBankdrücken;4;8;60')
    expect(r.exercises).toHaveLength(1)
    expect(r.exercises[0].exercise_name).toBe('Bankdrücken')
  })

  it('überspringt sie NICHT, wenn sie Zahlen enthält', () => {
    // "Name;3;10" ist eine Datenzeile, keine Kopfzeile.
    const r = parsePlan('Name;3;10\nKniebeuge;4;8')
    expect(r.exercises).toHaveLength(2)
    expect(r.exercises[0].exercise_name).toBe('Name')
  })

  it('überspringt sie nur in der ersten Zeile', () => {
    const r = parsePlan('Bankdrücken;4;8\nÜbung;Sätze;Wdh')
    expect(r.exercises).toHaveLength(2)
  })

  it('überspringt sie nicht ohne Mengen-Stichwort', () => {
    // "Name;Kategorie" enthält kein Satz-/Wdh.-/Gewicht-Stichwort und gilt
    // deshalb nicht als Kopfzeile. Da das zweite Feld keine Zahl ist, greift
    // auch der CSV-Zweig nicht — die Zeile landet als Freitext im Namen.
    const r = parsePlan('Name;Kategorie\nBankdrücken;4;8')
    expect(r.exercises).toHaveLength(2)
    expect(r.exercises[0].exercise_name).toBe('Name;Kategorie')
    expect(r.exercises[1].exercise_name).toBe('Bankdrücken')
  })
})

describe('parsePlan — Aufzählungszeichen', () => {
  it('entfernt -, *, • sowie 1. und 1)', () => {
    const r = parsePlan(['- Bankdrücken 3x10', '* Kniebeuge 4x8', '• Dips 3x12', '1. Rudern 3x10', '2) Curls 3x15'].join('\n'))
    expect(r.exercises.map((e) => e.exercise_name)).toEqual([
      'Bankdrücken',
      'Kniebeuge',
      'Dips',
      'Rudern',
      'Curls',
    ])
  })

  it('verwirft eine Zeile, die nur aus einem Aufzählungszeichen besteht', () => {
    const r = parsePlan('-\nBankdrücken 3x10')
    expect(r.exercises).toHaveLength(1)
    expect(r.exercises[0].exercise_name).toBe('Bankdrücken')
  })
})

describe('parsePlan — Freitext', () => {
  it('erkennt "Name SxR @kg"', () => {
    expect(first('Bankdrücken Langhantel 3x10 @60')).toEqual({
      exercise_name: 'Bankdrücken Langhantel',
      target_sets: 3,
      target_reps: 10,
      target_weight: 60,
    })
  })

  it('erkennt "3 × 10" und "60 kg"', () => {
    expect(first('Bankdrücken 3 × 10 60 kg')).toEqual({
      exercise_name: 'Bankdrücken',
      target_sets: 3,
      target_reps: 10,
      target_weight: 60,
    })
  })

  it('erkennt den Stern als Multiplikationszeichen', () => {
    expect(first('Dips 4*12').target_sets).toBe(4)
    expect(first('Dips 4*12').target_reps).toBe(12)
  })

  it('erkennt das Dezimalkomma im Gewicht', () => {
    expect(first('Bankdrücken 3x10 @62,5').target_weight).toBe(62.5)
    expect(first('Bankdrücken 3x10 62,5 kg').target_weight).toBe(62.5)
  })

  it('greift bei einer Zeile nur mit Namen auf die Standardwerte zurück', () => {
    expect(first('Plank')).toEqual({
      exercise_name: 'Plank',
      target_sets: 3,
      target_reps: 10,
      target_weight: 0,
    })
  })

  it('entfernt abschließende Trennzeichen aus dem Namen', () => {
    expect(first('Rudern Kabel – 3x12 @50').exercise_name).toBe('Rudern Kabel')
    expect(first('Rudern Kabel — 3x12 @50').exercise_name).toBe('Rudern Kabel')
    expect(first('Rudern Kabel - 3x12').exercise_name).toBe('Rudern Kabel')
  })

  it('verarbeitet das Beispiel aus der Spec vollständig', () => {
    const r = parsePlan(
      ['Bankdrücken Langhantel 3x10 @60', 'Kniebeuge 4x8 @80', 'Klimmzüge 3x8', 'Rudern Kabel 3x12 @50', 'Plank'].join('\n')
    )
    expect(r.error).toBeNull()
    expect(r.exercises).toHaveLength(5)
    expect(r.exercises[2]).toEqual({
      exercise_name: 'Klimmzüge',
      target_sets: 3,
      target_reps: 8,
      target_weight: 0,
    })
    expect(r.exercises[4].exercise_name).toBe('Plank')
  })

  it('meldet, wenn nichts erkannt wurde', () => {
    const r = parsePlan('---\n–\n- \n@@@')
    expect(r.exercises).toHaveLength(0)
    expect(r.error).toBe('Keine Übungen erkannt. Prüfe das Format.')
  })
})

describe('parsePlan — Normalisierung', () => {
  it('gibt nie Werte zurück, die die CHECK-Constraints verletzen', () => {
    // target_sets > 0, target_reps > 0, target_weight >= 0
    const r = parsePlan('[{"name":"X","sets":0,"reps":-3,"weight":-10}]')
    expect(r.exercises[0].target_sets).toBeGreaterThan(0)
    expect(r.exercises[0].target_reps).toBeGreaterThan(0)
    expect(r.exercises[0].target_weight).toBeGreaterThanOrEqual(0)
  })
})
