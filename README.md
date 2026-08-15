# Gym Tracker v2

Persönlicher Krafttrainings-Tracker als PWA. Neubau nach [`FUNKTIONS-SPEC.md`](FUNKTIONS-SPEC.md),
gestaltet nach dem Claude-Design-Projekt **„Volt—Training"**.

React 19 · TypeScript · Vite · Tailwind v4 · Supabase · react-hook-form + zod · recharts · sonner

---

## Schnellstart

```bash
npm install
cp .env.example .env.local     # Supabase-Zugangsdaten eintragen
npm run dev
```

Fehlt eine der beiden Umgebungsvariablen, bricht der App-Start bewusst mit einer klaren
Meldung ab, statt später mit unverständlichen Netzwerkfehlern zu scheitern.

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver auf http://localhost:5173 |
| `npm run build` | Typecheck + Produktionsbuild nach `dist/` |
| `npm run typecheck` | Nur Typprüfung |
| `npm test` | Unit-Tests (Parser, Formeln, Datum) |

---

## Supabase einrichten

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. **SQL Editor** öffnen, den vollständigen Inhalt von [`supabase/setup.sql`](supabase/setup.sql)
   einfügen und ausführen. Die Datei ist idempotent — mehrfaches Ausführen ist unschädlich.
   Sie legt an: sieben Tabellen, alle `CHECK`-Constraints, Indizes, RLS-Policies,
   vier Postgres-Funktionen und den Storage-Bucket `progress-photos` samt Policies.
   Danach [`supabase/verify.sql`](supabase/verify.sql) ausführen — das Skript liest nur und
   gibt je Prüfung eine Zeile aus. Alles muss auf `OK` stehen.
3. **Project Settings → API**: `Project URL` und `anon public` Key nach `.env.local` kopieren.
4. **Authentication → Providers → Email**: „Confirm email" **aktiviert** lassen
   (so entschieden, siehe *Offene Punkte* unten).
5. **Authentication → URL Configuration**: Site-URL und Redirect-URLs auf die Deployment-Domain
   setzen, damit die Links aus den Bestätigungs- und Reset-Mails funktionieren.

> Es gibt genau **eine** Schemadatei und keine nummerierten Einzelmigrationen. In v1 liefen
> `001_init.sql` und `setup.sql` auseinander — die Existenz von `fix-policies.sql` belegt, dass
> das in der Praxis zugeschlagen hat.

### Deployment (Vercel)

Framework-Preset **Vite**, Build `npm run build`, Output `dist`. Der SPA-Fallback steht in
[`vercel.json`](vercel.json) — ohne ihn liefert ein direkter Aufruf von `/stats` einen 404.

Die Konfiguration für Produktions-Builds liegt in [`.env.production`](.env.production) **im Repo**.
Das ist Absicht und kein Sicherheitsverlust: Der Publishable Key landet zwangsläufig im
ausgelieferten JavaScript — jeder Besucher kann ihn lesen, geheim halten lässt er sich nicht.
Geschützt werden die Daten durch Row Level Security, nicht durch Geheimhaltung des Keys.

Vorrang ist geprüft: Echte Umgebungsvariablen (etwa aus den Vercel-Projekteinstellungen)
gewinnen gegen die Datei — Vite überschreibt bereits vorhandene Werte nicht. Für ein zweites
Supabase-Projekt genügt es also, sie im Hosting zu setzen; an der Datei ist nichts zu ändern.

> Der Secret Key (`sb_secret_…`) gehört **niemals** hierher. Er umgeht RLS vollständig. Ein
> `VITE_`-Präfix davor würde ihn direkt ins öffentliche Bundle schreiben.

---

## Farben ändern

**Alle** Farbwerte der App stehen in genau einer Datei: [`src/styles/tokens.css`](src/styles/tokens.css).
Kein Hex-Wert liegt sonst irgendwo im Code.

```
:root                  helle Palette
[data-theme="dark"]    dunkle Palette
--ink-*                die immer dunklen Fokus-Flächen (Hero-Karte, Trainings-Screen)
```

Der schnellste Weg zu einer eigenen Farbwelt: nur `--accent`, `--accent-hi`, `--accent-ink`,
`--accent-soft` und `--accent-fg` in beiden Blöcken tauschen. Buttons, aktive Navigation,
Diagrammlinien und Fokusring folgen automatisch.

Zwei Feinheiten, die beim Tauschen wichtig sind:

