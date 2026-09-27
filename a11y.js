/* a11y.js -- accessibility options for every page: a "Skip to content" link and
 * a small round "Accessibility options" button (top right) that opens a panel with
 * text size, contrast, theme, motion, readable font, plain view and reset.
 * Choices are saved in this browser (localStorage "a11y-prefs") and applied as
 * classes on <html>: a11y-text-lg, a11y-text-xl, a11y-contrast, a11y-motion-reduce,
 * a11y-font, a11y-plain, plus data-theme="light|dark". The styles are in a11y.css;
 * accessibility.html explains the options to visitors.
 *
 * Each page loads it with these two lines at the END of <head>, after every other
 * stylesheet and <style> block:
 *   <link rel="stylesheet" href="a11y.css">
 *   <script src="a11y.js"></script>
 * Deliberately not defer: saved settings are applied before the page is first
 * painted, so they don't flash in after load. It is small and does no layout work;
 * the panel itself is built on DOMContentLoaded.
 *
 * How the page's own scripts follow the options:
 *   motion  a11y-motion-reduce is set for Reduce, and also when the system asks
 *           for reduced motion. headshot.js and embroider.js check it (as well as
 *           the system setting) each time they would animate; wave.js stops its
 *           drawing loop while it is set. A change needs no reload.
 *   theme   the dark colours are written once, in the @media
 *           (prefers-color-scheme: dark) blocks of theme.css, wave.css and
 *           a11y.css. Light or Dark switches those blocks off or on (setScheme
 *           below); wave.js repaints its canvases when data-theme changes.
 * The Theme option only appears on pages that load theme.css (the home page).
 * No dependencies.
 */
