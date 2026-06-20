import { escapeHtml } from './formatters.ts'
import { DASHBOARD_CSS } from './styles.ts'

const CLIENT_SCRIPT = `
let _dragIdx = -1;
function _clearDragTarget() {
  document.querySelectorAll('[data-card-name]').forEach(el => el.style.outline = '');
}
document.addEventListener('dragstart', e => {
  const c = e.target.closest('[data-card-name]');
  if (!c) return;
  _dragIdx = [...document.querySelectorAll('[data-card-name]')].indexOf(c);
  c.style.opacity = '0.4';
});
document.addEventListener('dragend', e => {
  const c = e.target.closest('[data-card-name]');
  if (c) c.style.opacity = '';
  _clearDragTarget();
  _dragIdx = -1;
});
document.addEventListener('dragenter', e => {
  const c = e.target.closest('[data-card-name]');
  if (!c || _dragIdx < 0) return;
  _clearDragTarget();
  c.style.outline = '2px solid #2f81f7';
});
document.addEventListener('dragleave', e => {
  const c = e.target.closest('[data-card-name]');
  if (!c) return;
  if (!c.contains(e.relatedTarget)) c.style.outline = '';
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  _clearDragTarget();
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal');
    if (modal) modal.innerHTML = '';
  }
});
document.getElementById('repo-search')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('[data-repo-name]').forEach(el => {
    el.style.display = el.dataset.repoName.toLowerCase().includes(q) ? '' : 'none';
  });
});
(function() {
  const cdEl = document.getElementById('countdown');
  if (!cdEl) return;
  let pct = 100;
  setInterval(() => {
    pct = Math.max(0, pct - 1);
    cdEl.style.setProperty('--cd', pct + '%');
  }, 100);
  document.body.addEventListener('htmx:afterSettle', e => {
    if (e.detail && e.detail.target && e.detail.target.id === 'cards') {
      pct = 100;
      cdEl.style.setProperty('--cd', '100%');
    }
  });
})();
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
      <div style="text-align:center;margin-bottom:32px">
        <svg width="40" height="40" viewBox="0 0 16 16" fill="#e6edf3" style="margin-bottom:12px">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <h1 style="margin:0;font-size:24px;font-weight:600">GitHub Dashboard</h1>
      </div>
      <form id="setup-form" method="POST" action="/api/auth"
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
        <button id="connect-btn" type="submit" class="btn-primary" style="width:100%;padding:10px">
          Mit GitHub verbinden
        </button>
        <div style="font-size:11px;color:#6e7681;text-align:center;margin-top:12px">
          🔒 Dein Token wird nur lokal auf diesem Gerät gespeichert.
        </div>
      </form>
      <script>
        document.getElementById('setup-form').addEventListener('submit', function() {
          const btn = document.getElementById('connect-btn');
          if (btn) { btn.disabled = true; btn.textContent = 'Verbinde…'; }
        });
      </script>
    </div>
  </div>
</body></html>`
}

export function renderDashboard(cardsHtml: string, username: string, avatarUrl: string): string {
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
    <svg width="20" height="20" viewBox="0 0 16 16" fill="#e6edf3" style="flex-shrink:0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    <span style="font-size:15px;font-weight:600">Dashboard</span>
    <div style="flex:1"></div>
    <button class="btn-ghost"
            hx-get="/api/cards" hx-target="#cards" hx-swap="innerHTML"
            hx-on::after-request="htmx.trigger(document.body,'cardsChanged')">
      Aktualisieren
    </button>
    <button class="btn-primary repo-add-btn"
            hx-get="/api/modal/repos" hx-target="#modal" hx-swap="innerHTML">
      + Repo hinzufügen
    </button>
    ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(username)}" width="24" height="24" style="border-radius:50%;flex-shrink:0">` : ''}
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
  <div id="countdown" title="Auto-Refresh Countdown"
       style="position:fixed;bottom:16px;right:16px;width:36px;height:36px;border-radius:50%;
              background:conic-gradient(#2f81f7 var(--cd,100%),#21262d 0%);
              z-index:50;display:flex;align-items:center;justify-content:center;pointer-events:none">
    <div style="width:28px;height:28px;border-radius:50%;background:#0d1117"></div>
  </div>
  <script>${CLIENT_SCRIPT}</script>
</body></html>`
}
