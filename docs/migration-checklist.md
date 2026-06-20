# Migration Feature Checklist

Vergleich: Original DC-Framework-Dashboard → neue Bun + TypeScript + HTMX Implementierung.

Prüfe jedes Feature nach Abschluss der jeweiligen Phase ab. Features mit ⚠️ sind im Plan nicht explizit abgedeckt und müssen während der Implementierung ergänzt werden.

---

## Auth & Setup

- [ ] Setup-Seite erscheint wenn kein Token gespeichert ist
- [ ] PAT-Eingabefeld (type=password)
- [ ] Connect-Button zeigt "Verbinde…" während Validierung läuft ⚠️ *(Plan: Button disabled state fehlt)*
- [ ] Enter-Taste im PAT-Feld löst Submit aus *(HTML form submit deckt das ab)*
- [ ] Fehlermeldung bei ungültigem Token
- [ ] Required-Scopes werden in der Setup-Seite angezeigt (`repo`, `security_events`)
- [ ] Hinweis "Token wird nur lokal gespeichert"
- [ ] Nach erfolgreichem Login: Redirect zum Dashboard
- [ ] Abmelden löscht Token und leitet zur Setup-Seite

---

## Header

- [ ] GitHub-Logo + "Dashboard" Titel
- [ ] Avatar des eingeloggten Users ⚠️ *(Plan: avatar_url wird gespeichert aber img-Tag fehlt im Template)*
- [ ] Username des eingeloggten Users
- [ ] "Aktualisieren"-Button (löst HTMX-Refresh aus)
- [ ] "Repo hinzufügen"-Button (öffnet Modal)
- [ ] "Abmelden"-Button

---

## Dashboard Layout & Auto-Refresh

- [ ] Cards-Grid mit 3 Spalten *(hardcoded — war im Original konfigurierbar: 2 oder 3)* ⚠️ *P2: ggf. via env-var oder settings-Tabelle ergänzen*
- [ ] Auto-Refresh alle 10 Sekunden via HTMX `hx-trigger="every 10s"`
- [ ] HTMX `cardsChanged`-Event triggert sofortigen Refresh nach Pin/Unpin/Reorder
- [ ] Countdown-Indikator (conic-gradient, unten rechts) ⚠️ *(Plan: nicht enthalten — war im Original ein Kreis-Countdown)*
- [ ] Cards sortiert nach `sort_order` (Drag-&-Drop-Reihenfolge)
- [ ] Empty-State "Noch keine Repos gepinnt" wenn keine Cards vorhanden

---

## Card — Allgemein

- [ ] Card-Rahmen farblich nach Alter des letzten Commits: ⚠️ *(fehlt im Template-Code des Plans)*
  - [ ] `< 1h` → helles Grün (`#2ea043`) + Glow
  - [ ] `< 1 Tag` → mittleres Grün (`#1a6b32`) + schwacher Glow
  - [ ] `< 3 Tage` → dunkles Grün (`#1a4228`)
  - [ ] `> 3 Tage` → Grau (`#30363d`)
- [ ] Drag & Drop: Card wird halbdurchsichtig (opacity 0.4) beim Ziehen ⚠️ *(JS im Plan vorhanden, aber CSS-Klasse im Template fehlt)*
- [ ] Drag & Drop: Ziel-Card erhält blauen Rahmen (`#2f81f7`) ⚠️ *(fehlt im Template)*
- [ ] Drag & Drop: Reihenfolge wird in DB persistiert (POST /api/cards/reorder)

---

## Card — Header

- [ ] Repo-Icon (SVG)
- [ ] Link `owner/name` → öffnet GitHub-Repo in neuem Tab
- [ ] Aggregierter CI-Dot (success/failure/pending/unknown) mit Tooltip
- [ ] Refresh-Button pro Card (lädt nur diese Card neu)
- [ ] Refresh-Button zeigt Spin-Animation während Laden ⚠️ *(Plan: HTMX-Request-Indikator fehlt — `htmx-request` CSS-Klasse nutzen)*
- [ ] Entfernen-Button (×) — unpin + Refresh

---

## Card — Zustände

- [ ] **Loading-Skeleton**: 3 shimmer-animierte Zeilen beim ersten Laden ⚠️ *(Plan: fehlt — bei HTMX-Requests zeigt HTMX einen Request-State, aber kein Skeleton)*
- [ ] **Error-State**: Rotes Fehler-Icon + Fehlermeldung wenn GitHub-API-Aufruf scheitert ⚠️ *(Plan: route gibt immer 200 zurück — Fehlerbehandlung im Template fehlt)*
- [ ] **Loaded-State**: normaler Card-Inhalt

---

## Card — Inhalt

- [ ] Letzter Commit: relative Zeitangabe ("vor 2 Std.", "Gerade eben", etc.)
- [ ] Dependabot-Alert-Anzahl mit Farb-Codierung:
  - [ ] 0 Alerts → Grün (`#3fb950`)
  - [ ] 1–5 Alerts → Gelb (`#d29922`)
  - [ ] > 5 Alerts → Rot (`#f85149`)
  - [ ] kein Zugriff (null) → Grau + `—`
- [ ] Dependabot-Link → öffnet Security-Seite des Repos
- [ ] Dependabot-Trend in Klammern `(+2, -1)` wenn Verlaufsdaten vorhanden (1W, 1M, 6M)
- [ ] Dependabot `···`-Indikator wenn Verlauf noch aufgebaut wird (< 3 Datenpunkte)
- [ ] PR-Sektion mit "PULL REQUESTS"-Label + Count-Badge
- [ ] PR-Zeilen:
  - [ ] CI-Dot pro PR (success/failure/pending/unknown)
  - [ ] PR-Nummer (`#42`)
  - [ ] PR-Titel (gekürzt mit text-overflow)
  - [ ] "Draft"-Badge für Draft-PRs
  - [ ] Externer Link-Icon ⚠️ *(Plan: fehlt im Template)*
  - [ ] Klick öffnet PR auf GitHub (target=_blank)
