/* Multi Bundle: small Bundle button in the editor top row, opens a card with "Create TXT" */
(function () {
  'use strict';
  var row = document.querySelector('.et-file-row');
  if (!row || document.getElementById('editorBundleBtn')) return;
  var sel = document.getElementById('editorFileSelect');

  var st = document.createElement('style');
  st.textContent = '.et-file-row #editorBundleBtn{height:34px;min-width:34px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;padding:0}';
  document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'editorBundleBtn';
  btn.className = 'editor-btn small';
  btn.title = 'Bundle';
  btn.setAttribute('aria-label', 'Bundle');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
  if (sel && sel.nextSibling) row.insertBefore(btn, sel.nextSibling); else row.appendChild(btn);

  function run() {
    try { if (typeof exportBundle === 'function') { exportBundle(); return; } } catch (e) {}
    var bb = document.getElementById('bundleBtn');
    if (bb && !bb.disabled) { bb.click(); return; }
    if (window.showToast) window.showToast('Open a project first', 'error');
  }

  function openCard() {
    var old = document.getElementById('bundleCardBk');
    if (old) old.remove();
    var b = document.createElement('div');
    b.id = 'bundleCardBk';
    b.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.4)';
    var r = btn.getBoundingClientRect();
    var left = Math.max(12, Math.min(r.left, window.innerWidth - 212));
    var c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:' + left + 'px;top:' + (r.bottom + 8) + 'px;min-width:160px;max-width:200px;background:#1c1d22;border:1px solid #2e2f36;border-radius:16px;padding:6px 4px;box-sizing:border-box;font-family:system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.5)';
    var rs = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;margin:0;border:0;border-radius:11px;background:transparent;color:#f0f0f2;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;white-space:nowrap';
    c.innerHTML =
      '<button data-c="txt" style="' + rs + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#CD853F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>' +
        '<span>Create TXT</span></button>' +
      '<div style="height:1px;background:#2a2b32;margin:2px 8px"></div>' +
      '<button data-c="x" style="' + rs + ';color:#a2a3ad;justify-content:center;padding:9px 12px">Cancel</button>';
    b.appendChild(c);
    document.body.appendChild(b);
    b.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (t && t.getAttribute('data-c') === 'txt') { b.remove(); run(); }
      else if ((t && t.getAttribute('data-c') === 'x') || e.target === b) b.remove();
    });
  }

  btn.onclick = openCard;
})();
