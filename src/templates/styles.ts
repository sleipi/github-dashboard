export const DASHBOARD_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px; background: #0d1117; color: #e6edf3; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d1117; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  @keyframes shimmer { 0%,100%{opacity:.3} 50%{opacity:.7} }
  @keyframes spin { to { transform: rotate(360deg); } }
  .card { background: #161b22; border-radius: 8px; overflow: hidden; user-select: none;
    transition: border-color .4s, box-shadow .4s; border: 1.5px solid #30363d; }
  .card:hover { box-shadow: 0 4px 24px rgba(0,0,0,.55); }
  .card-header { padding: 10px 13px; border-bottom: 1px solid #21262d;
    display: flex; align-items: center; gap: 6px; }
  .card-body { padding: 11px 13px; }
  .skeleton { height: 10px; background: #21262d; border-radius: 3px;
    animation: shimmer 1.6s ease-in-out infinite; }
  .pr-row { display: flex; align-items: center; gap: 7px; padding: 4px 5px;
    border-radius: 4px; text-decoration: none; color: inherit; }
  .pr-row:hover { background: #21262d; }
  .ci-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .badge { font-size: 10px; background: #21262d; color: #8b949e; border-radius: 20px; padding: 1px 7px; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(1,4,9,.85);
    backdrop-filter: blur(4px); z-index: 200; display: flex;
    align-items: flex-start; justify-content: center; padding: 64px 16px 16px; }
  .modal { background: #161b22; border: 1px solid #30363d; border-radius: 10px;
    width: 100%; max-width: 560px; max-height: calc(100vh - 130px);
    display: flex; flex-direction: column; overflow: hidden; }
  .btn-primary { background: #238636; border: 1px solid #2ea043; border-radius: 6px;
    padding: 5px 14px; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn-primary:hover { background: #2ea043; }
  .btn-ghost { background: transparent; border: 1px solid #30363d; border-radius: 6px;
    padding: 5px 12px; color: #8b949e; font-size: 12px; cursor: pointer; }
  .btn-ghost:hover { background: #21262d; color: #e6edf3; }
  .htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; pointer-events: none; }
  .htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }
  .refresh-btn { display: inline-block; }
  .refresh-btn.htmx-request { animation: spin 1s linear infinite; }
  .repo-add-btn.htmx-request { opacity: 0.7; pointer-events: none; }
  .repo-add-btn.htmx-request::after { content: ' …'; }
`
