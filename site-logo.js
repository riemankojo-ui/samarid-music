(function () {
  function apply() {
    var a = document.querySelector('a.logo');
    if (!a) return;
    a.innerHTML = '<img src="/logo-wide.png" alt="FlexTune" class="site-logo-img" style="height:24px;width:auto;max-width:100%;border-radius:8px;display:block;flex-shrink:0">';
    a.setAttribute('aria-label', 'FlexTune home');
    a.style.cssText = 'display:flex;justify-content:center;align-items:center;min-width:120px;min-height:24px';
    if (!document.querySelector('link[rel~="icon"]')) {
      var l = document.createElement('link');
      l.rel = 'icon'; l.type = 'image/png'; l.href = '/favicon.png';
      document.head.appendChild(l);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();