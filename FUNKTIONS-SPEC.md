# Gym Tracker — Funktions-Spezifikation für den Neubau

**Version:** 1.0 · **Datum:** 15.08.2026 · **Autor:** Leo
**Grundlage:** Reverse Engineering von `github.com/dranoel2010/gym-app` (Stand 15.08.2026)

---

## 0. Wie diese Spec zu lesen ist

Dieses Dokument beschreibt **ausschließlich, was die App tun muss** — Daten, Regeln, Abläufe, Zustände.

**Nicht Teil dieser Spec:** Farben, Typografie, Abstände, Komponentenoptik, Animationen. Das Design wird getrennt festgelegt. Wo unten von „Liste", „Formular" oder „Dialog" die Rede ist, ist die *Funktion* gemeint, nicht die Darstellung.

Jeder Screen-Abschnitt hat denselben Aufbau: Zweck → Daten → Aktionen → Validierung → Zustände → Akzeptanzkriterien (AK). Die AK sind der Prüfmaßstab: Ist ein AK nicht erfüllbar, ist der Screen nicht fertig.

**Zielsetzung des Neubaus:** identischer Funktionsumfang wie v1, neues Design, saubere Datenbasis. Die Datenbank wird leer neu aufgesetzt — keine Migration von Altdaten.

---

## 1. Produktrahmen

**Was die App ist:** ein persönlicher Krafttrainings-Tracker als Web-App (PWA, installierbar auf dem Homescreen). Einzelnutzer-Betrieb pro Konto, keine sozialen Funktionen, kein Mehrbenutzer-Sharing.

**Primärer Nutzungskontext:** Handy, Hochformat, 375–430 px Breite, im Fitnessstudio zwischen den Sätzen. Bedienung mit einer Hand, oft mit schwitzigen Fingern. Desktop ist zweitrangig, muss aber benutzbar sein.

**Sprache:** Deutsch, durchgängig. Auch Fehlermeldungen.

**Einheiten:** Gewicht in Kilogramm, Körpermaße in Zentimetern, Schlaf in Stunden. Keine Einheitenumschaltung.

### Technischer Rahmen

| Bereich | Festlegung |
|---|---|
| Frontend | React 19 + TypeScript, Vite |
| Routing | react-router-dom v7 |
| Styling | Tailwind CSS v4 (Design-Tokens als CSS Custom Properties) |
| Formulare | react-hook-form + zod — **in allen Formularen**, nicht nur in Auth |
| Backend | Supabase (Postgres, Auth, Storage), Zugriff nur über `@supabase/supabase-js` |
| Diagramme | recharts |
| Toasts | sonner |
| PWA | vite-plugin-pwa |
| Hosting | Vercel, SPA-Fallback auf `index.html` |

**Umgebungsvariablen:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Fehlt eine davon, bricht der App-Start mit klarer Konsolenmeldung ab.

**Sicherheitsgrundsatz:** Jede Tabelle hat Row Level Security. Ein Nutzer sieht und ändert ausschließlich eigene Zeilen. Es gibt keinen serverseitigen Code außerhalb von Postgres-Policies — die Datenbank ist die einzige Sicherheitsschicht und muss entsprechend streng sein.

---

## 2. Datenmodell

Vollständiges Schema. Als eine idempotente `setup.sql` anlegen, nicht als Kette von Einzelmigrationen.

> **Wichtig:** Jede Policy bekommt **sowohl `using` als auch `with check`**, explizit ausgeschrieben.
>
> Hintergrund: v1 hatte zwei auseinanderlaufende Schemastände. `supabase/migrations/001_init.sql` definiert die Policies **aller vier** damaligen Tabellen ohne `with check`; `supabase/setup.sql`, `rebuild.sql` und `fix-policies.sql` definieren sie mit. Wer die nummerierten Migrationen ausführte, bekam ein anderes Schema als wer `setup.sql` benutzte — die Existenz von `fix-policies.sql` (Fehler `42501` im Kommentar) belegt, dass das in der Praxis zugeschlagen hat. In v2 gibt es genau eine Schemadatei und keine implizit abgeleiteten Regeln.

> **Neu in v2:** Die unten aufgeführten `CHECK`-Constraints und Indizes existieren in v1 **nicht** — dort gibt es nur die Prüfungen auf `week_rating` und `pose` und keinen einzigen Index. Sie sind bewusste Ergänzungen: Wertebereiche gehören in die Datenbank, nicht nur ins Formular.

### 2.1 `plans` — Trainingspläne

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | text | NOT NULL |
| `created_at` | timestamptz | Default `now()` |

Policy: `auth.uid() = user_id` für `using` und `with check`.

### 2.2 `plan_exercises` — Übungen eines Plans

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `plan_id` | uuid | NOT NULL, FK → `plans(id)` ON DELETE CASCADE |
| `exercise_name` | text | NOT NULL |
| `target_sets` | integer | NOT NULL, Default 3, CHECK `> 0` |
| `target_reps` | integer | NOT NULL, Default 10, CHECK `> 0` |
| `target_weight` | numeric(6,2) | NOT NULL, Default 0, CHECK `>= 0` (kg) |
| `order_index` | integer | NOT NULL, Default 0 |

Policy über den Besitz des Plans:
```sql
exists (select 1 from plans where plans.id = plan_exercises.plan_id and plans.user_id = auth.uid())
```
— identisch für `using` **und** `with check`.

### 2.3 `workouts` — Trainingseinheiten

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `plan_id` | uuid | nullable, FK → `plans(id)` **ON DELETE SET NULL** |
| `started_at` | timestamptz | Default `now()` |
| `finished_at` | timestamptz | nullable — `NULL` bedeutet: läuft noch |

`plan_id` ist bewusst nullable und wird beim Löschen eines Plans auf NULL gesetzt: Die Trainingshistorie überlebt das Löschen des Plans und heißt dann „Freies Training".

Policy: `auth.uid() = user_id`.

**Index:** `create index on workouts (user_id, finished_at desc);`

### 2.4 `workout_sets` — Geloggte Sätze

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `workout_id` | uuid | NOT NULL, FK → `workouts(id)` ON DELETE CASCADE |
| `exercise_name` | text | NOT NULL — freier Text, es gibt keine Übungs-Stammtabelle |
| `set_number` | integer | NOT NULL, CHECK `> 0` |
| `reps` | integer | NOT NULL, CHECK `> 0` |
| `weight` | numeric(6,2) | NOT NULL, Default 0, CHECK `>= 0` (kg) |
| `rir` | integer | nullable, **CHECK `rir between 0 and 10`** |
| `note` | text | nullable |
| `logged_at` | timestamptz | Default `now()` |

Policy über den Besitz des Workouts (analog 2.2).

**Index:** `create index on workout_sets (workout_id, exercise_name);`

> **Bewusste Entscheidung:** `exercise_name` bleibt Freitext statt Fremdschlüssel auf eine Übungstabelle. Das hält die App einfach und erlaubt spontane Übungen. Der Preis: Tippfehler erzeugen getrennte Statistik-Reihen („Bankdrücken" vs. „Bankdruecken"). Gegenmaßnahme siehe 3.9 (Autovervollständigung aus der Historie).

