# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A standalone GitHub Dashboard single-page app built with the **DC (Design Component)** framework — a React-based component runtime bundled into `support.js`. The entire application lives in `GitHub Dashboard.dc.html`.

## Files

- **`GitHub Dashboard.dc.html`** — The application: template + component logic in one file. Do not rename; the `.dc.html` extension is meaningful to the DC runtime.
- **`support.js`** — The DC runtime bundle. Header says: *"GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`."* Do not hand-edit this file.
- **`uploads/`** — Static screenshot/thumbnail images.

## DC Framework Conventions

The `.dc.html` file has two parts inside `<body>`:

**Template** (`<x-dc>` block) — HTML using DC-specific elements:
- `<sc-if value="{{ expr }}">` — conditional render; `hint-placeholder-val` sets the fallback shown while streaming
- `<sc-for list="{{ expr }}" as="item">` — list render; `hint-placeholder-count` sets placeholder count
- `{{ expr }}` — interpolation; supports dot paths, `!`, `===`, `!==`
- `style-hover="..."`, `style-focus="..."` — pseudo-class styles (compiled to injected CSS classes)
- `<helmet>` — injects children into `<head>`

**Logic** (`<script type="text/x-dc" data-dc-script data-props="...">`) — a class extending `DCLogic`:
- `state = {...}` — component state
- `setState(patch, cb?)` — triggers re-render (same API as React)
- `componentDidMount()` / `componentWillUnmount()` / `componentDidUpdate(prevProps)` — lifecycle hooks
- `renderVals()` — **key method**: returns a flat object that the template renders against. All template bindings (`{{ x }}`) resolve against this object, not raw state. The current pattern merges props into state-derived values for the return.
- `this.props` — the configurable props declared in `data-props` JSON on the script tag

**Props schema** (in `data-props` attribute on the script tag):
```json
{
  "$preview": {"width": 1400, "height": 900},
  "refreshInterval": {"editor": "int", "default": 10, "min": 5, "max": 120, "step": 5, "tsType": "number"},
  "maxPRs":          {"editor": "int", "default": 6,  "min": 1, "max": 15,  "step": 1, "tsType": "number"},
  "columns":         {"editor": "enum", "options": ["2","3"], "default": "3", "tsType": "\"2\" | \"3\""},
  "showDependabot":  {"editor": "boolean", "default": true, "tsType": "boolean"}
}
```

## Application Architecture

**Auth flow**: PAT entered → stored in `localStorage('gh_dash_pat')` → `initLoad()` fetches `/user` → on success, fetches all repos and triggers card loads.

**State management**: All state lives in the single `Component` class. `renderVals()` computes the full derived view-model on every render — it returns all the values the template needs, including closures used as event handlers.

**Data fetching**:
- `gfetch(path)` — wraps GitHub REST API calls with the stored PAT
- `fetchAllRepos()` — paginates up to 3 pages of `/user/repos`
- `fetchCard(fullName)` — loads PRs + last commit + Dependabot alerts for one repo; checks CI via check-runs API (falls back to commit status API)

**Persistence** (all in `localStorage`):
- `gh_dash_pat` — GitHub Personal Access Token
- `gh_dash_favs` — JSON array of pinned repo full names (e.g. `["owner/repo"]`)
- `gh_dep_hist` — JSON object mapping repo full names to arrays of `{count, ts}` snapshots for Dependabot trend calculation

**Card ordering**: Cards are always sorted by `lastCommit` descending in `getSortedFavorites()`. Drag-and-drop reorders the `favorites` array in localStorage, but sort is re-applied on next render.

**Auto-refresh**: A 1-second tick interval counts down `countdownSec`; when it hits zero it calls `refreshAll()`. The countdown visualization is a `conic-gradient`.

**CI status aggregation**: Per-PR CI status is checked via check-runs; the card header shows an aggregate dot (failure > pending > all-success > unknown).

## Running the App

Open `GitHub Dashboard.dc.html` directly in a browser (file:// works) or serve it with any static file server. The runtime loads React 18 from unpkg CDN on first load.

```bash
# Quick local server
python3 -m http.server 8080
# then open http://localhost:8080/GitHub%20Dashboard.dc.html
```

Required GitHub PAT scopes: `repo` (PRs, private repos) and `security_events` (Dependabot alerts).
