(function () {
  function apply() {
    var a = document.querySelector('a.logo');
    if (a && !a.querySelector('img.site-logo-img')) {
      var img = new Image();
      img.src = '/logo-wide.png';
      img.alt = 'FlexTune';
      img.className = 'site-logo-img';
      img.style.cssText = 'height:32px;width:auto;max-width:100%;border-radius:8px;display:block;flex-shrink:0';
      a.textContent = '';
      a.appendChild(img);
      a.setAttribute('aria-label', 'FlexTune home');
    }
    if (!document.querySelector('link[rel~="icon"]')) {
      var l = document.createElement('link');
      l.rel = 'icon';
      l.type = 'image/png';
      l.href = '/favicon.png';
      document.head.appendChild(l);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
