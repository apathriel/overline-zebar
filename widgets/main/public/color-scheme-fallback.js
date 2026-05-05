/* Zebar color-scheme fallback
   Applies CSS custom properties for light/dark and listens for changes.
   Include this script on pages that embed the widget if you need runtime fallback.
*/
(function () {
  if (typeof document === "undefined") return;

  const LIGHT = {
    "--border": "oklch(.22 .014 295)",
    "--background": "oklch(.95 .016 300)",
    "--background-deeper": "oklch(.95 .012 300)",
    "--bg-opacity": "90%",
    "--button": "oklch(.92 .014 295)",
    "--button-border": "oklch(.85 .017 295)",
    "--primary": "oklch(.92 .029 288)",
    "--primary-border": "oklch(83.902% 0.0001 288)",
    "--primary-text": "oklch(.06 .002 295)",
    "--text": "oklch(.06 .002 295)",
    "--text-muted": "oklch(.45 .006 295)",
    "--icon": "oklch(.35 .011 295)",
    "--success": "#1f7a3a",
    "--danger": "#8b1f2b",
    "--warning": "#9a531e",
    "--active-modifier": "10%",
  };

  const DARK = {
    "--border": "oklch(.35 .024 261.7)",
    "--background": "oklch(.25 .013 261.7)",
    "--background-deeper": "oklch(.15 .008 261.7)",
    "--bg-opacity": "80%",
    "--button": "oklch(.35 .019 261.7)",
    "--button-border": "oklch(.45 .024 261.7)",
    "--primary": "oklch(.542 .041 248.7)",
    "--primary-border": "oklch(.623 .047 248.7)",
    "--primary-text": "#edeef0",
    "--text": "oklch(.95 .003 261.7)",
    "--text-muted": "oklch(.85 .009 261.7)",
    "--icon": "oklch(.75 .015 261.7)",
    "--success": "#a3be8c",
    "--danger": "#bf616a",
    "--warning": "#d08770",
    "--active-modifier": "75%",
  };

  const KEYS = Array.from(
    new Set([...Object.keys(LIGHT), ...Object.keys(DARK)]),
  );

  function applyMap(map) {
    const root = document.documentElement;
    Object.keys(map).forEach((k) => {
      try {
        root.style.setProperty(k, map[k]);
      } catch (e) {}
    });
  }

  function clear() {
    const root = document.documentElement;
    KEYS.forEach((k) => {
      try {
        root.style.removeProperty(k);
      } catch (e) {}
    });
  }

  const mql = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function update() {
    const isDark = mql ? mql.matches : false;
    applyMap(isDark ? DARK : LIGHT);
  }

  if (mql) {
    if (typeof mql.addEventListener === "function")
      mql.addEventListener("change", update);
    else if (typeof mql.addListener === "function") mql.addListener(update);
  }

  // Run once immediately (best effort, WebView2 may not be ready yet)
  update();

  // Run again on load — WebView2 reflects the real system preference by this point
  window.addEventListener("load", update);

  // Public helpers for manual control (optional)
  window.__zebarColorScheme = {
    set: function (name) {
      if (name === "dark") applyMap(DARK);
      else if (name === "light") applyMap(LIGHT);
      else if (name === "auto") update();
    },
    clear: clear,
  };
})();
