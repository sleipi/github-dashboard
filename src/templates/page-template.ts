import { escapeHtml } from './formatters.ts'
import { DASHBOARD_CSS } from './styles.ts'

const CLIENT_SCRIPT = `
let _dragIdx = -1;
document.addEventListener('dragstart', e => {
  const c = e.target.closest('[data-card-name]');
  if (!c) return;
  _dragIdx = [...document.querySelectorAll('[data-card-name]')].indexOf(c);
  c.style.opacity = '0.4';
});
document.addEventListener('dragend', e => {
  const c = e.target.closest('[data-card-name]');
  if (c) c.style.opacity = '';
  _dragIdx = -1;
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const target = e.target.closest('[data-card-name]');
  if (!target || _dragIdx < 0) return;
  const cards = [...document.querySelectorAll('[data-card-name]')];
  const names = cards.map(c => c.dataset.cardName);
  const overIdx = cards.indexOf(target);
  if (_dragIdx === overIdx) return;
  const [moved] = names.splice(_dragIdx, 1);
  names.splice(overIdx, 0, moved);
  fetch('/api/cards/reorder', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({order: names})
  }).then(() => htmx.trigger(document.body, 'cardsChanged'));
});
document.getElementById('repo-search')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('[data-repo-name]').forEach(el => {
    el.style.display = el.dataset.repoName.toLowerCase().includes(q) ? '' : 'none';
  });
});
`

export function renderSetupPage(error?: string): string {
  return `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GitHub Dashboard — Setup</title>
  <style>${DASHBOARD_CSS}</style>
</head><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="width:100%;max-width:440px">
      <h1 style="text-align:center;font-size:24px;font-weight:600;margin-bottom:32px">GitHub Dashboard</h1>
      <form method="POST" action="/api/auth"
            style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:28px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
          Personal Access Token (classic)
        </label>
        <input name="pat" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
               required autofocus
               style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                      padding:9px 12px;color:#e6edf3;font-size:13px;font-family:monospace;
                      outline:none;margin-bottom:12px"/>
        ${error ? `<div style="color:#f85149;font-size:13px;margin-bottom:12px">${escapeHtml(error)}</div>` : ''}
        <div style="font-size:12px;color:#8b949e;margin-bottom:16px">
          Benötigte Scopes: <code>repo</code> · <code>security_events</code>
        </div>
        <button type="submit" class="btn-primary" style="width:100%;padding:10px">
          Mit GitHub verbinden
        </button>
      </form>
    </div>
  </div>
</body></html>`
}

export function renderDashboard(cardsHtml: string, username: string): string {
  return `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GitHub Dashboard</title>
  <style>${DASHBOARD_CSS}</style>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" crossorigin="anonymous"></script>
</head><body>
  <header style="background:#161b22;border-bottom:1px solid #30363d;height:56px;
                 display:flex;align-items:center;padding:0 20px;gap:10px;
                 position:sticky;top:0;z-index:100">
    <span style="font-size:15px;font-weight:600">Dashboard</span>
    <div style="flex:1"></div>
    <button class="btn-ghost"
            hx-get="/api/cards" hx-target="#cards" hx-swap="innerHTML"
            hx-on::after-request="htmx.trigger(document.body,'cardsChanged')">
      Aktualisieren
    </button>
    <button class="btn-primary"
            hx-get="/api/modal/repos" hx-target="#modal" hx-swap="innerHTML">
      + Repo hinzufügen
    </button>
    <span style="font-size:13px;color:#8b949e">${escapeHtml(username)}</span>
    <form method="POST" action="/api/auth" style="margin:0">
      <input type="hidden" name="_method" value="DELETE">
      <button type="submit"
              style="background:transparent;border:none;color:#6e7681;cursor:pointer;font-size:12px">
        Abmelden
      </button>
    </form>
  </header>
  <main style="padding:20px 24px">
    <div id="cards"
         hx-get="/api/cards"
         hx-trigger="every 10s, cardsChanged from:body"
         hx-swap="innerHTML">
      ${cardsHtml}
    </div>
  </main>
  <div id="modal"></div>
  <script>${CLIENT_SCRIPT}</script>
</body></html>`
}