- `--accent` ist immer eine **Fläche** mit `--accent-ink` als Schrift darauf. Als Textfarbe auf
  hellem Grund wäre Lime unlesbar — dafür gibt es `--accent-fg`, im Hellmodus deutlich dunkler.
- Die `--ink-*`-Tokens gelten in **beiden** Modi. Sie tragen die Bildsprache des Designs: die
  „Heutiges Training"-Karte, die Volumen-Karte und der komplette Trainings-Screen bleiben
  tiefschwarz, egal wie hell der Rest ist.

### Schriften

**Archivo Black** (Überschriften, Zahlen) und **Manrope** (alles andere) liegen als woff2 unter
`public/fonts/` und werden über [`src/styles/fonts.css`](src/styles/fonts.css) eingebunden —
selbst gehostet statt vom Google-CDN, weil die App sonst ohne Netz keine Schrift hätte.
Zusammen 412 KB, vom Service Worker vorgehalten.

---

## Aufbau

```
src/
├─ lib/            Kernlogik ohne React — hier liegt die Wahrheit
│  ├─ parsePlan.ts     Import-Parser (Spec §4.8)          → getestet
│  ├─ formulas.ts      Volumen, Streak, bester Satz (§3.8) → getestet
│  ├─ date.ts          Lokale Zeitzone, nie UTC (§3.1)     → getestet
│  ├─ fetchAll.ts      Paginierung (§3.5)
│  ├─ syncQueue.ts     Offline-Warteschlange (§3.6)
│  ├─ backup.ts        ZIP-Export und -Import (§4.13)
│  ├─ image.ts         Foto verkleinern vor Upload (§4.12)
│  └─ errors.ts        Fehlertexte auf Deutsch (§3.2)
├─ components/     Bausteine; `ui/` ist die Designsystem-Ebene
├─ context/        Auth und Theme
├─ hooks/          Laden mit Lade-/Fehlerzustand, Übungsnamen
├─ pages/          Ein Screen je Datei, benannt wie in der Spec
└─ styles/         tokens.css · fonts.css · index.css
```

Die Kernlogik ist bewusst frei von React und Supabase: `parsePlan`, `formulas` und `date` sind
reine Funktionen auf einfachen Daten und dadurch direkt testbar. Alle 62 Tests decken die in
Spec §6 namentlich geforderten Fälle ab.

---

## Wie das Design umgesetzt ist

Das Design zeigt fünf Screens; die Spec verlangt dreizehn. Die Bildsprache wurde deshalb als
System übernommen und auf alle Screens ausgerollt:

| Element des Designs | Wo es in der App auftaucht |
|---|---|
| Tiefschwarze Fokus-Karte mit Lime-Schein | „Heutiges Training" (Start), Volumen-Karte (Statistik) |
| Vollflächig dunkler Screen | Anmeldung/Registrierung, aktives Training |
| Archivo Black, eng, teils Versalien | Alle Überschriften und alle Zahlen |
| Lime-Fläche mit schwarzer Schrift | Primärknöpfe, aktiver Navigationspunkt, aktiver Satz |
| Segmentleiste | Übungsfortschritt im Training |
| Nummerierte Zeilen `01`, `02` … | Vorschau im Planimport, Bestenliste |
| Runde −15/+15-Tasten | Pausen-Timer |
| Avatar-Kreis oben rechts | Konto und Hell/Dunkel-Umschalter |

### Drei bewusste Abweichungen

