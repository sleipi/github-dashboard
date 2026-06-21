# Migration Feature Checklist

Vergleich: Original DC-Framework-Dashboard → neue Bun + TypeScript + HTMX Implementierung.

Verifiziert am 2026-06-20 gegen Branch `main` (letzter Commit: `d13f675`).

---

## Auth & Setup

- [x] Setup-Seite erscheint wenn kein Token gespeichert ist
- [x] PAT-Eingabefeld (type=password)
- [ ] Connect-Button zeigt "Verbinde…" während Validierung läuft ⚠️ *(nicht implementiert — kein HTMX-Indikator auf dem Button)*
- [x] Enter-Taste im PAT-Feld löst Submit aus *(via HTML form)*
- [x] Fehlermeldung bei ungültigem Token
- [x] Required-Scopes werden in der Setup-Seite angezeigt (`repo`, `security_events`)
- [ ] Hinweis "Token wird nur lokal gespeichert" ⚠️ *(nicht in `page-template.ts` renderSetupPage() vorhanden)*
- [x] Nach erfolgreichem Login: Redirect zum Dashboard
- [x] Abmelden löscht Token und leitet zur Setup-Seite

---

## Header

- [ ] GitHub-Logo + "Dashboard" Titel ⚠️ *(kein SVG/Icon — nur Text "Dashboard")*
- [ ] Avatar des eingeloggten Users ⚠️ *(kein `<img>`-Tag mit `avatarUrl` in `renderDashboard()` — Gap #5)*
- [x] Username des eingeloggten Users
- [x] "Aktualisieren"-Button (löst HTMX-Refresh aus)
- [x] "Repo hinzufügen"-Button (öffnet Modal)
- [x] "Abmelden"-Button

---

## Dashboard Layout & Auto-Refresh

- [x] Cards-Grid mit 3 Spalten *(hardcoded — `repeat(3,minmax(0,1fr))`)*
- [x] Auto-Refresh alle 10 Sekunden via HTMX `hx-trigger="every 10s"`
- [x] HTMX `cardsChanged`-Event triggert sofortigen Refresh nach Pin/Unpin/Reorder
- [ ] Countdown-Indikator (conic-gradient, unten rechts) ⚠️ *(Gap #10 — nicht implementiert)*
- [x] Cards sortiert nach `sort_order` (Drag-&-Drop-Reihenfolge)
- [x] Empty-State "Noch keine Repos gepinnt" wenn keine Cards vorhanden

---

## Card — Allgemein

- [x] Card-Rahmen farblich nach Alter des letzten Commits: *(implementiert in `commitBorderStyle()`, Commit 98fe21c)*
  - [x] `< 1h` → helles Grün (`#2ea043`) + Glow
  - [x] `< 1 Tag` → mittleres Grün (`#1a6b32`) + schwacher Glow *(verifiziert: 2h-alter Commit → `border-color: #1a6b32; box-shadow: 0 0 0 1px #1a6b3266`)*
  - [x] `< 3 Tage` → dunkles Grün (`#1a4228`)
  - [x] `> 3 Tage` → Grau (`#30363d`)
- [x] Drag & Drop: Card wird halbdurchsichtig (opacity 0.4) beim Ziehen *(CLIENT_SCRIPT: `c.style.opacity = '0.4'`)*
- [ ] Drag & Drop: Ziel-Card erhält blauen Rahmen (`#2f81f7`) ⚠️ *(Gap #2 — kein `dragenter`/`dragover` Border-Styling im CLIENT_SCRIPT)*
- [x] Drag & Drop: Reihenfolge wird in DB persistiert (POST /api/cards/reorder)

---

## Card — Header

- [ ] Repo-Icon (SVG) ⚠️ *(kein SVG-Icon in `card-template.ts`)*
- [x] Link `owner/name` → öffnet GitHub-Repo in neuem Tab
- [x] Aggregierter CI-Dot (success/failure/pending/unknown) mit Tooltip
- [x] Refresh-Button pro Card (lädt nur diese Card neu)
- [ ] Refresh-Button zeigt Spin-Animation während Laden ⚠️ *(Gap #7 — `@keyframes spin` in styles.ts vorhanden, aber kein `htmx-request`-Indikator eingebunden)*
- [x] Entfernen-Button (×) — unpin + Refresh

---

## Card — Zustände

- [ ] **Loading-Skeleton**: 3 shimmer-animierte Zeilen beim ersten Laden ⚠️ *(Gap #3 — `.skeleton`-CSS in styles.ts vorhanden, aber nicht in HTMX-Request-Flow eingebunden)*
- [ ] **Error-State**: Rotes Fehler-Icon + Fehlermeldung wenn GitHub-API-Aufruf scheitert ⚠️ *(Gap #4 — Card-Route hat kein try/catch; bei GitHub-Fehler werden Cards via `Promise.allSettled` still gedroppt)*
- [x] **Loaded-State**: normaler Card-Inhalt

---

## Card — Inhalt

- [x] Letzter Commit: relative Zeitangabe ("vor 2 Std.", "Gerade eben", etc.)
- [x] Dependabot-Alert-Anzahl mit Farb-Codierung:
  - [x] 0 Alerts → Grün (`#3fb950`)
  - [x] 1–5 Alerts → Gelb (`#d29922`)
  - [x] > 5 Alerts → Rot (`#f85149`)
  - [x] kein Zugriff (null) → Grau + `—`
- [x] Dependabot-Link → öffnet Security-Seite des Repos
- [x] Dependabot-Trend in Klammern `(+2, -1)` wenn Verlaufsdaten vorhanden *(verifiziert: awesome-project zeigt `(-2)`)*
- [x] Dependabot `···`-Indikator wenn Verlauf noch aufgebaut wird *(verifiziert: another-repo zeigt `···`)*
- [x] PR-Sektion mit "PULL REQUESTS"-Label + Count-Badge
- [x] PR-Zeilen:
  - [x] CI-Dot pro PR (success/failure/pending/unknown)
  - [x] PR-Nummer (`#42`)
  - [x] PR-Titel (gekürzt mit text-overflow)
  - [x] "Draft"-Badge für Draft-PRs
  - [ ] Externer Link-Icon ⚠️ *(Gap #8 — nicht in `card-template.ts` implementiert)*
  - [x] Klick öffnet PR auf GitHub (target=_blank)
- [x] "Keine offenen PRs" mit Checkmark wenn PR-Liste leer
- [x] "+ N weitere PRs"-Button wenn mehr als 6 PRs vorhanden → öffnet PR-Modal

---

## PR-Modal

- [x] Öffnet bei Klick auf "+ N weitere PRs"
- [x] Header: "Pull Requests" + Repo-Name
- [x] Spalten: `#`, Titel, Labels, Ersteller, Erstellt, Aktualisiert
- [x] PR-Zeilen mit:
  - [x] CI-Dot + PR-Nummer
  - [x] Titel + Draft-Badge
  - [x] Labels als farbige Chips (Farbe aus GitHub-Label-Color)
  - [x] Ersteller
  - [x] Erstellt (relativ)
  - [x] Aktualisiert (relativ)
- [x] Klick auf PR → öffnet GitHub in neuem Tab
- [ ] Escape-Taste schließt Modal ⚠️ *(Gap #6 — kein `keydown`-Handler in CLIENT_SCRIPT)*
- [x] Klick auf Backdrop schließt Modal
- [x] ×-Button schließt Modal

---

## Repo-Modal ("Repos verwalten")

- [x] Öffnet bei Klick auf "Repo hinzufügen"
- [x] Such-Eingabe mit Live-Filter (client-side)
- [x] Leerer Suchzustand: zeigt alle Repos (bis 100)
- [x] Repo-Zeilen:
  - [x] Checkbox (grün wenn gepinnt, leer wenn nicht)
  - [x] `owner/name`-Format
  - [x] "Privat"-Badge für private Repos
  - [x] Aktualisiert (relativ)
  - [x] Sprache
  - [x] Stern-Count (nur wenn > 0)
- [x] Klick auf Zeile → Pin/Unpin + sofortiger `cardsChanged`-Event
- [ ] Loading-Zustand während Repos geladen werden ⚠️ *(Gap #9 — kein HTMX `hx-indicator` im Modal)*
- [ ] Escape-Taste schließt Modal ⚠️ *(Gap #6 — kein `keydown`-Handler)*
- [x] Klick auf Backdrop schließt Modal
- [x] ×-Button schließt Modal

---

## CI-Status

- [x] Check-Runs API (`/commits/:sha/check-runs`) als primäre Quelle
- [x] Commit-Status API (`/commits/:sha/status`) als Fallback wenn keine Check-Runs
- [x] Status-Mapping: success / failure (inkl. timed_out, cancelled, action_required) / pending / unknown
- [x] CI-Status für erste 3 PRs pro Card überprüft *(Original: 6 — bewusste Entscheidung für Rate-Limit-Schutz)*
- [x] Restliche PRs erhalten `ciStatus: 'unknown'`

---

## Dependabot-Verlauf

- [x] Snapshot wird max. alle 30 Minuten aufgezeichnet
- [x] Snapshots älter als 183 Tage werden gelöscht
- [x] Trend-Berechnung: Δ zu Wert vor ~1 Woche, ~1 Monat, ~6 Monaten
- [x] Keine Trend-Anzeige wenn Verlaufsdaten zu jung sind (minAge-Prüfung)

---

## Keyboard & Accessibility

- [ ] Escape schließt PR-Modal ⚠️ *(nicht implementiert)*
- [ ] Escape schließt Repo-Modal ⚠️ *(nicht implementiert)*
- [x] Enter im PAT-Feld löst Submit aus *(via HTML form)*
- [x] Alle Links haben `rel="noopener noreferrer"` bei `target="_blank"`

---

## Offene Gaps — nächste Session

| # | Feature | Priorität | Wo implementieren |
|---|---------|-----------|-------------------|
| 2 | Drag-Ziel erhält blauen Rahmen (`#2f81f7`) | **P0** | `dragenter`/`dragover` Handler in `CLIENT_SCRIPT` (page-template.ts) |
| 4 | Error-State per Card | **P1** | `card-route.ts`: try/catch → Error-HTML; `card-template.ts`: `renderCardError()` |
| 5 | Avatar im Header | **P1** | `renderDashboard(cardsHtml, token)` → `<img src="${avatarUrl}">` |
| 6 | Escape-Taste schließt Modals | **P1** | `document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.innerHTML='' })` in CLIENT_SCRIPT |
| 7 | Refresh-Button Spin-Animation | **P2** | `hx-indicator` auf Refresh-Button + `.htmx-request` CSS in styles.ts |
| 8 | Externer Link-Icon bei PR-Zeilen | **P2** | SVG-Icon in `card-template.ts` PR-Row |
| 9 | Modal Loading-Spinner | **P2** | `hx-indicator` auf "+ Repo hinzufügen"-Button |
| 10 | Countdown-Indikator | **P2** | Client-JS + CSS in `page-template.ts` |
| — | "Token wird nur lokal gespeichert" Hinweis | **P2** | `renderSetupPage()` in `page-template.ts` |
| — | GitHub-Logo im Header | **P2** | SVG-Octicon in `renderDashboard()` |
| — | Connect-Button Loading-State | **P2** | HTMX `hx-indicator` oder `disabled` via JS auf Submit |
| 11 | Konfigurierbare Spaltenanzahl (2/3) | **P3** | ENV-Variable oder settings-Tabelle |
| 3 | Loading-Skeleton per Card | **P3** | HTMX `hx-indicator` auf Card-Container |