- [ ] "Keine offenen PRs" mit Checkmark wenn PR-Liste leer
- [ ] "+ N weitere PRs"-Button wenn mehr als 6 PRs vorhanden → öffnet PR-Modal

---

## PR-Modal

- [ ] Öffnet bei Klick auf "+ N weitere PRs"
- [ ] Header: "Pull Requests" + Repo-Name
- [ ] Spalten: `#`, Titel, Labels, Ersteller, Erstellt, Aktualisiert
- [ ] PR-Zeilen mit:
  - [ ] CI-Dot + PR-Nummer
  - [ ] Titel + Draft-Badge
  - [ ] Labels als farbige Chips (Farbe aus GitHub-Label-Color)
  - [ ] Ersteller
  - [ ] Erstellt (relativ)
  - [ ] Aktualisiert (relativ)
- [ ] Klick auf PR → öffnet GitHub in neuem Tab
- [ ] Escape-Taste schließt Modal ⚠️ *(Plan: nur onclick-overlay, kein keydown-Handler)*
- [ ] Klick auf Backdrop schließt Modal
- [ ] ×-Button schließt Modal

---

## Repo-Modal ("Repos verwalten")

- [ ] Öffnet bei Klick auf "Repo hinzufügen"
- [ ] Such-Eingabe mit Live-Filter (client-side)
- [ ] Leerer Suchzustand: zeigt alle Repos (bis 100)
- [ ] Repo-Zeilen:
  - [ ] Checkbox (grün wenn gepinnt, leer wenn nicht)
  - [ ] `owner/name`-Format
  - [ ] "Privat"-Badge für private Repos
  - [ ] Aktualisiert (relativ)
  - [ ] Sprache
  - [ ] Stern-Count (nur wenn > 0)
- [ ] Klick auf Zeile → Pin/Unpin + sofortiger `cardsChanged`-Event
- [ ] Loading-Zustand während Repos geladen werden ⚠️ *(Plan: getAllRepos() ist async — kein Loading-Spinner im Modal)*
- [ ] Escape-Taste schließt Modal ⚠️ *(Plan: nur onclick-overlay)*
- [ ] Klick auf Backdrop schließt Modal
- [ ] ×-Button schließt Modal

---

## CI-Status

- [ ] Check-Runs API (`/commits/:sha/check-runs`) als primäre Quelle
- [ ] Commit-Status API (`/commits/:sha/status`) als Fallback wenn keine Check-Runs
- [ ] Status-Mapping: success / failure (inkl. timed_out, cancelled, action_required) / pending / unknown
- [ ] CI-Status für erste 3 PRs pro Card überprüft *(Original: 6 — bewusste Entscheidung für Rate-Limit-Schutz)*
- [ ] Restliche PRs erhalten `ciStatus: 'unknown'`

---

## Dependabot-Verlauf

- [ ] Snapshot wird max. alle 30 Minuten aufgezeichnet
- [ ] Snapshots älter als 183 Tage werden gelöscht
- [ ] Trend-Berechnung: Δ zu Wert vor ~1 Woche, ~1 Monat, ~6 Monaten
- [ ] Keine Trend-Anzeige wenn Verlaufsdaten zu jung sind (minAge-Prüfung)

---

## Keyboard & Accessibility

- [ ] Escape schließt PR-Modal ⚠️
- [ ] Escape schließt Repo-Modal ⚠️
- [ ] Enter im PAT-Feld löst Submit aus *(via HTML form)*
- [ ] Alle Links haben `rel="noopener noreferrer"` bei `target="_blank"`

---

## Gaps-Zusammenfassung

Die folgenden Features sind im Original vorhanden aber **nicht explizit in den Implementierungsplänen** beschrieben. Sie müssen während Phase 3 (Templates/Routes) ergänzt werden:

| # | Feature | Priorität | Wo ergänzen |
|---|---|---|---|
| 1 | Card-Border nach Commit-Alter | **P0** | `card-template.ts` → `toCardViewModel()` + CSS |
| 2 | Drag-&-Drop-Feedback (opacity, blauer Rahmen) | **P0** | `card-template.ts` + Client-JS |
| 3 | Loading-Skeleton per Card | **P1** | `card-template.ts` + HTMX `htmx-request`-Klasse |
| 4 | Error-State per Card | **P1** | Route-Handler: bei Exception → Error-HTML zurückgeben |
| 5 | Avatar im Header | **P1** | `page-template.ts` → `renderDashboard()` |
| 6 | Escape-Taste schließt Modals | **P1** | Client-JS in `page-template.ts` |
| 7 | Refresh-Button Spin-Animation | **P2** | HTMX `htmx-request` CSS + Template |
| 8 | Externer Link-Icon bei PR-Zeilen | **P2** | `card-template.ts` |
| 9 | Modal Loading-Spinner | **P2** | HTMX `hx-indicator` in `modal-template.ts` |
| 10 | Countdown-Indikator | **P2** | Client-JS + CSS in `page-template.ts` |
| 11 | Konfigurierbare Spaltenanzahl (2/3) | **P2** | Settings-Tabelle oder ENV-Variable |

---

## So nutzen

1. Nach jeder Phase: jeweilige Abschnitte abhaken
2. Alle ⚠️-Items **vor** Fertigstellung von Phase 3 Task 11–12 einplanen
3. Checklist ist fertig wenn alle `[ ]` zu `[x]` geworden sind