1. **Sechs Navigationspunkte statt fünf plus Plus-Knopf.** Spec §3.7 legt die sechs Ziele
   abschließend fest (Start, Pläne, Check-in, Fortschritt, Statistik, Daten). Neben sechs
   Punkten ist kein Platz für den schwebenden Plus-Knopf aus dem Design; seine Funktion
   („Training starten") liegt bereits als großer Lime-Knopf auf dem Startbildschirm.
2. **Kein „Profil"-Punkt in der Navigation** — aus demselben Grund. Konto und Darstellung
   sitzen hinter dem Avatar oben rechts, wie im Home-Screen des Designs.
3. **Kein Onboarding-Screen.** Die Spec kennt keinen; seine Gestaltung ist stattdessen in die
   Anmelde- und Registrierungsseiten geflossen.

Die Anmeldeseiten sind immer dunkel, unabhängig vom gewählten Modus — so wie der
Einstiegsscreen des Designs. Der Hell/Dunkel-Umschalter sitzt im Konto-Menü innerhalb der App.

---

## Entscheidungen, die über die Spec hinausgehen

Alle offenen Punkte aus Spec §8 wurden entschieden:

| Punkt | Entscheidung |
|---|---|
| E-Mail-Bestätigung | **aktiv** — nach der Registrierung erscheint ein Hinweisscreen |
| Zeitraum der Statistik | **365 Tage** statt 180 (möglich nur dank Paginierung) |
| e1RM als zweite Diagrammlinie | **nein** — die Funktion `e1rm()` existiert ungenutzt in `formulas.ts` |
| Pausen-Timer | **ja**, ergänzt (in der Spec unter „bewusst nicht geändert") |

Dazu vier technische Ergänzungen, die aus Akzeptanzkriterien folgen:

- **`start_workout(plan_id)`** als Postgres-Funktion plus partieller Unique-Index
  `workouts (user_id, plan_id) where finished_at is null`. Damit garantiert die *Datenbank*
  höchstens ein offenes Training je Plan — AK-1 aus §4.5 hält auch bei Doppelklick oder
  zweitem Gerät, nicht nur bei einer clientseitigen Prüfung.
- **`delete_set(set_id)`** löscht und nummeriert die Folgesätze in einer Transaktion neu (§4.9 AK-3).
- **`exercise_names()`** liefert die deduplizierte Vorschlagsliste (§3.9) in einer Abfrage.
- **Mindestlaufzeit von 900 ms** beim Anfordern eines Reset-Links. §4.3 verlangt, dass sich eine
  unbekannte E-Mail-Adresse „weder im Text noch in der Antwortzeit" von einer bekannten
  unterscheidet — ohne diese Angleichung wäre ein sofortiger Fehlschlag messbar schneller.

### Zwei Stellen, an denen der Parser präzisiert wurde

Spec §4.8 beschreibt den CSV-Zweig als „Zeile an `;`, `,` oder Tab trennen". Wörtlich
umgesetzt würde `Bankdrücken;3;10;62,5` das Dezimalkomma zerreißen — und §6 verlangt
ausdrücklich einen Test für `62,5`. Deshalb:

1. Es wird genau **ein** Trennzeichen je Zeile gewählt, in der Reihenfolge Tab, `;`, `,`.
2. Das Komma gilt nur dann als Trennzeichen, wenn die Zeile keine Freitext-Merkmale trägt
   (`3x10`, `@60`, `60 kg`) — sonst würde `Bankdrücken 3x10 @62,5` als CSV mit zwei Feldern gelesen.

Außerdem normalisiert der Parser Zielwerte so, dass sie nie die `CHECK`-Constraints verletzen
können (`target_sets > 0` usw.). Unbrauchbare Werte fallen auf den Standardwert zurück, statt
den Import erst an einem Datenbankfehler scheitern zu lassen.

---

## Was noch offen ist

### Bereits gegen das echte Projekt geprüft

Schema angewendet und von außen verifiziert (anonymer Zugriff, Stand 15.08.2026):

- Sieben Tabellen mit allen 46 Spalten vorhanden
- RLS greift: Lesen liefert `[]`, Schreiben scheitert mit `42501`
- Alle vier Funktionen existieren und verhalten sich richtig — `save_plan` wird als anonymer
  Aufruf von RLS abgewiesen und legt **nichts** an. Genau dafür steht dort `security invoker`;
  mit `security definer` wäre die Funktion an RLS vorbeigelaufen.
- Bucket `progress-photos` existiert und ist privat
- E-Mail-Bestätigung ist aktiv
- Ein echter Anmeldeversuch aus der App liefert die generische Meldung nach §4.1 AK-1,
  die Rohmeldung landet nur in der Konsole

### Noch offen

- **Was eine angemeldete Sitzung braucht**: die `CHECK`-Constraints (RIR 0–10, Gewicht, Maße,
  Schlaf), der partielle Unique-Index aus §4.5 AK-1, die Transaktionalität von `save_plan`,
  Offline-Sync, Backup-Paginierung über 1000 Sätze — und der RLS-Kreuztest aus §6
  (Nutzer A darf Zeilen von Nutzer B in keiner Tabelle sehen), für den zwei Konten nötig sind.
- **Darstellung** wurde im Browser über alle Screens geprüft, allerdings mit abgefangenen
  Supabase-Antworten. Das echte Zusammenspiel von Insert, Upsert und Storage-Upload steht aus.
- Die Offline-Warteschlange nutzt `localStorage`. Bei sehr vielen unsynchronisierten Sätzen
  (>1000) wäre IndexedDB angemessener; für den vorgesehenen Gebrauch reicht es.