### 2.5 `weekly_checkins` — Wöchentlicher Check-in

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK CASCADE |
| `checkin_date` | date | NOT NULL, Default `current_date` |
| `bodyweight` | numeric(6,2) | nullable, CHECK `between 20 and 400` (kg, morgens nüchtern) |
| `sleep_hours` | numeric(4,1) | nullable, CHECK `between 0 and 24` |
| `week_rating` | integer | nullable, CHECK `between 1 and 5` |
| `created_at` | timestamptz | Default `now()` |
| — | — | **UNIQUE (`user_id`, `checkin_date`)** |

Policy: `auth.uid() = user_id`, `using` + `with check`.

### 2.6 `measurements` — Körpermaße in cm

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK CASCADE |
| `measured_at` | date | NOT NULL, Default `current_date` |
| `upper_arm` | numeric(5,1) | nullable — Oberarm angespannt |
| `chest` | numeric(5,1) | nullable — Brust |
| `thigh` | numeric(5,1) | nullable — Oberschenkel |
| `waist` | numeric(5,1) | nullable — Taille |
| `created_at` | timestamptz | Default `now()` |
| — | — | **UNIQUE (`user_id`, `measured_at`)** |

Alle vier Maße: CHECK `between 10 and 300`.

> **Änderung gegenüber v1:** Dort fehlte die Unique-Constraint, mehrere Messungen am selben Tag waren möglich und erzeugten Doppelungen im Verlauf. Neu: ein Eintrag pro Tag, Speichern per Upsert (wie beim Check-in).

### 2.7 `progress_photos` — Metadaten der Fortschrittsfotos

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid | PK, Default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK CASCADE |
| `photo_date` | date | NOT NULL, Default `current_date` |
| `pose` | text | NOT NULL, CHECK `in ('front','side','back')` |
| `storage_path` | text | NOT NULL |
| `created_at` | timestamptz | Default `now()` |

Policy: `auth.uid() = user_id`, `using` + `with check`.

### 2.8 Storage-Bucket `progress-photos`

- `public = false`, Anlage per `on conflict (id) do nothing`
- Pfadkonvention: **`<user_id>/<YYYY-MM-DD>/<pose>-<timestamp>.<ext>`**
- Vier Policies auf `storage.objects` — SELECT, INSERT, UPDATE, DELETE — jeweils mit der Bedingung:
  ```sql
  bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ```
  Die UPDATE-Policy ist zwingend, sonst schlägt das Überschreiben beim Backup-Restore fehl.
- Der Client greift **nie** direkt zu, sondern immer über `createSignedUrls(paths, 3600)`.

---

## 3. Querschnittsregeln

Diese Regeln gelten überall und sind wichtiger als jede einzelne Screen-Beschreibung.

### 3.1 Datum und Zeitzone

Alle Datumsberechnungen laufen in der **lokalen Zeitzone**, nie in UTC. Ein Training, das um 23:30 Uhr endet, gehört zu diesem Tag, nicht zum nächsten.

