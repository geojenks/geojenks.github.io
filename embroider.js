/* embroider.js -- embroidered-portrait widget (before/after wipe + click-to-restitch).
 *
 * Mount:  <div class="embroider" data-src="portrait/"></div>
 * The folder is a staged_reintegrate.py --region_variants  variants/  folder:
 *   regions.js   window.REGIONS = {size, [width, height,] order, regions:[{stitch, region, bbox:[x0,y0,x1,y1], files:[...]}]}
 *                (width/height: the image frame the bboxes live in, for non-square images; else size x size)
 *   base.png | base.jpg | base.webp      (or name it with data-base="...")
 *   one RGBA patch per region per variant (.png / .webp / .jpg), drawn at its bbox, in listed order.
 * Optional attributes: data-base, data-alt, data-caption, data-park (0..1, default 0.9),
 *   data-auto="off" (no timed wipe; call .reveal() yourself).
 * Events on the root: 'embroider:compose' whenever the embroidered image changes.
 * .ready is a promise that resolves once the base and first variants are loaded.
 * No dependencies. Needs http(s) serving for per-pixel hit-testing (falls back to bbox on file://).
 */
(function () {
  'use strict';

  var WAIT_MS = 2500;      // plain photo shown this long before the wipe
  var WIPE_MS = 1500;
  var FADE_MS = 200;       // crossfade when a region changes variant
  var PULSE_MS = 1900;     // one-off "you can click this" pulse after the wipe
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // regions.js writes a global; load one at a time so several widgets don't clobber it
  var scriptQueue = Promise.resolve();
  function loadRegions(url) {
    var run = function () {
      return new Promise(function (resolve, reject) {
        var prev = window.REGIONS;
        window.REGIONS = undefined;
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () {
          var R = window.REGIONS;
          window.REGIONS = prev;
          s.remove();
          if (R && R.regions) resolve(R); else reject(new Error('embroider: no window.REGIONS in ' + url));
        };
        s.onerror = function () { window.REGIONS = prev; s.remove(); reject(new Error('embroider: could not load ' + url)); };
        document.head.appendChild(s);
      });
    };
    var p = scriptQueue.then(run);
    scriptQueue = p.catch(function () {});
    return p;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('embroider: could not load ' + url)); };
      im.src = url;
    });
  }

  function loadFirst(urls) {
    var i = 0;
    var next = function () {
      if (i >= urls.length) return Promise.reject(new Error('embroider: no base image among ' + urls.join(', ')));
      return loadImage(urls[i++]).catch(next);
    };
    return next();
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function Embroider(root) {
    this.root = root;
    var src = root.getAttribute('data-src') || './';
    if (src.slice(-1) !== '/') src += '/';
    this.src = src;
    this.park = clamp(parseFloat(root.getAttribute('data-park')) || 0.9, 0.05, 1);
    this.auto = root.getAttribute('data-auto') !== 'off';
    this.div = 0;               // divider position 0..1; left of it is embroidered
    this.phase = 'loading';     // loading -> photo -> wipe -> ready
    this.hover = -1;
    this.flash = null;          // {i, t0, dur}: outline pulse on one region
    this.fades = [];            // regions mid-crossfade
    this.overlays = {};         // "i:idx" -> {sil, ring, pad} highlight canvases
    this.alphas = {};           // "i:idx" -> {w, h, a} patch alpha for hit-testing
    this.noPixels = false;      // canvas tainted (file://): fall back to bbox hits
    this.raf = 0;
    this.build();
    this.load();
  }

  Embroider.prototype.build = function () {
    var r = this.root;
    var alt = r.getAttribute('data-alt') || 'Portrait, re-stitched region by region in embroidery textures';
    r.classList.add('is-loading');
    this.stage = el('div', 'emb-stage');
    this.canvas = el('canvas', 'emb-canvas', { role: 'img', 'aria-label': alt });
    this.canvas.textContent = alt;
    this.divEl = el('div', 'emb-divider', {
      role: 'slider', tabindex: '0', 'aria-label': 'Compare embroidered and photo',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      'aria-orientation': 'horizontal'
    });
    var grip = el('span', 'emb-grip', { 'aria-hidden': 'true' });
    grip.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M7.5 5 3 10l4.5 5M12.5 5 17 10l-4.5 5" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.divEl.appendChild(grip);
    this.stage.appendChild(this.canvas);
    this.stage.appendChild(this.divEl);

    var bar = el('div', 'emb-bar');
    this.caption = el('p', 'emb-caption');
    this.caption.textContent = r.getAttribute('data-caption') || 'Click a patch to re-stitch it · drag to compare';
    var btns = el('div', 'emb-buttons');
    this.shuffleBtn = el('button', 'emb-btn', { type: 'button' });
    this.shuffleBtn.textContent = 'Shuffle';
    this.resetBtn = el('button', 'emb-btn', { type: 'button' });
    this.resetBtn.textContent = 'Reset';
    var dot = el('span', 'emb-sep', { 'aria-hidden': 'true' });
    dot.textContent = '·';
    btns.appendChild(this.shuffleBtn); btns.appendChild(dot); btns.appendChild(this.resetBtn);
    this.live = el('span', 'emb-sr', { 'aria-live': 'polite' });
    bar.appendChild(this.caption); bar.appendChild(btns); bar.appendChild(this.live);

    r.appendChild(this.stage);
    r.appendChild(bar);
    this.ctx = this.canvas.getContext('2d');
    this.bind();
  };

  Embroider.prototype.load = function () {
    var self = this, src = this.src;
    var baseAttr = this.root.getAttribute('data-base');
    var baseUrls = baseAttr ? [src + baseAttr] : [src + 'base.png', src + 'base.jpg', src + 'base.webp'];
    var pBase = loadFirst(baseUrls).then(function (im) {
      self.base = im;
      if (!self.W) { self.W = im.naturalWidth; self.H = im.naturalHeight; }
      self.fitStage();
      self.resize();
      if (self.phase === 'loading') self.phase = 'photo';
      self.root.classList.remove('is-loading');
      self.render();
      return im;
    });
    var pRegions = loadRegions(src + 'regions.js').then(function (R) {
      self.W = R.width || R.size || self.W;
      self.H = R.height || R.size || self.H;
      self.fitStage();
      self.regions = R.regions.map(function (r) {
        return { stitch: r.stitch, region: r.region, bbox: r.bbox, files: r.files, idx: 0,
                 imgs: new Array(r.files.length), loading: {} };
      });
      return Promise.all(self.regions.map(function (r, i) { return self.variant(i, 0).catch(function (e) { console.warn(e.message); }); }));
    });
    this.ready = Promise.all([pBase, pRegions]).then(function () {
      self.emb = makeCanvas(self.W, self.H);
      self.compose();
      self.ready0 = true;
      self.maybeWipe();
      return self;
    });
    this.ready.catch(function (e) {
      console.warn(e.message);
      self.root.classList.add('is-failed');      // photo only (if the base loaded)
    });
    if (!this.auto) return;
    // start the clock when the widget is actually on screen
    var arm = function () { if (self.armed) return; self.armed = true; self.armT = now(); setTimeout(function () { self.maybeWipe(); }, WAIT_MS); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (ents.some(function (e) { return e.isIntersecting; })) { io.disconnect(); arm(); }
      }, { threshold: 0.35 });
      io.observe(this.root);
    } else arm();
  };

  // load (once) variant k of region i
  Embroider.prototype.variant = function (i, k) {
    var r = this.regions[i];
    if (r.imgs[k]) return Promise.resolve(r.imgs[k]);
    if (!r.loading[k]) {
      r.loading[k] = loadImage(this.src + r.files[k]).then(function (im) { r.imgs[k] = im; return im; });
    }
    return r.loading[k];
  };

  Embroider.prototype.preloadAll = function () {
    var self = this, jobs = [];
    this.regions.forEach(function (r, i) { r.files.forEach(function (_, k) { jobs.push([i, k]); }); });
    var step = function () {
      var j = jobs.shift();
      if (!j) return;
      self.variant(j[0], j[1]).catch(function (e) { console.warn(e.message); }).then(step);
    };
    for (var n = 0; n < 4; n++) step();       // a few requests in flight at once
  };

  Embroider.prototype.maybeWipe = function () {
    if (this.phase !== 'photo' || !this.ready0) return;
    if (REDUCED) { this.finishWipe(); return; }
    if (!this.armed || now() - this.armT < WAIT_MS - 30) return;
    this.startWipe();
  };

  Embroider.prototype.startWipe = function () {
    if (this.phase !== 'photo' || !this.ready0) return;
    if (REDUCED) { this.finishWipe(); return; }
    this.phase = 'wipe';
    this.root.classList.add('is-wiping');
    this.wipeT0 = now();
    this.tick();
  };

  // skip straight to the interactive state (used when the wipe happened elsewhere)
  Embroider.prototype.reveal = function () {
    var self = this;
    return this.ready.then(function () { self.finishWipe(); return self; });
  };

  Embroider.prototype.finishWipe = function () {
    if (!this.ready0 || this.phase === 'ready') return;
    this.phase = 'ready';
    this.setDiv(this.park);
    this.root.classList.remove('is-wiping');
    this.root.classList.add('is-ready');
    this.preloadAll();
    if (!REDUCED) {
      var i = this.pulseTarget();
      if (i >= 0) this.flash = { i: i, t0: now() + 250, dur: PULSE_MS, n: 2 };
    }
    this.tick();
  };

  // a mid-sized region near the middle of the embroidered side; a region can be
  // several separate pieces with a bbox spanning the image, so size and place it
  // by its opaque pixels (sampled every 4th px) when they can be read, else by its bbox
  Embroider.prototype.pulseTarget = function () {
    var W = this.W, H = this.H, best = -1, bestD = Infinity, self = this;
    this.regions.forEach(function (r, i) {
      var b = r.bbox, w = b[2] - b[0], h = b[3] - b[1];
      var area = w * h, cx = (b[0] + b[2]) / 2 / W, cy = (b[1] + b[3]) / 2 / H;
      var al = self.alphaOf(i);
      if (al) {
        var n = 0, sx = 0, sy = 0;
        for (var y = 0; y < al.h; y += 4) for (var x = 0; x < al.w; x += 4) {
          if (al.a[y * al.w + x] > 127) { n++; sx += x; sy += y; }
        }
        if (!n) return;
        area = n * 16 * (w / al.w) * (h / al.h);
        cx = (b[0] + (sx / n) * w / al.w) / W;
        cy = (b[1] + (sy / n) * h / al.h) / H;
      }
      if (area > 0.25 * W * H || area < 0.004 * W * H) return;
      if (cx > self.park - 0.05) return;
      var d = Math.hypot(cx - 0.45, cy - 0.5);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  Embroider.prototype.setDiv = function (v) {
    this.div = clamp(v, 0, 1);
    var pct = Math.round(this.div * 100);
    this.divEl.style.left = (this.div * 100) + '%';
    this.divEl.setAttribute('aria-valuenow', String(pct));
    this.divEl.setAttribute('aria-valuetext', pct + '% embroidered');
  };

  // ---------------------------------------------------------------- drawing
  Embroider.prototype.resize = function () {
    var rect = this.stage.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.overlays = {};                       // ring width is set in screen px
    }
  };

  // the stage takes the image's shape (square unless the frame says otherwise)
  Embroider.prototype.fitStage = function () {
    if (this.W && this.H) this.stage.style.aspectRatio = this.W + ' / ' + this.H;
  };

  Embroider.prototype.compose = function () {
    var c = this.emb.getContext('2d'), t = now();
    c.clearRect(0, 0, this.W, this.H);
    c.drawImage(this.base, 0, 0, this.W, this.H);
    var fading = {};
    this.fades = this.fades.filter(function (f) { return t - f.t0 < FADE_MS; });
    this.fades.forEach(function (f) { fading[f.i] = f; });
    for (var i = 0; i < this.regions.length; i++) {
      var r = this.regions[i], b = r.bbox, w = b[2] - b[0], h = b[3] - b[1];
      var f = fading[i];
      if (f && r.imgs[f.from]) {
        c.drawImage(r.imgs[f.from], b[0], b[1], w, h);
        c.globalAlpha = clamp((t - f.t0) / FADE_MS, 0, 1);
      }
      if (r.imgs[r.idx]) c.drawImage(r.imgs[r.idx], b[0], b[1], w, h);
      c.globalAlpha = 1;
    }
    this.root.dispatchEvent(new CustomEvent('embroider:compose'));
  };

  Embroider.prototype.overlay = function (i) {
    var r = this.regions[i], key = i + ':' + r.idx;
    if (this.overlays[key]) return this.overlays[key];
    var img = r.imgs[r.idx];
    if (!img) return null;
    var b = r.bbox, w = b[2] - b[0], h = b[3] - b[1];
    var sil = makeCanvas(w, h), s = sil.getContext('2d');
    s.drawImage(img, 0, 0, w, h);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#fff';
    s.fillRect(0, 0, w, h);
    // outline ~2 screen px wide, drawn just outside the patch edge
    var perPx = this.W / (this.canvas.width / (window.devicePixelRatio || 1));
    var rad = Math.max(1.5, 2 * perPx), pad = Math.ceil(rad) + 2;
    var ring = makeCanvas(w + 2 * pad, h + 2 * pad), g = ring.getContext('2d');
    for (var a = 0; a < 16; a++) {
      var th = a * Math.PI / 8;
      g.drawImage(sil, pad + rad * Math.cos(th), pad + rad * Math.sin(th));
    }
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sil, pad, pad);
    return (this.overlays[key] = { sil: sil, ring: ring, pad: pad });
  };

  Embroider.prototype.drawHighlight = function (ctx, i, k) {
    var o = this.overlay(i);
    if (!o || k <= 0) return;
    var b = this.regions[i].bbox, sc = this.canvas.width / this.W;
    var w = b[2] - b[0], h = b[3] - b[1];
    ctx.globalAlpha = 0.16 * k;
    ctx.drawImage(o.sil, b[0] * sc, b[1] * sc, w * sc, h * sc);
    ctx.globalAlpha = 0.95 * k;
    ctx.shadowColor = 'rgba(20, 35, 55, 0.55)';
    ctx.shadowBlur = 4 * (window.devicePixelRatio || 1);
    ctx.drawImage(o.ring, (b[0] - o.pad) * sc, (b[1] - o.pad) * sc,
      (w + 2 * o.pad) * sc, (h + 2 * o.pad) * sc);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  Embroider.prototype.render = function () {
    if (!this.base) return;
    var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.base, 0, 0, W, H);
    var dx = this.div * W;
    if (this.emb && dx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, dx, H);
      ctx.clip();
      ctx.drawImage(this.emb, 0, 0, W, H);
      if (this.phase === 'ready') {
        var t = now();
        if (this.flash) {
          var p = (t - this.flash.t0) / this.flash.dur;
          if (p >= 1) this.flash = null;
          else if (p > 0) this.drawHighlight(ctx, this.flash.i, Math.pow(Math.sin(Math.PI * p * this.flash.n), 2));
        }
        if (this.hover >= 0 && (!this.flash || this.flash.i !== this.hover)) this.drawHighlight(ctx, this.hover, 1);
      }
      ctx.restore();
    }
  };

  // one rAF loop, running only while something animates
  Embroider.prototype.tick = function () {
    if (this.raf) return;
    var self = this;
    var loop = function () {
      self.raf = 0;
      var t = now(), busy = false;
      if (self.phase === 'wipe') {
        var p = clamp((t - self.wipeT0) / WIPE_MS, 0, 1);
        self.setDiv(self.park * easeInOut(p));
        if (p >= 1) self.finishWipe(); else busy = true;
      }
      if (self.fades.length) { self.compose(); busy = busy || self.fades.length > 0; }
      if (self.flash) busy = true;
      self.render();
      if (busy) self.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  };

  // ---------------------------------------------------------------- hit-testing
  Embroider.prototype.alphaOf = function (i) {
    var r = this.regions[i], key = i + ':' + r.idx;
    if (key in this.alphas) return this.alphas[key];
    var img = r.imgs[r.idx];
    if (!img || this.noPixels) return null;
    var w = img.naturalWidth, h = img.naturalHeight, c = makeCanvas(w, h), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    try {
      var d = g.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
      for (var p = 0, q = 3; p < a.length; p++, q += 4) a[p] = d[q];
      return (this.alphas[key] = { w: w, h: h, a: a });
    } catch (e) {                               // tainted canvas (file://)
      this.noPixels = true;
      console.warn('embroider: pixel reads blocked, using bounding boxes for clicks');
      return null;
    }
  };

  // topmost region whose patch is opaque at image point (x, y); -1 if none
  Embroider.prototype.hitTest = function (x, y) {
    var bboxHit = -1, bboxArea = Infinity;
    for (var i = this.regions.length - 1; i >= 0; i--) {
      var r = this.regions[i], b = r.bbox;
      if (x < b[0] || x >= b[2] || y < b[1] || y >= b[3] || !r.imgs[r.idx]) continue;
      var al = this.alphaOf(i);
      if (!al) {                                // fallback: smallest bbox, as in region_picker.html
        var area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area < bboxArea) { bboxArea = area; bboxHit = i; }
        continue;
      }
      var px = Math.floor((x - b[0]) * al.w / (b[2] - b[0]));
      var py = Math.floor((y - b[1]) * al.h / (b[3] - b[1]));
      if (al.a[py * al.w + px] > 127) return i;
    }
    return bboxHit;
  };

  Embroider.prototype.toImage = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    return { fx: fx, x: fx * this.W, y: fy * this.H };
  };

  // ---------------------------------------------------------------- changing variants
  Embroider.prototype.setVariant = function (i, k, announce) {
    var self = this, r = this.regions[i];
    return this.variant(i, k).then(function () {
      if (r.idx === k) return;
      var from = r.idx;
      r.idx = k;
      self.fades = self.fades.filter(function (f) { return f.i !== i; });
      if (!REDUCED) self.fades.push({ i: i, from: from, t0: now() });
      self.compose();
      self.tick();
      if (announce) self.live.textContent = r.stitch.replace(/_/g, ' ') + ' region ' + r.region +
        ': variant ' + (k + 1) + ' of ' + r.files.length;
    }).catch(function (e) { console.warn(e.message); });
  };

  Embroider.prototype.cycle = function (i, dir) {
    var n = this.regions[i].files.length;
    if (n > 1) this.setVariant(i, (this.regions[i].idx + dir + n) % n, true);
  };

  Embroider.prototype.shuffle = function () {
    var self = this;
    this.regions.forEach(function (r, i) {
      var n = r.files.length;
      if (n > 1) self.setVariant(i, (r.idx + 1 + Math.floor(Math.random() * (n - 1))) % n, false);
    });
    this.live.textContent = 'All regions re-stitched';
  };

  Embroider.prototype.reset = function () {
    var self = this;
    this.regions.forEach(function (r, i) { self.setVariant(i, 0, false); });
    this.live.textContent = 'All regions back to their first variant';
  };

  // ---------------------------------------------------------------- input
  Embroider.prototype.bind = function () {
    var self = this, cv = this.canvas, dv = this.divEl;

    cv.addEventListener('pointermove', function (e) {
      if (self.phase !== 'ready' || e.pointerType === 'touch') return;
      var p = self.toImage(e);
      var h = p.fx < self.div ? self.hitTest(p.x, p.y) : -1;
      cv.style.cursor = h >= 0 ? 'pointer' : '';
      if (h !== self.hover) { self.hover = h; self.render(); }
    });
    cv.addEventListener('pointerleave', function () {
      if (self.hover !== -1) { self.hover = -1; self.render(); }
      cv.style.cursor = '';
    });
    cv.addEventListener('click', function (e) {
      if (self.phase === 'photo') { self.startWipe(); return; }   // impatient: wipe now
      if (self.phase !== 'ready') return;
      var p = self.toImage(e);
      if (p.fx >= self.div) return;
      var i = self.hitTest(p.x, p.y);
      if (i < 0) return;
      self.flash = null;
      self.cycle(i, e.shiftKey ? -1 : 1);
      if (e.pointerType === 'touch' || (e.pointerType === undefined && self.hover < 0)) {
        self.flash = { i: i, t0: now(), dur: 650, n: 1 };             // no hover on touch: brief outline
        self.tick();
      }
    });

    // divider: drag with mouse / touch / pen
    var dragging = false;
    var moveTo = function (e) {
      var rect = self.stage.getBoundingClientRect();
      self.setDiv((e.clientX - rect.left) / rect.width);
      self.render();
    };
    dv.addEventListener('pointerdown', function (e) {
      if (self.phase === 'loading') return;
      if (self.phase !== 'ready') self.finishWipe();
      dragging = true;
      self.hover = -1;
      self.root.classList.add('is-dragging');
      dv.setPointerCapture(e.pointerId);
      e.preventDefault();
      moveTo(e);
    });
    dv.addEventListener('pointermove', function (e) { if (dragging) moveTo(e); });
    var stop = function (e) {
      if (!dragging) return;
      dragging = false;
      self.root.classList.remove('is-dragging');
      try { dv.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    dv.addEventListener('pointerup', stop);
    dv.addEventListener('pointercancel', stop);

    // divider: keyboard
    dv.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.1 : 0.02, v = self.div;
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': v -= step; break;
        case 'ArrowRight': case 'ArrowUp': v += step; break;
        case 'PageDown': v -= 0.1; break;
        case 'PageUp': v += 0.1; break;
        case 'Home': v = 0; break;
        case 'End': v = 1; break;
        default: return;
      }
      e.preventDefault();
      if (self.phase === 'loading') return;
      if (self.phase !== 'ready') self.finishWipe();
      self.setDiv(v);
      self.render();
    });
    dv.addEventListener('focus', function () {
      if (self.phase === 'photo' || self.phase === 'wipe') { if (self.ready0) self.finishWipe(); }
    });

    this.shuffleBtn.addEventListener('click', function () {
      if (!self.regions || !self.ready0) return;
      if (self.phase !== 'ready') self.finishWipe();
      self.shuffle();
    });
    this.resetBtn.addEventListener('click', function () {
      if (!self.regions || !self.ready0) return;
      if (self.phase !== 'ready') self.finishWipe();
      self.reset();
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { self.resize(); self.render(); }).observe(this.stage);
    } else {
      window.addEventListener('resize', function () { self.resize(); self.render(); });
    }
  };

  function mountAll() {
    var nodes = document.querySelectorAll('.embroider[data-src]');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].__embroider) nodes[i].__embroider = new Embroider(nodes[i]);
    }
  }
  window.Embroider = Embroider;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
