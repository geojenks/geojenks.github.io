(function () {
  const canvas = document.getElementById('wave-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Live params (driven by sliders) ─────────────────────────
  const P = {
    freq:   0.18,
    duty:   0.55,
    n:      18,
    peaks:  1,
  };

  // ── Slider wiring ────────────────────────────────────────────
  function wire(id, key, valId) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      P[key] = parseFloat(el.value);
      if (valId) document.getElementById(valId).textContent = el.value;
      resetTrails();
    });
  }
  wire('ctrl-freq',  'freq');
  wire('ctrl-duty',  'duty');
  wire('ctrl-n',     'n',     'val-n');
  wire('ctrl-peaks', 'peaks', 'val-peaks');

  // ── Canvas sizing ────────────────────────────────────────────
  let W, H, cx, cy, R_sphere, R_ring, r_finger;

  function resize() {
    // Match CSS size exactly
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    cx = W / 2;
    cy = H / 2;
    R_sphere = Math.min(W, H) * 0.22;
    R_ring   = R_sphere * 1.52;
    r_finger = R_ring   * 0.072;
    resetTrails();
  }

  // ── Trails ───────────────────────────────────────────────────
  const TRAIL_LEN = 45;
  let trails = [];

  function resetTrails() {
    trails = Array.from({ length: P.n }, () => []);
  }
  resetTrails();

  // ── Wave ─────────────────────────────────────────────────────
  // W(θ, t) = sin(k(θ − ωt))   cup gait, k peaks
  function waveVal(theta, t) {
    return Math.sin(P.peaks * (theta - 2 * Math.PI * P.freq * t));
  }

  // contact threshold from duty cycle
  function tau() {
    // duty = (1/π)·arccos(−τ)  →  τ = −cos(π·duty)
    return -Math.cos(Math.PI * P.duty);
  }

  // ── Colours ──────────────────────────────────────────────────
  const C = {
    accent:  [44, 74, 110],   // --bio-accent blue
    lifted:  [160, 155, 148],
  };
  const rgb  = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ── Draw loop ────────────────────────────────────────────────
  let t = 0;

  function draw(ts) {
    t = ts * 0.001;

    // Grow/shrink trails array if N changed
    while (trails.length < P.n) trails.push([]);
    while (trails.length > P.n) trails.pop();

    ctx.clearRect(0, 0, W, H);

    // Sphere
    const sg = ctx.createRadialGradient(cx, cy, R_sphere * 0.05, cx, cy, R_sphere);
    sg.addColorStop(0, 'rgba(215,210,203,0.28)');
    sg.addColorStop(1, 'rgba(180,175,168,0.06)');
    ctx.beginPath();
    ctx.arc(cx, cy, R_sphere, 0, Math.PI * 2);
    ctx.fillStyle = sg;
    ctx.fill();

    // Ring guide
    ctx.beginPath();
    ctx.arc(cx, cy, R_ring, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,175,168,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const tauVal = tau();

    for (let i = 0; i < P.n; i++) {
      const theta     = (2 * Math.PI * i) / P.n;
      const w         = waveVal(theta, t);
      const inContact = w <= tauVal;

      // Lift: fingers above ring when out of contact
      const maxLift = r_finger * 3;
      const lift    = inContact ? 0 : Math.max(0, (w - tauVal) / (1 - tauVal)) * maxLift;

      const fx = cx + (R_ring + lift) * Math.cos(theta);
      const fy = cy + (R_ring + lift) * Math.sin(theta);

      // Trail
      if (!trails[i]) trails[i] = [];
      trails[i].push({ x: fx, y: fy, c: inContact });
      if (trails[i].length > TRAIL_LEN) trails[i].shift();

      for (let k = 1; k < trails[i].length; k++) {
        const age   = k / TRAIL_LEN;
        const alpha = age * 0.15 * (trails[i][k].c ? 1 : 0.25);
        ctx.beginPath();
        ctx.moveTo(trails[i][k - 1].x, trails[i][k - 1].y);
        ctx.lineTo(trails[i][k].x,     trails[i][k].y);
        ctx.strokeStyle = rgb(C.accent, alpha);
        ctx.lineWidth   = r_finger * 0.55 * age;
        ctx.lineCap     = 'round';
        ctx.stroke();
      }

      // Contact line to sphere
      if (inContact) {
        const sx = cx + R_sphere * Math.cos(theta);
        const sy = cy + R_sphere * Math.sin(theta);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = rgb(C.accent, 0.10);
        ctx.lineWidth   = 0.8;
        ctx.stroke();
      }

      // Finger glow (contact only)
      if (inContact) {
        const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, r_finger * 2.2);
        glow.addColorStop(0,   rgb(C.accent, 0.35));
        glow.addColorStop(1,   rgb(C.accent, 0));
        ctx.beginPath();
        ctx.arc(fx, fy, r_finger * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Finger body
      const col    = inContact ? C.accent : C.lifted;
      const alpha  = inContact ? 0.88 : 0.28;
      const radius = inContact ? r_finger : r_finger * 0.65;
      ctx.beginPath();
      ctx.arc(fx, fy, radius, 0, Math.PI * 2);
      ctx.fillStyle = rgb(col, alpha);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  // ── Init ─────────────────────────────────────────────────────
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  requestAnimationFrame(draw);
})();