```ts
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`   // YYYY-MM-DD
}
```

Anzeigeformat: `toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })` → `15.08.26`. In Diagrammachsen kurz: `15.08.`.

Auch der Dateiname eines Backups nutzt das lokale Datum. (In v1 war das UTC — abends hieß das Backup „von morgen".)

### 3.2 Fehlerbehandlung — verbindliche Regel

**Jede** schreibende Aktion hat drei sichtbare Ausgänge: läuft, erfolgreich, fehlgeschlagen. Ein stiller Fehlschlag ist ein Bug.

- Schreibfehler → `toast.error` mit verständlichem deutschen Text. Nie eine rohe Supabase-Fehlermeldung anzeigen, aber immer per `console.error` mitloggen.
- Ladefehler → sichtbarer Fehlerzustand im betroffenen Bereich mit Button „Erneut versuchen".
- Löschungen werden **nicht** optimistisch aus der Ansicht entfernt. Erst wenn die Datenbank bestätigt hat, verschwindet der Eintrag.

### 3.3 Ladezustände

Jeder Bereich, der Daten lädt, hat einen expliziten Ladezustand. Kein Screen zeigt leere Formularfelder, während im Hintergrund noch geladen wird.

Wenn `user?.id` noch nicht bereitsteht, darf ein Screen **nicht** dauerhaft im Ladezustand hängen bleiben — der frühe Return muss `loading` trotzdem auflösen. (In v1 war das an fünf Stellen kaputt: Dashboard, Planliste, Check-in, Fortschritt und die Statistik-Abfrage. Der Planeditor hatte gar keinen Ladezustand.)

### 3.4 Bestätigung vor Datenverlust

Löschen erfordert immer eine Rückfrage: Pläne, Check-ins, Messungen, Fotos, Sätze, Workouts. Der Dialog nennt konkret, was gelöscht wird (Name oder Datum), und was daran hängt (z. B. „Die Trainingshistorie bleibt erhalten.").

### 3.5 Paginierung — Pflicht bei allen Sammelabfragen

Supabase/PostgREST liefert standardmäßig maximal 1000 Zeilen. Jede Abfrage, die unbegrenzt viele Zeilen zurückgeben kann — `workout_sets`, `plan_exercises`, alles im Backup-Export — muss über `.range(from, to)` in Seiten geholt werden, bis eine Seite kürzer als die Seitengröße zurückkommt.

Betrifft konkret: Backup-Export, Statistik-Abfragen. In v1 fehlte das und beides wurde ab ~1000 Sätzen still unvollständig.

```ts
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{data: T[] | null, error: unknown}>) {
  const size = 1000, out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < size) return out
  }
}
```

### 3.6 Offline-Verhalten

v1 war nominell eine PWA, aber ohne jede Offline-Fähigkeit — im Keller ohne Empfang ließ sich kein Satz speichern. Das ist der zentrale Praxisfehler, denn genau dort wird die App benutzt.

**Mindestanforderung für v2:**

1. App-Shell per Service Worker precachen (macht vite-plugin-pwa automatisch).
2. Beim Öffnen eines aktiven Workouts werden Workout, Plan-Übungen und bisherige Sätze in `localStorage` oder IndexedDB gespiegelt.
3. Ein geloggter Satz wird **sofort lokal** gespeichert und sofort in der Liste angezeigt. Der Netzwerk-Insert läuft asynchron hinterher.
4. Schlägt er fehl, bleibt der Satz in einer Warteschlange und wird bei nächster Verbindung nachgesendet. Reihenfolge bleibt erhalten.
5. Ein sichtbarer Indikator zeigt „N Sätze noch nicht synchronisiert".

`set_number` wird dabei lokal vergeben (bisherige Sätze dieser Übung + 1) und beim Nachsenden nicht neu berechnet.

### 3.7 Navigation

| Pfad | Screen | Zugriff |
|---|---|---|
| `/login` | Anmeldung | öffentlich |
| `/register` | Registrierung | öffentlich |
| `/forgot-password` | Passwort vergessen | öffentlich |
| `/reset-password` | Neues Passwort setzen | öffentlich |
| `/` | Dashboard | geschützt |
| `/plans` | Planliste | geschützt |
| `/plans/new` | Plan anlegen | geschützt |
| `/plans/:id` | Plan bearbeiten | geschützt |
| `/plans/import` | Plan importieren | geschützt |
| `/workout/:workoutId` | Aktives Training | geschützt |
| `/stats` | Statistik | geschützt |
| `/checkin` | Wochen-Check-in | geschützt |
| `/progress` | Maße & Fotos | geschützt |
| `/daten` | Backup | geschützt |
| `*` | **404-Seite** | — |

Geschützte Routen: solange die Session lädt → Ladezustand; ohne Nutzer → Weiterleitung auf `/login`. Eine 404-Route ist Pflicht (in v1 fehlte sie, unbekannte Pfade zeigten eine weiße Seite).

**Hauptnavigation** (dauerhaft sichtbar, 6 Ziele): Start `/`, Pläne `/plans`, Check-in `/checkin`, Fortschritt `/progress`, Statistik `/stats`, Daten `/daten`.

### 3.8 Zentrale Berechnungsformeln

| Kennzahl | Formel |
|---|---|
| **Satz-Volumen** | `reps × weight` (kg·Wdh.) |
| **Tagesvolumen je Übung** | Summe aller Satz-Volumina dieser Übung an diesem Tag, gerundet auf ganze Zahl |
| **Ø Trainings/Woche** | Workouts der letzten 28 Tage ÷ 4, gerundet auf 1 Nachkommastelle |
| **Streak** | siehe unten — Definition geändert |
| **e1RM** (neu, optional) | Epley: `weight × (1 + reps / 30)` |

**Streak — geänderte Definition.** In v1 zählte der Streak aufeinanderfolgende *Kalendertage*. Bei Krafttraining mit Ruhetagen stand er dadurch praktisch immer auf 0 oder 1 — die Kennzahl war wertlos.

**Neu: Streak = aufeinanderfolgende Kalenderwochen mit mindestens einem abgeschlossenen Training.** Gezählt wird rückwärts ab der laufenden Woche (Woche beginnt Montag). Die laufende Woche ohne Training beendet den Streak nicht, sie wird übersprungen. Beschriftung: „N Wochen in Folge".

**Volumen bei Körpergewichtsübungen.** Bei `weight = 0` ist das Volumen 0 — Klimmzüge erscheinen als Nulllinie. Lösung: Übungen, bei denen *alle* Sätze `weight = 0` haben, werden nicht nach Volumen, sondern nach **Gesamtwiederholungen** ausgewertet. Die Achsenbeschriftung wechselt entsprechend auf „Wdh.".

### 3.9 Übungsnamen

Beim Eintippen eines Übungsnamens (Planeditor wie Ad-hoc-Übung im Training) werden bereits verwendete Namen des Nutzers als Vorschläge angeboten — aus `plan_exercises` und `workout_sets`, dedupliziert, Vergleich ohne Groß-/Kleinschreibung. Das verhindert getrennte Statistikreihen durch Schreibvarianten.

---

## 4. Screens

### 4.1 Anmeldung — `/login`

**Zweck:** Anmeldung mit E-Mail und Passwort.

**Aktionen:** Felder E-Mail (`autocomplete="email"`) und Passwort (`autocomplete="current-password"`), Button „Anmelden", Links zu `/forgot-password` und `/register`.

**Validierung (zod):**
```ts
email: z.string().email('Ungültige E-Mail-Adresse')
password: z.string().min(1, 'Passwort ist erforderlich')
```

**Zustände:** Bereits eingeloggt → sofort Weiterleitung auf `/`. Während des Absendens → Button gesperrt, Text „Anmelden…". Fehler → **eine generische Meldung** („Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.") — bewusst ohne Unterscheidung, ob die E-Mail existiert. Erfolg → `/`.

**AK-1:** Bei falschem Passwort und bei nicht existierender E-Mail erscheint exakt dieselbe Meldung.
**AK-2:** Ein bereits angemeldeter Nutzer sieht das Login-Formular nie.

### 4.2 Registrierung — `/register`

**Zweck:** Konto anlegen.

**Aktionen:** E-Mail, Passwort, Passwort bestätigen, Button „Registrieren", Link zum Login.

**Validierung:** E-Mail gültig; Passwort mindestens 8 Zeichen (v1: 6 — angehoben); Bestätigungsfeld muss übereinstimmen, Meldung „Die Passwörter stimmen nicht überein".

> **Änderung gegenüber v1:** Dort gab es kein Bestätigungsfeld. Ein Tippfehler im Passwort führte zu einem Konto, in das man sich nicht einloggen konnte.

**Ablauf:** `signUp` mit Weiterleitungsziel `${origin}/login`. Kommt keine Session zurück, ist E-Mail-Bestätigung aktiv → eigener Hinweisscreen „E-Mail bestätigen" mit Link zurück zum Login. Kommt eine Session zurück → direkt `/`.

**AK:** Nach Registrierung mit aktivierter Bestätigungspflicht landet der Nutzer nicht im Dashboard, sondern auf dem Hinweisscreen.

### 4.3 Passwort vergessen — `/forgot-password`

**Zweck:** Reset-Link anfordern.

**Ablauf:** `resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`.

**Kernregel — Schutz gegen Konto-Ausspähung:** Nur *vorübergehende* Fehler werden angezeigt. Alles andere — insbesondere „Nutzer existiert nicht" — wird verschluckt und führt zur immer gleichen Bestätigung:

> „Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen deines Passworts geschickt. Schau auch im Spam-Ordner nach."

Als vorübergehend gilt ein Fehler, wenn: HTTP-Status 429, Status ≥ 500, `name === 'AuthRetryableFetchError'`, oder Code `over_email_send_rate_limit` bzw. `over_request_rate_limit`.

**AK:** Für eine unbekannte E-Mail-Adresse ist das Ergebnis von außen nicht von dem für eine bekannte zu unterscheiden — weder im Text noch in der Antwortzeit.

### 4.4 Neues Passwort setzen — `/reset-password`

**Zweck:** Passwort nach Klick auf den Reset-Link setzen.

Dieser Screen ist heikler als er aussieht. Drei Punkte sind zwingend:

**(a) URL-Parameter synchron beim Modul-Import einsammeln.** Der Supabase-Client leert `location.hash`, bevor React-Effekte laufen. Wer erst im `useEffect` liest, findet nichts mehr. Also auf Modulebene:

```ts
const capturedUrlParams: Record<string, string> = {}
const collect = (s: string) => new URLSearchParams(s).forEach((v, k) => { capturedUrlParams[k] = v })
collect(window.location.hash.replace(/^#/, ''))
collect(window.location.search.replace(/^\?/, ''))   // Query gewinnt bei Kollision
```

**(b) Race-freie Link-Prüfung.** Parallel auf `onAuthStateChange` hören **und** `getSession()` aufrufen. Kein Wall-Clock-Timeout. Eine spät eintreffende Session darf ein bereits gemeldetes „ungültig" nachträglich korrigieren.

**(c) Fehlerursache aus der URL ableiten:**

| Bedingung | Meldung |
|---|---|
| `error_code === 'otp_expired'` oder `error_description` enthält „expired" | „Dieser Link ist abgelaufen. Links zum Zurücksetzen sind nur kurze Zeit gültig – fordere bitte einen neuen an." |
| `error === 'access_denied'` | „Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an." |
| sonst | generische Meldung |

**Zustände:** `checking` → „Link wird geprüft…"; `invalid` → Meldung + Link „Neuen Link anfordern"; `ready` → Formular; `done` → „Passwort geändert", nach 1500 ms Weiterleitung auf `/`.

**Validierung:** Passwort mindestens 8 Zeichen, Bestätigungsfeld muss übereinstimmen. (v1: 6 Zeichen — angehoben, damit hier dieselbe Regel gilt wie bei der Registrierung.)

**Server-Fehlermapping:** `AuthSessionMissingError` → „Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link zum Zurücksetzen an."; `same_password` → „Das neue Passwort muss sich vom bisherigen unterscheiden."; `weak_password` → „Dieses Passwort ist zu schwach. Bitte wähle ein sichereres."

### 4.5 Dashboard — `/`

**Zweck:** Einstiegspunkt — Plan wählen, Training starten, letzte Trainings sehen.

**Daten:** eigene `plans` nach `created_at` absteigend; die letzten 5 `workouts` nach `started_at` absteigend. Plannamen clientseitig zuordnen.

**Aktionen:**

- Auswahlfeld „Plan" — vorbelegt mit dem zuletzt angelegten Plan
- Button „Training starten"
- Liste der letzten 5 Trainings, Status je Eintrag „Abgeschlossen" oder „Offen — Fortsetzen"; offene Einträge sind anklickbar und führen zurück ins Training
- Bei 0 Plänen: Hinweis + Button „Erstelle erst einen Plan" → `/plans/new`

**Logik „Training starten":** Zuerst prüfen, ob für **diesen Plan** bereits ein offenes Workout existiert (`plan_id = ausgewählt` und `finished_at is null`). Falls ja → dorthin navigieren, **kein neuer Datensatz**. Sonst neues Workout anlegen und dorthin navigieren.

**Zusätzlich in v2:** Existiert irgendein offenes Workout — auch zu einem anderen Plan — wird das **oben im Dashboard prominent angezeigt** („Training läuft seit …, fortsetzen?"). In v1 konnten unbemerkt mehrere offene Workouts parallel existieren.

**Zustände:** Laden; keine Pläne; keine Trainings („Noch keine Trainings aufgezeichnet."); Startvorgang läuft (Button gesperrt); **Fehler beim Starten → Toast** (fehlte in v1 komplett).

**AK-1:** Zweimal „Training starten" für denselben Plan erzeugt genau ein Workout.
**AK-2:** Ein Workout, dessen Plan gelöscht wurde, erscheint in der Liste als „Freies Training" statt zu verschwinden.

### 4.6 Planliste — `/plans`

**Zweck:** Pläne verwalten.

**Daten:** eigene `plans`, absteigend nach `created_at`.

**Aktionen je Plan:** Bearbeiten → `/plans/:id`; Exportieren (JSON-Download); Löschen (mit Bestätigung). Kopfzeile: „Neuer Plan" → `/plans/new`, „Import" → `/plans/import`.

**Exportformat (Einzelplan, `.json`):**
```json
{
  "name": "Push Day A",
  "exercises": [
    { "exercise_name": "Bankdrücken", "target_sets": 3, "target_reps": 10, "target_weight": 60 }
  ]
}
```
Reihenfolge steckt in der Array-Reihenfolge, `order_index` wird nicht geschrieben. Dateiname: Planname, bereinigt um `\ / : * ? " < > |`, Fallback `plan.json`.

**Löschen:** Dialog nennt den Plannamen und weist darauf hin, dass die Trainingshistorie erhalten bleibt (Workouts werden zu „Freies Training"). Bei Fehler bleibt der Dialog offen und zeigt die Meldung.

**Zustände:** Laden; leer („Noch keine Pläne. Erstelle deinen ersten!" + Button); Löschvorgang läuft; **Ladefehler mit Wiederholen-Button**.

### 4.7 Planeditor — `/plans/new` und `/plans/:id`

**Zweck:** Plan mit Übungen und Zielvorgaben anlegen oder ändern.

**Startzustand (neu):** Name leer, eine leere Übungszeile mit `target_sets: 3`, `target_reps: 10`, `target_weight: 0`.

**Aktionen:** Feld „Plan-Name"; pro Übungszeile: Name (mit Vorschlägen, siehe 3.9), Sätze, Wdh., Gewicht (kg, Schrittweite 0,5), Löschen (gesperrt, wenn nur eine Zeile übrig); Button „Hinzufügen"; **Zeilen per Drag-and-drop umsortieren** (neu — in v1 war die Reihenfolge nach dem Anlegen nicht änderbar); Button „Plan speichern".

**Validierung:**

| Feld | Regel | Meldung |
|---|---|---|
| Plan-Name | nicht leer nach `trim()` | „Plan-Name ist erforderlich" |
| Übungen | mindestens eine mit nicht-leerem Namen | „Mindestens eine Übung ist erforderlich" |
| Sätze | ganze Zahl 1–20 | „Sätze muss zwischen 1 und 20 liegen" |
| Wdh. | ganze Zahl 1–100 | „Wdh. muss zwischen 1 und 100 liegen" |
| Gewicht | 0–999, eine Nachkommastelle | „Gewicht muss zwischen 0 und 999 liegen" |

Zeilen ohne Namen werden verworfen — aber **mit sichtbarem Hinweis**, nicht stillschweigend wie in v1. `order_index` wird beim Speichern neu von 0 an durchnummeriert.

**Speichern — muss atomar sein.** In v1 wurden beim Bearbeiten erst alle `plan_exercises` gelöscht und dann neu eingefügt; schlug das Einfügen fehl, waren die Übungen unwiederbringlich weg.

**Neu:** Speichern läuft über eine Postgres-Funktion, die in einer Transaktion arbeitet:

```sql
create or replace function save_plan(
  p_plan_id uuid,        -- null = neuer Plan
  p_name text,
  p_exercises jsonb      -- [{exercise_name, target_sets, target_reps, target_weight}]
) returns uuid
language plpgsql security invoker as $$
declare v_id uuid;
begin
  if p_plan_id is null then
    insert into plans (user_id, name) values (auth.uid(), p_name) returning id into v_id;
  else
    update plans set name = p_name where id = p_plan_id and user_id = auth.uid() returning id into v_id;
    if v_id is null then raise exception 'Plan nicht gefunden'; end if;
    delete from plan_exercises where plan_id = v_id;
  end if;

  insert into plan_exercises (plan_id, exercise_name, target_sets, target_reps, target_weight, order_index)
  select v_id, e->>'exercise_name', (e->>'target_sets')::int, (e->>'target_reps')::int,
         (e->>'target_weight')::numeric, (ord - 1)
  from jsonb_array_elements(p_exercises) with ordinality as t(e, ord);

  return v_id;
end $$;
```

Der Client ruft nur noch `supabase.rpc('save_plan', {...})`. Entweder alles wird gespeichert oder nichts.

**Zustände beim Bearbeiten:** Ladezustand, bis Plan und Übungen da sind. Existiert der Plan nicht oder gehört er einem anderen Nutzer → Fehlerscreen „Plan nicht gefunden" + Link zurück. (In v1 blieb das Formular leer und Speichern tat so, als hätte es funktioniert.)

**AK:** Wird beim Bearbeiten das Speichern serverseitig abgebrochen, sind die alten Übungen unverändert vorhanden.

### 4.8 Planimport — `/plans/import`

**Zweck:** Plan aus eingefügtem Text oder einer Datei erzeugen.

**Aktionen:** Feld „Plan-Name"; Button „Datei" (`.txt,.csv,.tsv,.json`); großes Textfeld; Live-Vorschau der erkannten Übungen; Button „N Übungen importieren".

**Dateiauswahl:** Inhalt landet im Textfeld. Ist der Plan-Name noch leer, wird der Dateiname ohne Endung eingesetzt — damit ist Export → Import namenserhaltend. Das Datei-Input wird danach zurückgesetzt, damit dieselbe Datei erneut wählbar ist.

**Vorschau:** wird bei jeder Änderung neu berechnet und zeigt je Zeile Name, `Sätze × Wdh.` und ` @ Gewicht kg` (letzteres nur bei Gewicht > 0). Der Import-Button ist gesperrt, solange 0 Übungen erkannt sind.

#### Parser-Spezifikation

Der Parser ist das Herzstück dieses Screens und muss **exakt** so arbeiten. Er ist über einen Unit-Test-Satz abzusichern (siehe 6).

**Zahlenkonvertierung** — deutsches Dezimalkomma wird unterstützt:
```ts
const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string') { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n }
  return null
}
```

**Standardwerte durchgängig:** Sätze 3, Wdh. 10, Gewicht 0.

**Leerer Text:** ergibt 0 Übungen und *keine* Fehlermeldung.

**Modus A — JSON.** Greift, wenn der getrimmte Text mit `[` oder `{` beginnt.

Akzeptiert wird: ein reines Array, ein Objekt mit `exercises`-Array (= das Exportformat aus 4.6), oder ein einzelnes Objekt. Nicht-Objekte im Array werden übersprungen, ebenso Einträge ohne Namen.

Feldnamen-Aliase:

| Zielfeld | akzeptierte Schlüssel |
|---|---|
| Name | `exercise_name`, `name`, `exercise`, `uebung` |
| Sätze | `target_sets`, `sets`, `saetze`, `sätze` |
| Wdh. | `target_reps`, `reps`, `wdh`, `wiederholungen` |
| Gewicht | `target_weight`, `weight`, `gewicht`, `kg` |

Fehler: „Ungültiges JSON." bei Parse-Fehler, „Kein gültiger Eintrag im JSON gefunden." bei 0 Treffern.

**Modus B — Zeilenweise.** Sonst. Pro Zeile in dieser Reihenfolge:

1. **Aufzählungszeichen entfernen:** führendes `- `, `* `, `• ` sowie `1. ` / `1) `. Leere Zeilen überspringen.

2. **Kopfzeile erkennen** — nur für die allererste nicht-leere Zeile. Sie wird übersprungen, wenn *alle* vier Bedingungen zutreffen: mindestens zwei durch `;`, `,` oder Tab getrennte Felder; das erste Feld enthält `name`/`übung`/`uebung`/`exercise`; alle weiteren Felder sind **keine** Zahlen; die Zeile enthält irgendwo `satz`/`sätze`/`saetze`/`set`/`rep`/`wdh`/`wiederhol`/`gewicht`/`weight`/`kg`.

3. **CSV/TSV-Zweig:** Zeile an `;`, `,` oder Tab trennen. Greift, wenn mindestens zwei Felder vorliegen, das erste nicht leer ist und alle weiteren entweder leer oder Zahlen sind. Zuordnung: Feld 1 Name, Feld 2 Sätze, Feld 3 Wdh., Feld 4 Gewicht.

4. **Freitext-Zweig** (sonst) — Muster „Name SxR @kg":
   - Sätze × Wdh.: `/(\d+)\s*[x×*]\s*(\d+)/i` → erkennt `3x10`, `3 × 10`, `3*10`. Treffer wird aus der Zeile entfernt.
   - Gewicht: `/@\s*([\d.,]+)|([\d.,]+)\s*kg/i` → erkennt `@60` und `60 kg`. Treffer wird entfernt.
   - Was übrig bleibt, ist der Name: Mehrfach-Leerzeichen zusammenziehen, abschließende `-`, `–`, `@` entfernen, trimmen. Leerer Name → Zeile verwerfen.

Fehler bei 0 erkannten Übungen: „Keine Übungen erkannt. Prüfe das Format."

**Beispiel für das Platzhalterfeld:**
```
Bankdrücken Langhantel 3x10 @60
Kniebeuge 4x8 @80
Klimmzüge 3x8
Rudern Kabel 3x12 @50
Plank
```

**Speichern:** über dieselbe `save_plan`-Funktion wie 4.7. Plan-Name ist Pflicht.

### 4.9 Aktives Training — `/workout/:workoutId`

Der wichtigste Screen. Wird im Stehen, zwischen Sätzen, mit einer Hand bedient.

**Daten:** Workout per ID; alle `workout_sets` dieses Workouts, aufsteigend nach `logged_at`; `plan_exercises` des zugehörigen Plans nach `order_index`; Werte der letzten Session (siehe unten).

**Übungsreihenfolge** — in genau dieser Priorität:
1. Plan-Übungen nach `order_index`
2. in dieser Sitzung spontan hinzugefügte Übungen
3. „verwaiste" Übungen: Namen mit geloggten Sätzen, die in keiner der beiden Listen stehen

**Vorschlagswerte aus der letzten Session.** Ermittlung: das letzte **abgeschlossene** Workout desselben Plans desselben Nutzers, das nicht das aktuelle ist. Daraus je Übung ein Referenzsatz.

> **Änderung gegenüber v1:** Dort wurde der Satz mit der höchsten `set_number` genommen — also der *letzte*. Nach einem Dropset war der Vorschlag dadurch absurd niedrig. **Neu: der Satz mit dem höchsten Gewicht; bei Gleichstand der mit den meisten Wiederholungen.**

Ohne Plan (freies Training) gibt es keine Vorschlagswerte.

**Pro Übung wird angezeigt:** Name; bei Plan-Übungen die Zielvorgabe „Ziel: N × M Wdh." (plus „@ X kg" bei Gewicht > 0); Zähler „geloggt/Ziel"; die bereits geloggten Sätze mit Satznummer, `Wdh. × kg`, RIR-Kennzeichnung falls gesetzt, Notiz falls vorhanden; die Werte der letzten Session als Hinweiszeile; verbleibende Sätze.

**Satz-Eingabe:** Felder Wdh. (numerische Tastatur), kg (Dezimaltastatur), RIR (0–10), Speichern-Button, ein- und ausklappbares Notizfeld.

- **Platzhalter zeigen die Werte der letzten Session** — leer gelassene Felder übernehmen genau diese Werte beim Speichern.
- Ohne Vorgängerwerte gilt Wdh. = 0 → Speichern wird abgelehnt, **mit sichtbarer Meldung** („Bitte Wiederholungen eintragen."). In v1 passierte an dieser Stelle wortlos nichts.
- Tastaturfluss: Enter in Wdh. → kg, Enter in kg → RIR, Enter in RIR → speichern.
- Nach dem Speichern werden alle Felder geleert und das Notizfeld eingeklappt.
- `set_number` = bisherige Sätze dieser Übung + 1, unmittelbar vor dem Insert frisch bestimmt (schützt gegen Doppelklicks).
- RIR wird gegen 0–10 validiert, client- **und** datenbankseitig.

**Sätze korrigieren — neu in v2.** Jeder geloggte Satz lässt sich bearbeiten und löschen (mit Rückfrage). Beim Löschen werden die `set_number` der Folgesätze derselben Übung neu durchnummeriert. In v1 war ein Tippfehler wie „1000 kg" dauerhaft in den Daten und verzerrte jede Statistik.

**Mehr Sätze als geplant — neu in v2.** Die Eingabe bleibt sichtbar, auch wenn die Zielsatzzahl erreicht ist. Zusätzliche Sätze werden als solche gekennzeichnet. (In v1 verschwand die Eingabe und Extra-Sätze waren nicht loggbar.)

**Spontane Übung hinzufügen:** Textfeld mit Vorschlägen aus der Historie + Button; Enter genügt. Duplikatprüfung ohne Beachtung der Groß-/Kleinschreibung gegen Plan- und Sitzungsübungen.

**Training abschließen:** dauerhaft erreichbarer Button, gesperrt solange 0 Sätze geloggt sind. Bestätigungsdialog nennt die Satzanzahl. Doppelklick-Schutz. Bei Erfolg wird `finished_at` gesetzt und auf `/stats` weitergeleitet.

**Zustände:** kein `workoutId` → „Kein aktives Training gefunden." + Zurück-Button; Laden; bereits abgeschlossen → Bestätigungsscreen + Zurück zum Dashboard; keine Übungen → „Noch keine Übungen. Füge oben eine Übung hinzu, um zu starten."

**AK-1:** Ein Satz erscheint sofort in der Liste, auch wenn das Gerät offline ist.
**AK-2:** Zwei schnelle Klicks auf Speichern erzeugen keine doppelte `set_number`.
**AK-3:** Nach dem Löschen von Satz 2 von 4 heißen die verbleibenden Sätze 1, 2, 3.

### 4.10 Statistik — `/stats`

**Zweck:** Trainingskonstanz und Kraftentwicklung je Übung sehen.

**Daten:** abgeschlossene Workouts der letzten 180 Tage aufsteigend nach `finished_at`; deren Sätze (paginiert, siehe 3.5). Zuordnung Workout → Tag über `finished_at`, lokal gerechnet.

**Anzeige:**
- Kennzahl „Streak" in Wochen (Definition siehe 3.8)
- Kennzahl „Ø Woche" — Trainings pro Woche
- Auswahlfeld für die Übung (nur bei mehr als einer Übung), Vorauswahl: erste alphabetisch
- Liniendiagramm des Tagesvolumens dieser Übung über die Zeit
- Tooltip: `{Wert} kg·Wdh.` — bei reinen Körpergewichtsübungen `{Wert} Wdh.`

**Zustände:** Laden; Fehler — je nach Ursache zwei getrennte Texte, „Statistiken konnten nicht geladen werden." (Workouts) und „Satzdaten konnten nicht geladen werden." (Sätze), beide mit Wiederholen-Button; leer → „Noch keine Statistiken" + „Schließe dein erstes Training ab, um Daten zu sehen." + Button „Erstes Training starten" → `/`.

**AK:** Bei mehr als 1000 geloggten Sätzen im Zeitraum sind die Volumenwerte vollständig — nicht abgeschnitten.

### 4.11 Wochen-Check-in — `/checkin`

**Zweck:** Wöchentlich Körpergewicht, Ø-Schlaf und Wochenbewertung erfassen.

**Hinweistext:** „1× pro Woche, am besten Sonntagmorgen — Gewicht nüchtern nach dem Aufstehen."

**Aktionen:** Datumsfeld (Vorbelegung heute, kein Datum in der Zukunft wählbar); „Körpergewicht (kg)" (Schrittweite 0,1); „Schlaf Ø (h)" (Schrittweite 0,1); Bewertung 1–5 als Buttons, erneuter Klick auf denselben Wert hebt die Auswahl auf, Beschriftung „1 = mies · 5 = top (Energie/Motivation)"; Button „Check-in speichern"; Verlaufsliste mit Löschen je Eintrag.

**Validierung:** mindestens eines der drei Felder gesetzt, sonst „Bitte mindestens ein Feld ausfüllen."; Gewicht 20–400 kg; Schlaf 0–24 h; Bewertung 1–5. Leere Felder werden als `null` gespeichert.

**Speichern:** Upsert auf `(user_id, checkin_date)` — derselbe Tag wird überschrieben, nicht dupliziert. Existiert bereits ein Eintrag für das gewählte Datum, wird **vor** dem Überschreiben darauf hingewiesen und der bestehende Wert im Formular vorgeladen.

**Löschen:** mit Rückfrage (in v1 ohne).

**Gewichtsverlauf:** Liniendiagramm, erscheint ab **2** Check-ins mit Gewichtsangabe. Aufsteigend nach Datum, Y-Achse mit einem Kilogramm Puffer nach oben und unten.

**Verlaufsliste:** Datum, Gewicht, Schlaf, Bewertung — jeweils nur wenn vorhanden.

### 4.12 Fortschritt — `/progress`

**Zweck:** Körpermaße und Fortschrittsfotos etwa alle vier Wochen erfassen.

#### Maße

**Aktionen:** Datum (nicht in der Zukunft); vier Felder mit Schrittweite 0,1: „Oberarm (angesp.)", „Brust", „Oberschenkel", „Taille"; Button „Maße speichern"; Verlaufsliste mit Löschen.

**Validierung:** mindestens ein Maß, sonst „Bitte mindestens ein Maß eintragen."; jeder Wert 10–300 cm.

**Speichern:** Upsert auf `(user_id, measured_at)` — ein Eintrag pro Tag. (v1: reines Insert, Dubletten möglich.)

#### Fotos

**Aktionen:** Datumsfeld; drei Aufnahmeflächen für die Posen `front` (Vorne), `side` (Seite), `back` (Rücken); Galerie nach Datum gruppiert, absteigend; innerhalb einer Gruppe in der Reihenfolge Vorne → Seite → Rücken; Löschen je Foto mit Rückfrage.

**Upload-Ablauf:**
1. Prüfen: Bildtyp und **maximal 10 MB**; sonst Meldung „Bild ist zu groß (max. 10 MB)."
2. **Vor dem Upload clientseitig verkleinern** — längste Kante maximal 1600 px, JPEG-Qualität 0,85. (Neu — in v1 landeten 12-Megapixel-Originale ungefiltert im Speicher und blähten jedes Backup auf.)
3. Hochladen unter `<user_id>/<photo_date>/<pose>-<timestamp>.<ext>`, `upsert: false`
4. Metadatenzeile in `progress_photos` schreiben
5. **Rollback:** Schlägt Schritt 4 fehl, wird die Datei wieder gelöscht — sonst entstehen Dateileichen. Meldung: „Foto konnte nicht gespeichert werden."

**Anzeige:** Signierte URLs, gültig eine Stunde. Läuft die Stunde ab, während die Seite offen ist, werden sie erneuert. Wird das letzte Foto gelöscht, wird der URL-Zwischenspeicher geleert. (Beides war in v1 fehlerhaft.)

**Löschen:** erst Datei aus dem Speicher, dann Metadatenzeile.

**Zustände:** Laden; leer („Noch keine Fotos hochgeladen."); Upload läuft (betroffene Fläche zeigt Fortschritt, Eingaben gesperrt); fehlende URL → Platzhalter.

### 4.13 Daten & Backup — `/daten`

**Zweck:** Vollständiges Backup aller Daten inklusive Fotodateien erzeugen und wieder einspielen.

#### Export

Erzeugt eine ZIP-Datei `gym-tracker-backup-<YYYY-MM-DD>.zip` (lokales Datum). Aufbau:

```
backup.json                    ← Manifest
photos/<storage_path>          ← Originalbytes, z.B. photos/<uid>/2026-08-15/front-1723.jpg
```

**Manifest:**
```ts
{
  app: 'gym-tracker',
  version: 1,
  exported_at: string,          // ISO-Zeitstempel
  user_id: string,
  data: {                       // alle sieben Tabellen, Zeilen unverändert
    plans, plan_exercises, workouts, workout_sets,
    weekly_checkins, measurements, progress_photos
  },
  photos: { storage_path: string, file: string }[]
}
```

ZIP-Kompression auf Stufe 0 („store") — Fotos sind bereits komprimiert, echte Kompression kostet nur Zeit.

**Alle Abfragen paginiert** (siehe 3.5). Fehlende Fotodateien führen nicht zum Abbruch, sondern werden gezählt und als Warnung gemeldet.

Rückmeldung: „Backup erstellt — N Einträge, M Fotos." und gegebenenfalls „X Fotos im Speicher nicht gefunden – übersprungen."

#### Import

**Schritt 1 — Prüfen, ohne zu schreiben.** Die gewählte Datei wird gelesen und validiert:

| Problem | Meldung |
|---|---|
| kein gültiges ZIP | „Die Datei ist kein gültiges ZIP-Backup." |
| `backup.json` fehlt | „backup.json fehlt im Archiv — kein gültiges Backup." |
| JSON beschädigt | „backup.json ist beschädigt." |
| `app` oder `version` unpassend | „Unbekanntes Backup-Format." |
| ein Datenfeld ist kein Array | „Unbekanntes Backup-Format." |
| `user_id` stimmt nicht überein | „Dieses Backup gehört zu einem anderen Konto." |

Fehlende Datenfelder gelten als leeres Array, nicht als Fehler.

**Schritt 2 — Bestätigungsdialog** mit Inhaltsübersicht (Pläne, Übungen, Workouts, Sätze, Check-ins, Messungen, Fotos) und dem Hinweis: „Bestehende Einträge mit gleicher ID werden überschrieben." Während der Wiederherstellung ist der Dialog nicht schließbar.

**Schritt 3 — Wiederherstellen**, in dieser Reihenfolge (Abhängigkeiten):

1. `plans` — `user_id` wird auf den **aktuellen** Nutzer gesetzt
2. `plan_exercises`
3. `workouts` — `user_id` ebenso
4. `workout_sets`
5. `weekly_checkins` — Sonderfall, siehe unten
6. `measurements`
7. Fotos: erst Datei in den Speicher (`upsert: true`), dann die Metadatenzeile — und **nur** für Dateien, die tatsächlich angekommen sind
8. `progress_photos`

Alle Upserts laufen in Blöcken zu 500 Zeilen, Schlüssel ist die `id`.

**Sonderfall Check-ins:** Ein Konflikt auf `UNIQUE(user_id, checkin_date)` lässt sich per `onConflict: 'id'` nicht auflösen. Deshalb: bei Fehlschlag des Blocks zeilenweise erneut versuchen. **Neu in v2:** Kollidierende Zeilen werden nicht übersprungen, sondern per Datum aktualisiert. Nur wirklich unlösbare Fälle werden gezählt und gemeldet.

**Foto-Upload-Fallback:** Fehlt die UPDATE-Policy auf dem Bucket, scheitert `upsert: true`. Dann Datei löschen und mit `upsert: false` erneut hochladen. MIME-Typ aus der Dateiendung ableiten (`png`, `webp`, `gif`, `heic`, `heif`, sonst `image/jpeg`).

**Grundsatz:** Wiederherstellen ist rein additiv. Es wird nichts gelöscht, was nicht im Backup steht.

Rückmeldung: „Wiederhergestellt: N Pläne, M Workouts, K Fotos." plus Warnungen für übersprungene Einträge.

**AK:** Ein Backup mit 5000 geloggten Sätzen enthält alle 5000 — nicht die ersten 1000.

---

## 5. Bewusste Änderungen gegenüber v1

Alle Funktionen bleiben erhalten. Diese Punkte werden geändert, weil sie in v1 nachweislich falsch oder gefährlich waren.

### Muss — sonst ist v2 kaputt

| # | Problem in v1 | Lösung in v2 | Abschnitt |
|---|---|---|---|
| 1 | Zwei auseinanderlaufende Schemastände: `001_init.sql` ohne `with check`, `setup.sql` mit — plus `fix-policies.sql` als Pflaster | Eine einzige `setup.sql`, alle Policies mit `using` **und** `with check` | 2 |
| 2 | Abfragen ohne Paginierung → Backup und Statistik ab 1000 Zeilen still unvollständig | `fetchAll`-Helfer überall | 3.5 |
| 3 | Planbearbeitung nicht transaktional → Übungen können verloren gehen | `save_plan`-Funktion in Postgres | 4.7 |
| 4 | Drei Stellen scheitern wortlos: Trainingsstart, Satz-Insert, sämtliche Löschungen | Toast bei jedem Fehlschlag, ausnahmslos | 3.2 |
| 5 | Optimistisches Löschen → Eintrag verschwindet, obwohl er noch existiert | Erst Bestätigung der DB abwarten | 3.2 |
| 6 | Fünf Screens hängen dauerhaft im Ladezustand, wenn `user.id` fehlt; der Planeditor hat gar keinen | Ladezustand überall vorhanden und immer auflösend | 3.3 |
| 7 | Keine 404-Route → weiße Seite | Catch-all-Route | 3.7 |

### Sollte — deutlicher Gewinn im Alltag

| # | Problem in v1 | Lösung in v2 | Abschnitt |
|---|---|---|---|
| 8 | Keine Offline-Fähigkeit, obwohl PWA und Nutzung im Studio | Lokales Speichern + Sync-Warteschlange | 3.6 |
| 9 | Streak zählt Kalendertage → bei Ruhetagen wertlos | Streak zählt Wochen | 3.8 |
| 10 | Sätze nicht korrigierbar → Tippfehler bleiben für immer | Bearbeiten und Löschen von Sätzen | 4.9 |
| 11 | Eingabe verschwindet bei erreichter Zielsatzzahl | Zusätzliche Sätze bleiben loggbar | 4.9 |
| 12 | Vorschlagswert = letzter Satz statt bester | Bester Satz (höchstes Gewicht) | 4.9 |
| 13 | Körpergewichtsübungen zeigen Volumen 0 | Auswertung nach Wiederholungen | 3.8 |
| 14 | Fotos ohne Größenbegrenzung | 10 MB Grenze + Verkleinern auf 1600 px | 4.12 |
| 15 | Löschen ohne Rückfrage bei Check-ins, Maßen, Fotos | Rückfrage überall | 3.4 |
| 16 | Kein Passwort-Bestätigungsfeld bei der Registrierung, Mindestlänge 6 | Zweites Feld, Mindestlänge 8 — in Registrierung und Passwort-Reset gleich | 4.2, 4.4 |
| 17 | Parallel offene Workouts unbemerkt möglich | Hinweis im Dashboard | 4.5 |
| 18 | Übungsnamen als Freitext → Tippfehler spalten Statistiken | Vorschläge aus der Historie | 3.9 |
| 19 | Mehrere Messungen am selben Tag | Unique-Constraint + Upsert | 2.6 |
| 20 | Backup-Dateiname in UTC | Lokales Datum | 3.1 |
| 21 | Keine Wertebereichsprüfung in der Datenbank (RIR, Gewicht, Maße, Schlaf) und kein einziger Index | `CHECK`-Constraints und zwei Indizes ergänzt | 2 |

### Bewusst nicht geändert

- **Kein „Freies Training" ohne Plan.** In v1 nicht startbar; bleibt so. Wer spontan trainiert, legt einen Plan an oder nutzt spontane Übungen innerhalb eines bestehenden.
- **Zwei getrennte Exportformate** (Plan als `.json`, Komplettbackup als `.zip`). Unterschiedliche Zwecke, beide bleiben.
- **Kein Pausen-Timer.** War nicht drin und ist kein Teil dieser Spec.
- **Keine Übungs-Stammtabelle.** Siehe Begründung unter 2.4.

---

## 6. Tests

Diese Punkte sind ohne Test nicht abnehmbar, weil sie in v1 nachweislich falsch waren:

**Parser (`parsePlan`) — Unit-Tests.** Mindestens: leerer Text; JSON-Array; JSON mit `exercises`-Schlüssel; einzelnes JSON-Objekt; kaputtes JSON; deutsche Feldnamen-Aliase; CSV mit Semikolon; CSV mit Komma; TSV; Kopfzeile wird übersprungen; Kopfzeile wird *nicht* übersprungen, wenn sie Zahlen enthält; Aufzählungszeichen `-`, `*`, `•`, `1.`, `1)`; Freitext `3x10 @60`; Freitext `3 × 10 60 kg`; Dezimalkomma `62,5`; Zeile nur mit Namen (Standardwerte greifen); Zeile, die nur aus einem Aufzählungszeichen besteht.

**Formeln — Unit-Tests.** Volumen; Streak über Wochengrenzen und Jahreswechsel; Ø Trainings/Woche; Auswahl des besten Vorgängersatzes bei Gleichstand.

**Datum — Unit-Tests.** `localDateStr` um 23:59 und 00:01 lokaler Zeit, mit einer Zeitzone ungleich UTC.

**Paginierung — Integrationstest.** Backup-Export mit über 1000 Sätzen erzeugt ein Backup mit allen Sätzen.

**Transaktion — Integrationstest.** `save_plan` mit einem ungültigen Übungseintrag lässt den bestehenden Plan unverändert.

**RLS — Integrationstest.** Nutzer A kann Zeilen von Nutzer B in keiner der sieben Tabellen lesen, ändern oder löschen. Ebenso für Storage-Objekte.

---

## 7. Umsetzungsreihenfolge

Jede Stufe ist für sich lauffähig und testbar.

| Stufe | Inhalt | Ergebnis |
|---|---|---|
| **1** | Projektgerüst, Supabase-Anbindung, `setup.sql`, RLS, Auth-Kontext | Anmeldung funktioniert, DB steht |
| **2** | Auth-Screens 4.1–4.4 vollständig | Registrieren, anmelden, Passwort zurücksetzen |
| **3** | Layout, Navigation, geschützte Routen, 404 | App ist navigierbar |
| **4** | Pläne: Liste, Editor, `save_plan` | Pläne anlegen und ändern |
| **5** | **Aktives Training** inkl. Sätze bearbeiten/löschen | Kernfunktion nutzbar |
| **6** | Dashboard mit Start-/Fortsetzen-Logik | Runder Trainingsablauf |
| **7** | Statistik | Auswertung |
| **8** | Check-in und Fortschritt | Körperdaten |
| **9** | Planimport inkl. Parser-Tests | Import |
| **10** | Backup: Export und Import | Datensicherheit |
| **11** | Offline-Warteschlange (3.6) | Studiotauglich |

Stufe 5 ist die Kernfunktion — sie zuerst richtig zu bauen ist wichtiger als jede andere Stufe. Stufe 11 kann nachgezogen werden, ist aber der Unterschied zwischen „funktioniert zu Hause" und „funktioniert im Studio".

---

## 8. Offene Punkte

Diese Fragen sind vor der jeweiligen Stufe zu klären:

1. **E-Mail-Bestätigung** in Supabase aktiv oder nicht? Beeinflusst 4.2. Empfehlung: aktiv lassen.
2. **Aufbewahrungszeitraum der Statistik** — 180 Tage wie in v1, oder mehr? Bei mehr wird Paginierung noch wichtiger.
3. **e1RM** (3.8) als zweite Diagrammlinie neben dem Volumen — gewünscht oder Ballast?
