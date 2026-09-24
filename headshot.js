/* headshot.js -- the headshot next to the name stitches itself in, region by region
 * in the pipeline's stage order, then opens a focused re-stitch view when clicked.
 *
 * Markup (see index.html):
 *   .stitch-avatar-wrap > button.stitch-avatar > img + canvas + .stitch-badge, .stitch-hint
 *   #stitch-focus (role=dialog, hidden) > .stitch-focus-close, .embroider[data-auto=off]
 * Needs embroider.js loaded first. The avatar mirrors the dialog's Embroider
 * instance, so whatever is re-stitched there shows in the small circle too.
 */
(function () {
  'use strict';

  var WAIT_MS = 3000;       // plain photo this long before it stitches itself
  var STAGE_MS = 650;       // gap between stitch stages (french knot, silk purl, satin)
  var JITTER_MS = 350;      // regions within a stage start a little apart
  var FADE_MS = 450;
  var IDLE_MS = 2200;       // once stitched, re-stitch one patch every 2.2-3.7 s until first opened
  var IDLE_JITTER_MS = 1500;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function now() { return performance.now(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function init() {
    var wrap = document.querySelector('.stitch-avatar-wrap');
    var btn = wrap && wrap.querySelector('.stitch-avatar');
    var dialog = document.getElementById('stitch-focus');
    var node = dialog && dialog.querySelector('.embroider');
    if (!btn || !node || !window.Embroider) return;
    var inst = node.__embroider || (node.__embroider = new window.Embroider(node));
    var cv = btn.querySelector('canvas'), ctx = cv.getContext('2d');
    var closeBtn = dialog.querySelector('.stitch-focus-close');
    var portraitBox = dialog.querySelector('.stitch-focus-portrait');

    var state = 'photo';    // photo -> revealing -> stitched
    var starts = null, t0 = 0, raf = 0, isOpen = false, idleTimers = [];

    // ---------------------------------------------------------------- drawing
    function fit() {
      var dpr = window.devicePixelRatio || 1, d = Math.round(cv.getBoundingClientRect().width * dpr);
      if (d > 0 && d !== cv.width) { cv.width = cv.height = d; draw(); }
    }

    // same crop as the <img>: cover, centred, 45% down
    function crop() {
      var W = inst.W, H = inst.H, s = Math.min(W, H);
      return { s: s, x: (W - s) / 2, y: (H - s) * 0.45 };
    }

    function draw() {
      if (!inst.ready0 || state === 'photo') return;
      var D = cv.width, c = crop(), k = D / c.s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, D, D);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (state === 'stitched') {
        ctx.drawImage(inst.emb, c.x, c.y, c.s, c.s, 0, 0, D, D);
        return;
      }
      // revealing: photo, then each region fading in at its own start time
      ctx.setTransform(k, 0, 0, k, -c.x * k, -c.y * k);
      ctx.drawImage(inst.base, 0, 0, inst.W, inst.H);
      var t = now() - t0;
      inst.regions.forEach(function (r, i) {
        var a = clamp((t - starts[i]) / FADE_MS, 0, 1), im = r.imgs[r.idx], b = r.bbox;
        if (a <= 0 || !im) return;
        ctx.globalAlpha = a;
        ctx.drawImage(im, b[0], b[1], b[2] - b[0], b[3] - b[1]);
      });
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ---------------------------------------------------------------- the reveal
    function schedule() {
      var stages = [];
      inst.regions.forEach(function (r) { if (stages.indexOf(r.stitch) < 0) stages.push(r.stitch); });
      starts = inst.regions.map(function (r) {
        return stages.indexOf(r.stitch) * STAGE_MS + Math.random() * JITTER_MS;
      });
      return (stages.length - 1) * STAGE_MS + JITTER_MS + FADE_MS;
    }

    function reveal(instant) {
      if (state !== 'photo' || !inst.ready0) return;
      btn.classList.add('is-live');
      if (instant || REDUCED) { finish(); return; }
      state = 'revealing';
      var total = schedule();
      t0 = now();
      var loop = function () {
        raf = 0;
        if (state !== 'revealing') return;
        if (now() - t0 >= total) { finish(); return; }
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      setTimeout(function () { if (state === 'revealing') finish(); }, total + 100);   // in case frames are throttled
    }

    function finish() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      state = 'stitched';
      btn.classList.add('is-live', 'is-stitched');
      wrap.classList.add('is-stitched');
      btn.setAttribute('aria-label', 'Portrait of George Jenkinson, stitched in embroidery. Open it to re-stitch it yourself');
      draw();
      if (!REDUCED && !isOpen) showOff();
    }

    // after stitching, keep re-stitching a patch now and then so it reads as alive,
    // until it is first opened; paused while off screen or in a background tab
    var idleOn = false, idleLast = -1, onScreen = true;

    function idlePicks() {
      var c = crop(), R = c.s / 2, ox = c.x + R, oy = c.y + R, picks = [];
      inst.regions.forEach(function (r, i) {
        if (r.files.length < 2) return;
        // area of the bbox that falls inside the circle, roughly
        var b = r.bbox, x0 = Math.max(b[0], ox - R), x1 = Math.min(b[2], ox + R);
        var y0 = Math.max(b[1], oy - R), y1 = Math.min(b[3], oy + R);
        var seen = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
        var near = Math.hypot((b[0] + b[2]) / 2 - ox, (b[1] + b[3]) / 2 - oy) < R * 0.9;
        if (near && seen > 0.01 * c.s * c.s) picks.push(i);
      });
      return picks;
    }

    function idleStep() {
      if (!idleOn) return;
      if (!isOpen && onScreen && !document.hidden) {
        var picks = idlePicks().filter(function (i) { return i !== idleLast; });
        if (picks.length) {
          var i = picks[Math.floor(Math.random() * picks.length)], r = inst.regions[i];
          var k = (r.idx + 1 + Math.floor(Math.random() * (r.files.length - 1))) % r.files.length;
          idleLast = i;
          inst.setVariant(i, k, false);
        }
      }
      idleTimers.push(setTimeout(idleStep, IDLE_MS + Math.random() * IDLE_JITTER_MS));
    }

    function showOff() {
      if (idleOn) return;
      idleOn = true;
      idleTimers.push(setTimeout(idleStep, 1600));
    }

    function stopIdle() {
      idleOn = false;
      idleTimers.forEach(clearTimeout);
      idleTimers = [];
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; }).observe(btn);
    }

    // when a patch changes, cross-fade the small circle from what it showed before
    var prev = document.createElement('canvas'), pctx = prev.getContext('2d'), xf = 0;
    node.addEventListener('embroider:compose', function () {
      if (state !== 'stitched') return;
      if (REDUCED || isOpen || !cv.width) { draw(); return; }
      prev.width = cv.width; prev.height = cv.height;
      pctx.drawImage(cv, 0, 0);
      var ts = now();
      if (xf) cancelAnimationFrame(xf);
      var step = function () {
        var a = 1 - clamp((now() - ts) / FADE_MS, 0, 1);
        draw();
        if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(prev, 0, 0); ctx.globalAlpha = 1; xf = requestAnimationFrame(step); }
        else xf = 0;
      };
      step();
    });

    inst.ready.then(function () {
      if (portraitBox) portraitBox.style.setProperty('--ar', (inst.W / inst.H).toFixed(4));
      fit();
      var wait = Math.max(0, WAIT_MS - (now() - bootT));
      setTimeout(function () { reveal(false); }, wait);
    }).catch(function () {});        // no data: the plain photo stays, and still opens nothing broken

    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(cv);
    else window.addEventListener('resize', fit);

    // ---------------------------------------------------------------- the focused view
    var lastFocus = null;

    function open() {
      if (isOpen) return;
      isOpen = true;
      stopIdle();         // from now on the headshot keeps whatever is stitched in the big view
      lastFocus = document.activeElement;
      if (inst.ready0) reveal(true);
      else inst.ready.then(function () { reveal(true); });
      dialog.hidden = false;
      document.body.classList.add('is-focus-locked');
      requestAnimationFrame(function () { dialog.classList.add('is-open'); });
      try { history.pushState({ stitchFocus: true }, ''); } catch (e) {}
      closeBtn.focus();
      inst.reveal().then(function () { inst.resize(); inst.render(); });
    }

    function close(fromHistory) {
      if (!isOpen) return;
      isOpen = false;
      dialog.classList.remove('is-open');
      document.body.classList.remove('is-focus-locked');
      setTimeout(function () { if (!isOpen) dialog.hidden = true; }, REDUCED ? 0 : 250);
      if (!fromHistory && history.state && history.state.stitchFocus) history.back();
      (lastFocus && lastFocus.focus ? lastFocus : btn).focus();
    }

    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', function () { close(false); });
    window.addEventListener('popstate', function () { if (isOpen) close(true); });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      // keep keyboard focus inside the dialog
      var f = Array.prototype.filter.call(
        dialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'),
        function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  var bootT = now();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