(function () {
  'use strict';

  var KEY = 'a11y-prefs';
  var GROUPS = [
    { key: 'text', legend: 'Text size', options: [['default', 'Default'], ['lg', 'Large'], ['xl', 'Larger']] },
    { key: 'contrast', legend: 'Contrast', options: [['default', 'Default'], ['high', 'High']] },
    { key: 'theme', legend: 'Theme', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] },
    { key: 'motion', legend: 'Motion', options: [['system', 'System'], ['reduce', 'Reduce']] },
    { key: 'font', legend: 'Readable font', options: [['default', 'Off'], ['readable', 'On']] },
    { key: 'plain', legend: 'Plain view', options: [['off', 'Off'], ['on', 'On']] }
  ];
  var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap';

  var root = document.documentElement;
  var themed = !!document.querySelector('link[rel~="stylesheet"][href*="theme.css"]');

  // ------------------------------------------------------------------ preferences
  function defaults() {
    var p = {};
    GROUPS.forEach(function (g) { p[g.key] = g.options[0][0]; });
    return p;
  }

  function clean(raw) {
    var p = defaults();
    if (raw && typeof raw === 'object') {
      GROUPS.forEach(function (g) {
        g.options.forEach(function (o) { if (raw[g.key] === o[0]) p[g.key] = o[0]; });
      });
    }
    return p;
  }

  function load() {
    try { return clean(JSON.parse(window.localStorage.getItem(KEY))); } catch (e) { return defaults(); }
  }

  function save(p) {
    var d = defaults(), out = {}, any = false;
    Object.keys(p).forEach(function (k) { if (p[k] !== d[k]) { out[k] = p[k]; any = true; } });
    try {
      if (any) window.localStorage.setItem(KEY, JSON.stringify(out));
      else window.localStorage.removeItem(KEY);
    } catch (e) {}
  }

  function osReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var prefs = load();

  // ------------------------------------------------------------------ apply (runs in <head>)
  function setClass(name, on) {
    if (on) root.classList.add(name); else root.classList.remove(name);
  }

  function loadFont() {
    if (document.getElementById('a11y-font-css')) return;
    var l = document.createElement('link');
    l.id = 'a11y-font-css';
    l.rel = 'stylesheet';
    l.href = FONT_CSS;
    (document.head || root).appendChild(l);
  }

  // A chosen Light or Dark: each top-level @media (prefers-color-scheme: dark) or
  // (prefers-color-scheme: light) rule in the page's stylesheets is switched on or
  // off by rewriting its condition to "all" or "not all"; System puts the original
  // conditions back. This keeps the dark values written once (see theme.css). The
  // stylesheets above this script have loaded by the time it runs, so their rules
  // can be read; another site's (the font) can't be, and has none of these anyway.
  var schemeRules = null;
  function setScheme(theme) {
    if (!schemeRules) {
      if (theme === 'system') return;
      schemeRules = [];
      Array.prototype.forEach.call(document.styleSheets, function (sheet) {
        var rules;
        try { rules = sheet.cssRules; } catch (e) { return; }
        Array.prototype.forEach.call(rules || [], function (r) {
          var m = r.media && /^\(prefers-color-scheme: (dark|light)\)$/.exec(r.media.mediaText);
          if (m) schemeRules.push({ rule: r, text: r.media.mediaText, scheme: m[1] });
        });
      });
    }
    schemeRules.forEach(function (s) {
      s.rule.media.mediaText = theme === 'system' ? s.text : theme === s.scheme ? 'all' : 'not all';
    });
  }

  function apply(p) {
    setClass('a11y-themed', themed);
    setClass('a11y-text-lg', p.text === 'lg');
    setClass('a11y-text-xl', p.text === 'xl');
    setClass('a11y-contrast', p.contrast === 'high');
    setClass('a11y-motion-reduce', p.motion === 'reduce' || osReduced());
    setClass('a11y-font', p.font === 'readable');
    setClass('a11y-plain', p.plain === 'on');
    var theme = themed ? p.theme : 'system';
    setScheme(theme);
    if (theme !== 'system') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    if (p.font === 'readable') loadFont();
  }

  apply(prefs);

  // ------------------------------------------------------------------ the panel
  var ICON = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<circle cx="12" cy="6.7" r="1.65" fill="currentColor"/>' +
    '<path d="M6.6 9.5 12 10.6l5.4-1.1M12 10.6v3.5M12 14.1l-2.7 4.4M12 14.1l2.7 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CLOSE = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  // what "Skip to content" goes to: <main>, the home page's bio, or the first section after the header
  function findMain() {
    var t = document.querySelector('main') || document.querySelector('.bio');
    if (!t) {
      var h = document.querySelector('.page-header');
      t = h && h.nextElementSibling;
      while (t && /^(SCRIPT|STYLE)$/.test(t.tagName)) t = t.nextElementSibling;
    }
    t = t || document.querySelector('section');
    if (!t) return null;
    if (!t.id) t.id = 'a11y-content';
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.classList.add('a11y-skip-target');
    return t;
  }

  function build() {
    var body = document.body;
    var header = document.querySelector('.page-header');

    // skip link
    var target = findMain();
    var skip = null;
    if (target) {
      skip = el('a', { 'class': 'a11y-skip', href: '#' + target.id }, 'Skip to content');
      skip.addEventListener('click', function (e) {
        e.preventDefault();
        target.focus();
      });
    }

    // button
    var toggle = el('button', {
      type: 'button', 'class': 'a11y-toggle', 'aria-expanded': 'false',
      'aria-controls': 'a11y-panel', 'aria-label': 'Accessibility options', title: 'Accessibility options'
    });
    toggle.innerHTML = ICON;
    if (header) toggle.classList.add('a11y-on-header');

    // panel
    var panel = el('div', { 'class': 'a11y-panel', id: 'a11y-panel', role: 'dialog', 'aria-labelledby': 'a11y-title' });
    panel.hidden = true;
    if (header) panel.classList.add('a11y-on-header');
    var head = el('div', { 'class': 'a11y-head' });
    head.appendChild(el('p', { 'class': 'a11y-title', id: 'a11y-title' }, 'Accessibility options'));
    var closeBtn = el('button', { type: 'button', 'class': 'a11y-close', 'aria-label': 'Close' });
    closeBtn.innerHTML = CLOSE;
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var hints = {
      font: 'Uses Atkinson Hyperlegible, loaded from Google Fonts.'
    };

    GROUPS.forEach(function (g) {
      if (g.key === 'theme' && !themed) {
        var note = el('div', { 'class': 'a11y-group' });
        note.appendChild(el('p', { 'class': 'a11y-legend' }, g.legend));
        note.appendChild(el('p', { 'class': 'a11y-hint' }, 'Light and dark are on the home page only, for now.'));
        panel.appendChild(note);
        return;
      }
      var fs = el('fieldset', { 'class': 'a11y-group' });
      fs.appendChild(el('legend', { 'class': 'a11y-legend' }, g.legend));
      var seg = el('div', { 'class': 'a11y-seg' });
      var hintId = hints[g.key] ? 'a11y-hint-' + g.key : null;
      g.options.forEach(function (o) {
        var lab = el('label', { 'class': 'a11y-opt' });
        var input = el('input', { type: 'radio', name: 'a11y-' + g.key, value: o[0] });
        if (hintId) input.setAttribute('aria-describedby', hintId);
        lab.appendChild(input);
        lab.appendChild(el('span', null, o[1]));
        seg.appendChild(lab);
      });
      fs.appendChild(seg);
      if (hintId) fs.appendChild(el('p', { 'class': 'a11y-hint', id: hintId }, hints[g.key]));
      panel.appendChild(fs);
    });

    var reset = el('button', { type: 'button', 'class': 'a11y-reset' }, 'Reset all');
    panel.appendChild(reset);
    var foot = el('p', { 'class': 'a11y-note' }, 'These settings are saved in this browser only. ');
    foot.appendChild(el('a', { href: 'accessibility.html' }, 'About accessibility on this site'));
    panel.appendChild(foot);
    var status = el('p', { 'class': 'a11y-sr', role: 'status' });
    panel.appendChild(status);

    // skip link first in the tab order, then the button, then the (open) panel
    var first = body.firstChild;
    if (skip) body.insertBefore(skip, first);
    body.insertBefore(toggle, first);
    body.insertBefore(panel, first);

    // ---- state -> controls and page
    function syncControls() {
      Array.prototype.forEach.call(panel.querySelectorAll('input[type=radio]'), function (r) {
        r.checked = prefs[r.name.slice(5)] === r.value;
      });
    }

    // plain view: the headshot stays as a plain photo, not a button into the re-stitch view
    function syncPlain() {
      var on = prefs.plain === 'on';
      Array.prototype.forEach.call(document.querySelectorAll('.stitch-avatar'), function (b) {
        if (on) b.setAttribute('inert', ''); else b.removeAttribute('inert');
      });
    }

    // keep the button centred in the sticky header, where there is one
    function place() {
      var top = header ? Math.max(4, Math.round((header.offsetHeight - 44) / 2)) : 10;
      root.style.setProperty('--a11y-top', top + 'px');
    }

    function update(fromStorage) {
      apply(prefs);
      syncControls();
      syncPlain();
      place();
      if (!fromStorage) save(prefs);
    }

    function announce(msg) {
      status.textContent = '';
      setTimeout(function () { status.textContent = msg; }, 50);
    }

    panel.addEventListener('change', function (e) {
      var r = e.target;
      if (!r || r.type !== 'radio' || !r.checked) return;
      var key = r.name.slice(5);
      prefs[key] = r.value;
      update(false);
      if (key === 'motion') {
        announce(prefs.motion === 'reduce' ? 'Motion reduced.' :
          osReduced() ? 'Motion follows your system setting, which is reduced.' : 'Motion follows your system setting.');
      }
    });

    reset.addEventListener('click', function () {
      prefs = defaults();
      update(false);
      announce('All accessibility options are back to their defaults.');
    });

    // ---- open / close (non-modal: focus is never trapped)
    function isOpen() { return !panel.hidden; }

    function open() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var f = panel.querySelector('input[type=radio]:checked') || panel.querySelector('input, button');
      if (f) f.focus();
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
    closeBtn.addEventListener('click', function () { close(true); });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); close(true); }
    });
    toggle.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && isOpen()) { e.preventDefault(); e.stopPropagation(); close(true); }
    });
    // a click elsewhere closes it; so does tabbing out of it
    document.addEventListener('pointerdown', function (e) {
      if (isOpen() && !panel.contains(e.target) && !toggle.contains(e.target)) close(false);
    }, true);
    panel.addEventListener('focusout', function (e) {
      var to = e.relatedTarget;
      if (to && !panel.contains(to) && to !== toggle) close(false);
    });

    // another tab changed the settings
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY && e.key !== null) return;
      prefs = load();
      update(true);
    });
    // the system's reduced-motion setting changed
    if (window.matchMedia) {
      var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onRm = function () { update(true); };
      if (rm.addEventListener) rm.addEventListener('change', onRm); else if (rm.addListener) rm.addListener(onRm);
    }
    window.addEventListener('resize', place);
    if (header && 'ResizeObserver' in window) new ResizeObserver(place).observe(header);

    update(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
