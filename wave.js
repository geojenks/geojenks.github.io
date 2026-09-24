// Wave manipulation widget.
//
// Top canvas  — the ring view: looking down the finger ring's axis. Each
//               finger rides the object while in contact (stance: slides
//               tangentially at the object's surface speed) and lifts and
//               swings back while out of contact.
// Lower canvas — the same scene in 3D. Drag it to tilt the finger ring.
//
// Kinematics (per wave component, see Wave_manip/summary.md):
//   W = a·sin ψ, contact when W ≤ τ, τ = −cos(π·duty).
//   Across the contact interval the finger slides linearly (stance);
//   across the rest it returns on a cosine (swing) while lifted by W − τ.
//   The slide is a continuous function of ψ, so a negative speed simply
//   runs the cycle backwards and the object turns the other way.
//   cup   : ψ = k(θ − Φ), push tangential (object turns against the wave,
//           as in a travelling-wave motor)
//   pinch : W = sin θ · cos Φ, push meridional, sign(sin θ) per hemisphere
//   hybrid: contact = cup AND pinch, push = cup + pinch
// The object's angular velocity is the mean of p × v over fingers in
// contact (unit sphere, no slip), smoothed.

(function () {
  const c2 = document.getElementById('wave-canvas');
  const c3 = document.getElementById('wave-3d');
  if (!c2) return;
  const g2 = c2.getContext('2d');
  const g3 = c3 ? c3.getContext('2d') : null;

  const TAU = Math.PI * 2;

  // ── Live params ──────────────────────────────────────────────
  const P = { speed: 0.18, duty: 0.55, n: 18, peaks: 1, gait: 'cup' };

  // ── Small vector kit ────────────────────────────────────────
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // Rodrigues: rotate v about unit axis k by angle t
  function rot(v, k, t) {
    const c = Math.cos(t), s = Math.sin(t);
    return add(add(scl(v, c), scl(cross(k, v), s)), scl(k, dot(k, v) * (1 - c)));
  }
  // quaternion [w, x, y, z]
  function qmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
            a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
            a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
            a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]); return q.map(v => v / l); }
  function qmat(q) {
    const [w, x, y, z] = q;
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  }
  const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
                        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
                        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];

  // ── Ring frame: axis n, in-plane e1, e2 (e1 × e2 = n) ────────
  const AXIS0 = norm([0.18, -0.12, 1]);
  let axis = AXIS0.slice(), e1, e2;
  function frameFrom(prevE1) {
    let a = prevE1 || (Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    a = add(a, scl(axis, -dot(a, axis)));          // parallel-transport the old e1
    if (Math.hypot(a[0], a[1], a[2]) < 1e-3) a = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    e1 = norm(add(a, scl(axis, -dot(a, axis))));
    e2 = cross(axis, e1);
  }
  frameFrom(null);

  // The ring's tilt as two angles, shown beside "Drag to tilt the ring":
  // axis = Ry(pitch)·Rx(roll)·ẑ, i.e. roll about x, then pitch about y.
  const tiltOut = document.getElementById('wave-tilt');
  const deg = (r) => { const d = Math.round(r * 180 / Math.PI); return (d < 0 ? '−' : '') + Math.abs(d) + '°'; };
  function showTilt() {
    if (!tiltOut) return;
    tiltOut.textContent = `roll ${deg(-Math.asin(Math.max(-1, Math.min(1, axis[1]))))} · pitch ${deg(Math.atan2(axis[0], axis[2]))}`;
  }
  function resetAxis() { axis = AXIS0.slice(); frameFrom(null); showTilt(); }
  showTilt();

  // ── Object state ─────────────────────────────────────────────
  let q = [1, 0, 0, 0];          // body → world
  let omega = [0, 0, 0];          // world angular velocity (rad/s)
  let phase = 0;                  // accumulated wave phase Φ

  // ── One wave component → stance/swing state ──────────────────
  // W = a·sin ψ; returns contact, slide d ∈ [−1, 1], lift ≥ 0, and
  // dd/dψ during stance (0 in swing).
  function component(a, psi, tau) {
    const W = a * Math.sin(psi);
    const lift = Math.max(0, W - tau);
    if (a < 1e-6) return { contact: 0 <= tau, d: 0, lift, dd: 0 };
    const r = tau / a;
    if (r >= 1)  return { contact: true,  d: 0, lift: 0, dd: 0 };
    if (r <= -1) return { contact: false, d: 0, lift, dd: 0 };
    const as = Math.asin(r);
    const on = Math.PI - as;                 // contact onset
    const Ls = Math.PI + 2 * as;             // contact length in ψ
    let x = (psi - on) % TAU; if (x < 0) x += TAU;
    if (x < Ls) return { contact: true, d: 2 * x / Ls - 1, lift: 0, dd: 2 / Ls };
    const us = (x - Ls) / (TAU - Ls);
    return { contact: false, d: Math.cos(Math.PI * us), lift, dd: 0 };
  }

  // Half-stroke per unit stance length (arc on the unit sphere). The
  // surface speed is KAPPA·|dψ/dt|, so the stroke doesn't change with speed.
  const KAPPA = 0.06;

  // Fingers for the current time: world positions + contact + velocity.
  function fingers(tau) {
    const out = [];
    const k = P.peaks, Om = TAU * P.speed;
    for (let i = 0; i < P.n; i++) {
      const th = TAU * i / P.n;
      const rh = add(scl(e1, Math.cos(th)), scl(e2, Math.sin(th)));   // radial
      const ph = add(scl(e1, -Math.sin(th)), scl(e2, Math.cos(th)));  // tangential
      let contact = true, lift = 0, slide = 0, mer = 0, v = [0, 0, 0];

      if (P.gait === 'cup' || P.gait === 'hybrid') {
        const psi = k * (th - phase), psiDot = -k * Om;
        const c = component(1, psi, tau);
        const Ls = 2 / (c.dd || 1);
        const A = KAPPA * Ls / 2;
        slide += A * c.d;                   // object turns against the wave
        if (c.dd) v = add(v, scl(ph, A * c.dd * psiDot));
        contact = contact && c.contact; lift = Math.max(lift, c.lift);
      }
      if (P.gait === 'pinch' || P.gait === 'hybrid') {
        const s = Math.sin(th), beta = s >= 0 ? 1 : -1;
        const psi = phase + Math.PI / 2 + (s < 0 ? Math.PI : 0), psiDot = Om;
        const c = component(Math.abs(s), psi, tau);
        const Ls = 2 / (c.dd || 1);
        const A = KAPPA * Ls / 2;
        mer += beta * A * c.d;
        if (c.dd) v = add(v, scl(axis, beta * A * c.dd * psiDot));
        contact = contact && c.contact; lift = Math.max(lift, c.lift);
      }

      // Ride the unit sphere: slide round the ring, then tilt off it.
      let p = rot(rh, axis, slide);
      const pt = rot(ph, axis, slide);                 // local tangent after slide
      p = rot(p, pt, -mer);                            // + mer tilts toward +axis
      out.push({ p, contact, lift, v, theta: th });
    }
    return out;
  }

  // ── Colours ──────────────────────────────────────────────────
  // Page colours come from the CSS tokens (theme.css + wave.css), so the
  // canvases follow light/dark and forced colours. Re-read on change.
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // Beach-ball gores: index into PAL.gores (--wave-gore-1…4, the landing
  // grid's colours); null = the cream gap.
  const GORES = [0, null, 1, null, 2, null, 3, null];
  const PAL = {};
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;forced-color-adjust:none';
  (c2.parentNode || document.body).appendChild(probe);
  // any CSS colour → [r, g, b, a], via the browser's own parser
  function parseCol(v, fb) {
    probe.style.color = fb || 'black';
    if (v) probe.style.color = v;           // ignored if invalid, leaving fb
    const n = (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
  }
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const tok = (name, fb) => parseCol(cs.getPropertyValue(name).trim(), fb);
    PAL.bg     = tok('--bio-bg', '#f7f4f0');
    PAL.acc    = tok('--bio-accent', '#2c4a6e');
    PAL.lift   = tok('--wave-lift', '#a09b94');      // lifted fingers
    PAL.guide  = tok('--wave-guide', '#b4afa8');     // ring guide in the ring view
    PAL.cream  = tok('--wave-cream', '#eee8de');     // gaps between gores, caps
    PAL.shadow = tok('--wave-shadow', 'rgba(44,74,110,0.16)');
    PAL.gores  = ['#2c4a6e', '#2c6e4a', '#6e4a2c', '#4a2c6e'].map((fb, i) => tok(`--wave-gore-${i + 1}`, fb));
    // accent-coloured by default (wave.css), each separately tunable
    PAL.finger  = tok('--wave-finger', '#2c4a6e');   // fingers in contact
    PAL.trail   = tok('--wave-trail', '#2c4a6e');    // finger trails, ring view
    PAL.outline = tok('--wave-outline', '#2c4a6e');  // ball outline, ring view
    PAL.ring    = tok('--wave-ring', '#2c4a6e');     // dashed ring guide, 3D view
    PAL.axis    = tok('--wave-axis', '#2c4a6e');     // rotation axis, 3D view
    PAL.fade    = tok('--wave-fade', '#f7f4f0');     // what the ball fades toward
    PAL.flatFade = tok('--wave-flat-fade', '#f7f4f0'); // the same, ring view only
    PAL.flatMix = parseFloat(cs.getPropertyValue('--wave-flat-mix')) || 0.28;  // share of ball colour kept, ring view
    if (matchMedia('(forced-colors: active)').matches) {
      // high contrast: draw in the system's own colours
      PAL.bg = PAL.fade = PAL.flatFade = parseCol('Canvas'); PAL.acc = parseCol('CanvasText');
      PAL.finger = PAL.trail = PAL.outline = PAL.ring = PAL.axis = PAL.acc;
      PAL.lift = PAL.guide = parseCol('GrayText');
      PAL.shadow = [...PAL.acc.slice(0, 3), 0.12];
    }
  }
  readPalette();

  // ── Sphere renderer (shaded quads, back-face culled) ─────────
  const NLON = 32, NLAT = 16;
  const SPH = [];
  for (let i = 0; i < NLAT; i++) {
    const la0 = -Math.PI / 2 + Math.PI * i / NLAT, la1 = la0 + Math.PI / NLAT;
    for (let j = 0; j < NLON; j++) {
      const lo0 = TAU * j / NLON, lo1 = lo0 + TAU / NLON;
      const P3 = (la, lo) => [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
      const polar = i === 0 || i === NLAT - 1;
      SPH.push({ c: [P3(la0, lo0), P3(la0, lo1), P3(la1, lo1), P3(la1, lo0)],
                 m: P3((la0 + la1) / 2, (lo0 + lo1) / 2),
                 col: polar ? null : GORES[Math.floor(j / (NLON / GORES.length))] });
    }
  }
  // view = {r, u, b} camera basis (right, up, toward viewer); proj(p) → [x, y]
  function drawSphere(g, view, proj, R, opts) {
    const M = qmat(q);
    const L = norm(add(add(scl(view.r, -0.45), scl(view.u, 0.6)), scl(view.b, 0.66)));
    for (const f of SPH) {
      const nw = mv(M, f.m);
      const facing = dot(nw, view.b);
      if (facing <= 0) continue;
      const sh = opts.flat ? 1 : 0.5 + 0.5 * Math.max(0, dot(nw, L));
      let col = (f.col == null ? PAL.cream : PAL.gores[f.col]).slice(0, 3).map(v => v * sh + (opts.flat ? 0 : 18 * (1 - sh)));
      // fade toward the page colour (opaque, so quad seams never show)
      const to = opts.to || PAL.fade;
      if (opts.fade) col = col.map((v, k) => v * opts.fade + to[k] * (1 - opts.fade));
      col = col.map(Math.round);
      g.beginPath();
      f.c.forEach((cn, k) => {
        const [x, y] = proj(mv(M, cn));
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
      g.fillStyle = rgba(col, 1);
      g.strokeStyle = rgba(col, 1);            // hide seams between quads
      g.lineWidth = 0.6;
      g.fill(); g.stroke();
    }
  }

  // ── Canvas sizing (hi-DPI) ───────────────────────────────────
  let S2 = 0, W3 = 0, H3 = 0, dpr = 1;
  // Unrounded CSS sizes, so the backing store matches the box exactly
  // (the focus layout sizes the canvases to fractional pixels).
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    S2 = c2.getBoundingClientRect().width;
    c2.width = c2.height = Math.round(S2 * dpr);
    if (c3) {
      const b = c3.getBoundingClientRect();
      W3 = b.width; H3 = b.height;
      c3.width = Math.round(W3 * dpr); c3.height = Math.round(H3 * dpr);
    }
    resetTrails();
  }

  // ── Trails (ring view) ───────────────────────────────────────
  const TRAIL_LEN = 40;
  let trails = [];
  function resetTrails() { trails = Array.from({ length: P.n }, () => []); }
  resetTrails();

  // ── Ring view ────────────────────────────────────────────────
  function drawRing(F) {
    const g = g2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S2, S2);
    const cx = S2 / 2, cy = S2 / 2;
    // sized so the furthest lifted finger (~0.47·S) just clears the edge
    const rf = S2 * 0.033;
    const R = S2 * 0.3;                  // object radius on screen
    const Rr = R + rf;                   // finger centre when touching
    const view = { r: e1, u: e2, b: axis };
    const proj = (p) => [cx + R * dot(p, e1), cy - R * dot(p, e2)];

    // object: the same ball, softened so the fingers stay the focus
    drawSphere(g, view, proj, R, { fade: PAL.flatMix, to: PAL.flatFade, flat: true });
    g.beginPath(); g.arc(cx, cy, R, 0, TAU);
    g.strokeStyle = rgba(PAL.outline, 0.18); g.lineWidth = 1; g.stroke();

    // ring guide
    g.beginPath(); g.arc(cx, cy, Rr, 0, TAU);
    g.strokeStyle = rgba(PAL.guide, 0.18); g.stroke();

    while (trails.length < F.length) trails.push([]);
    while (trails.length > F.length) trails.pop();

    F.forEach((f, i) => {
      const x = dot(f.p, e1), y = dot(f.p, e2), z = dot(f.p, axis);
      const rho = Math.hypot(x, y) || 1;
      const lift = f.contact ? 0 : Math.min(1, f.lift / (1 + Math.abs(tau()))) * rf * 3.2;
      const sc = (Rr + lift) / rho;
      const fx = cx + x * sc, fy = cy - y * sc;
      const depth = 1 + 0.9 * z;         // meridional push reads as nearer/further

      const tr = trails[i];
      tr.push({ x: fx, y: fy, c: f.contact });
      if (tr.length > TRAIL_LEN) tr.shift();
      for (let k = 1; k < tr.length; k++) {
        const age = k / TRAIL_LEN;
        g.beginPath();
        g.moveTo(tr[k - 1].x, tr[k - 1].y); g.lineTo(tr[k].x, tr[k].y);
        g.strokeStyle = rgba(PAL.trail, age * 0.16 * (tr[k].c ? 1 : 0.3));
        g.lineWidth = rf * 0.55 * age; g.lineCap = 'round'; g.stroke();
      }

      if (f.contact) {
        const gl = g.createRadialGradient(fx, fy, 0, fx, fy, rf * 2.2 * depth);
        gl.addColorStop(0, rgba(PAL.finger, 0.32)); gl.addColorStop(1, rgba(PAL.finger, 0));
        g.beginPath(); g.arc(fx, fy, rf * 2.2 * depth, 0, TAU); g.fillStyle = gl; g.fill();
      }
      g.beginPath();
      g.arc(fx, fy, (f.contact ? rf : rf * 0.65) * depth, 0, TAU);
      g.fillStyle = f.contact ? rgba(PAL.finger, 0.88) : rgba(PAL.lift, 0.3);
      g.fill();
    });
  }

  // ── 3D view ──────────────────────────────────────────────────
  const CAM_AZ = -0.95, CAM_EL = 0.55;
  const cb = [Math.cos(CAM_EL) * Math.cos(CAM_AZ), Math.cos(CAM_EL) * Math.sin(CAM_AZ), Math.sin(CAM_EL)];
  const cr = norm(cross([0, 0, 1], cb));
  const cu = cross(cb, cr);
  const CAM = { r: cr, u: cu, b: cb };

  function draw3D(F) {
    if (!g3) return;
    const g = g3;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W3, H3);
    const R = Math.min(W3, H3) * 0.33;   // the axis tips (±1.45·R) only just fit when the ring is on its side
    const cx = W3 / 2, cy = H3 * 0.5;
    const proj = (p) => [cx + R * dot(p, CAM.r), cy - R * dot(p, CAM.u)];
    const depth = (p) => dot(p, CAM.b);
    const rf = R * 0.085;

    // ground shadow
    g.save();
    g.translate(cx, cy + R * 1.18); g.scale(1, 0.22);
    const sh = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
    sh.addColorStop(0, rgba(PAL.shadow, PAL.shadow[3])); sh.addColorStop(1, rgba(PAL.shadow, 0));
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, TAU); g.fillStyle = sh; g.fill();
    g.restore();

    // finger bodies: a short link from each tip outward, plus the tip
    const pts = F.map(f => {
      const liftAmt = f.contact ? 0 : Math.min(1, f.lift / (1 + Math.abs(tau()))) * 0.28;
      const tip = scl(f.p, 1 + rf / R + liftAmt);
      const base = scl(f.p, 1.32 + liftAmt * 0.5);
      return { f, tip, base, z: depth(tip) };
    });

    // rotation axis (actual ω), drawn as a line through the ball
    const wmag = Math.hypot(...omega);
    const wa = wmag > 1e-3 ? scl(omega, 1 / wmag) : axis;
    const axA = scl(wa, 1.45), axB = scl(wa, -1.45);
    const axIn = (s) => scl(wa, s * 1.0);

    // ring guide split into back/front halves
    function ringHalf(front) {
      g.beginPath();
      let started = false;
      for (let j = 0; j <= 96; j++) {
        const t = TAU * j / 96;
        const p = scl(add(scl(e1, Math.cos(t)), scl(e2, Math.sin(t))), 1 + rf / R);
        const isFront = depth(p) >= 0;
        if (isFront !== front) { started = false; continue; }
        const [x, y] = proj(p);
        started ? g.lineTo(x, y) : g.moveTo(x, y); started = true;
      }
      g.strokeStyle = rgba(PAL.ring, front ? 0.28 : 0.12);
      g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
    }

    function axisEnd(sign, front) {
      const end = sign > 0 ? axA : axB, st = axIn(sign);
      if ((depth(end) >= 0) !== front) return;
      const [x0, y0] = proj(st), [x1, y1] = proj(end);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
      g.strokeStyle = rgba(PAL.axis, 0.55); g.lineWidth = 1.4; g.stroke();
      if (sign > 0 && wmag > 1e-3) {             // arrowhead on +ω (right-hand rule)
        const a = Math.atan2(y1 - y0, x1 - x0), h = 7;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4));
        g.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4));
        g.closePath(); g.fillStyle = rgba(PAL.axis, 0.7); g.fill();
      }
    }

    function finger(o) {
      const [bx, by] = proj(o.base), [tx, ty] = proj(o.tip);
      const sz = 1 + 0.18 * o.z;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty);
      g.strokeStyle = o.f.contact ? rgba(PAL.finger, 0.22) : rgba(PAL.lift, 0.22);
      g.lineWidth = rf * 0.9 * sz; g.lineCap = 'round'; g.stroke();
      g.beginPath(); g.arc(tx, ty, (o.f.contact ? rf : rf * 0.7) * sz, 0, TAU);
      g.fillStyle = o.f.contact ? rgba(PAL.finger, 0.92) : rgba(PAL.lift, 0.55);
      g.fill();
    }

    const back = pts.filter(o => o.z < 0).sort((a, b) => a.z - b.z);
    const front = pts.filter(o => o.z >= 0).sort((a, b) => a.z - b.z);

    ringHalf(false);
    axisEnd(1, false); axisEnd(-1, false);
    back.forEach(finger);
    drawSphere(g, CAM, proj, R, { flat: false, fade: 0.72 });
    ringHalf(true);
    axisEnd(1, true); axisEnd(-1, true);
    front.forEach(finger);
  }

  // ── Drag the 3D view to tilt the ring ────────────────────────
  if (c3) {
    let drag = null;
    c3.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY };
      c3.setPointerCapture(e.pointerId);
      c3.classList.add('dragging');
    });
    c3.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      axis = norm(rot(rot(axis, CAM.u, dx * 0.012), CAM.r, dy * 0.012));
      frameFrom(e1);
      showTilt();
    });
    const end = () => { drag = null; c3.classList.remove('dragging'); };
    c3.addEventListener('pointerup', end);
    c3.addEventListener('pointercancel', end);
    c3.addEventListener('dblclick', resetAxis);
  }

  // ── Controls ────────────────────────────────────────────────
  // fmt → the readout; say → aria-valuetext, where the bare number needs words
  function wire(id, key, fmt, say) {
    const el = document.getElementById(id);
    if (!el) return;
    const out = document.getElementById(id + '-val');
    const upd = () => {
      P[key] = parseFloat(el.value);
      if (out) out.textContent = fmt ? fmt(P[key]) : el.value;
      if (say) el.setAttribute('aria-valuetext', say(P[key]));
    };
    el.addEventListener('input', () => { upd(); if (key === 'n' || key === 'peaks') resetTrails(); });
    upd();
  }
  wire('ctrl-speed', 'speed', v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  // The slider sets the duty cycle directly: τ = −cos(π·duty) makes a
  // full-height wave (W = sin ψ) sit at or below τ for exactly that fraction
  // of its cycle (duty = arccos(−τ)/π). Exact for cup; pinch fingers see a
  // smaller wave, so they touch for less of the cycle.
  wire('ctrl-duty', 'duty', v => Math.round(v * 100) + '%',
       v => Math.round(v * 100) + '% of each cycle in contact');
  wire('ctrl-n', 'n');
  wire('ctrl-peaks', 'peaks');

  // −/+ beside each slider: one step per press, repeating while held. Goes
  // through the same input (and, at the end, change) events as a drag.
  document.querySelectorAll('.step[aria-controls]').forEach(btn => {
    const el = document.getElementById(btn.getAttribute('aria-controls'));
    if (!el) return;
    const up = btn.dataset.step === 'up';
    let timer = null, moved = false, byPointer = false;
    const nudge = () => {
      const before = el.value;
      if (up) el.stepUp(); else el.stepDown();
      if (el.value === before) return false;           // at the end of the range
      moved = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const finish = () => {
      clearTimeout(timer); timer = null;
      if (moved) el.dispatchEvent(new Event('change', { bubbles: true }));
      moved = false;
    };
    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0 || timer) return;
      byPointer = true;
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      const hold = (wait) => { timer = setTimeout(() => (nudge() ? hold(60) : finish()), wait); };
      if (nudge()) hold(400); else finish();
    });
    // the click that follows a press was already handled by pointerdown
    const release = () => { finish(); setTimeout(() => { byPointer = false; }, 0); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, release));
    // keyboard and assistive tech arrive as a bare click
    btn.addEventListener('click', () => { if (!byPointer) { nudge(); finish(); } });
  });
  document.querySelectorAll('[data-gait]').forEach(b => {
    b.addEventListener('click', () => {
      P.gait = b.dataset.gait;
      document.querySelectorAll('[data-gait]').forEach(o => o.classList.toggle('on', o === b));
      const pk = document.getElementById('row-peaks');
      if (pk) pk.classList.toggle('dim', P.gait === 'pinch');
      resetTrails();
    });
  });
  const resetBtn = document.getElementById('ctrl-reset-axis');
  if (resetBtn) resetBtn.addEventListener('click', resetAxis);

  const tau = () => -Math.cos(Math.PI * P.duty);

  // ── Loop ─────────────────────────────────────────────────────
  let last = null, running = false, onScreen = true, focused = false;
  function frame(ts) {
    const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);
    last = ts;
    phase += TAU * P.speed * dt;

    const F = fingers(tau());

    // object angular velocity from the fingers in contact (no slip)
    let wt = [0, 0, 0], nc = 0;
    for (const f of F) {
      if (!f.contact) continue;
      wt = add(wt, cross(f.p, f.v)); nc++;
    }
    wt = nc ? scl(wt, 1 / nc) : scl(omega, 0.97);
    omega = add(omega, scl(add(wt, scl(omega, -1)), Math.min(1, dt * 10)));
    const wm = Math.hypot(...omega);
    if (wm > 1e-6) {
      const h = wm * dt / 2, s = Math.sin(h) / wm;
      q = qnorm(qmul([Math.cos(h), omega[0] * s, omega[1] * s, omega[2] * s], q));
    }

    drawRing(F);
    draw3D(F);
    if (onScreen || focused) requestAnimationFrame(frame);
    else { running = false; last = null; }
  }
  function run() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  // pause when scrolled out of view (never while in focus mode)
  const io = new IntersectionObserver(es => {
    onScreen = es[es.length - 1].isIntersecting;
    if (onScreen) run();
  });
  io.observe(c2);

  new ResizeObserver(resize).observe(c2);
  if (c3) new ResizeObserver(resize).observe(c3);
  resize();
  run();

  // light/dark or high-contrast switched: new palette, and one redraw if paused
  const recolour = () => {
    readPalette();
    if (!running) { const F = fingers(tau()); drawRing(F); draw3D(F); }
  };
  ['(prefers-color-scheme: dark)', '(forced-colors: active)'].forEach(q => {
    const mq = matchMedia(q);
    if (mq.addEventListener) mq.addEventListener('change', recolour);
    else if (mq.addListener) mq.addListener(recolour);
  });

  // ── Expand to focus ─────────────────────────────────────────
  // The widget itself becomes a fixed, full-viewport layer (.is-focus on
  // the wrap) — moved and restyled, not copied, so the simulation state
  // carries over. A placeholder holds its slot so the page behind doesn't
  // reflow. Back (popstate), Esc and the close button all close it.
  const wrap = c2.closest('.bio-canvas-wrap');
  const expandBtn = document.getElementById('wave-expand');
  const closeBtn = document.getElementById('wave-close');
  const caption = document.getElementById('wave-caption');
  let placeholder = null, pushed = false, skipPop = false;

  function openFocus(instant) {
    if (focused || !wrap) return;
    focused = true;
    wrap.classList.toggle('no-anim', instant === true);
    placeholder = document.createElement('div');
    placeholder.style.cssText = `flex:0 0 auto;width:${wrap.offsetWidth}px;height:${wrap.offsetHeight}px`;
    wrap.before(placeholder);
    wrap.classList.add('is-focus');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    if (caption) wrap.setAttribute('aria-labelledby', caption.id);
    document.documentElement.classList.add('wave-focus-lock');
    history.pushState({ waveFocus: true }, '');
    pushed = true;
    run();
    if (closeBtn) closeBtn.focus();
  }

  function closeFocus(fromHistory) {
    if (!focused) return;
    focused = false;
    wrap.classList.remove('is-focus');
    ['role', 'aria-modal', 'aria-labelledby'].forEach(a => wrap.removeAttribute(a));
    if (placeholder) { placeholder.remove(); placeholder = null; }
    document.documentElement.classList.remove('wave-focus-lock');
    // closed by × or Esc: drop the history entry we pushed
    if (pushed && !fromHistory) { skipPop = true; history.back(); }
    pushed = false;
    if (expandBtn) expandBtn.focus();
  }

  if (expandBtn) expandBtn.addEventListener('click', () => openFocus(false));
  if (closeBtn) closeBtn.addEventListener('click', () => closeFocus(false));
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop = false; return; }
    if (focused) closeFocus(true);
  });
  document.addEventListener('keydown', e => {
    if (!focused) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFocus(false); return; }
    if (e.key !== 'Tab') return;
    // keep Tab inside the focused widget
    const f = [...wrap.querySelectorAll('button, input')].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
    if (!f.length) return;
    const first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  });

  window.waveFocus = { open: () => openFocus(false), close: () => closeFocus(false) };
})();
