// Nose — a prototype about following smells.
// You are a single eye where a dog's nose should be. The world is dark except
// for a circular lens around you. Smells drift through the dark as coloured
// wisps; the further they are from the centre of your lens, the blurrier and
// fainter they get. Follow a smell toward where it is thickest to find its source.

(() => {
  // ---------- setup ----------
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const hudFound = document.getElementById('found');
  const hudTotal = document.getElementById('total');
  const hudLevel = document.getElementById('level');
  const msgEl = document.getElementById('msg');
  const hudRank = document.getElementById('rank');
  const hudExpFill = document.getElementById('expfill');
  const hudExpText = document.getElementById('exptext');
  const sniffBtn = document.getElementById('sniff');

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // seeded rng so a level can be replayed via ?seed=
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const params = new URLSearchParams(location.search);
  let seedBase = parseInt(params.get('seed'), 10);
  if (!Number.isFinite(seedBase)) seedBase = (Math.random() * 1e9) | 0;
  let rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const TAU = Math.PI * 2;

  // ---------- things you can smell ----------
  const THINGS = [
    { name: 'sausage', glyph: '🌭', hue: 18 },
    { name: 'bone', glyph: '🦴', hue: 48 },
    { name: 'old sock', glyph: '🧦', hue: 275 },
    { name: 'pie', glyph: '🥧', hue: 345 },
    { name: 'squirrel', glyph: '🐿️', hue: 120 },
    { name: 'fish', glyph: '🐟', hue: 195 },
    { name: 'cheese', glyph: '🧀', hue: 55 },
    { name: 'tennis ball', glyph: '🎾', hue: 85 },
  ];

  // ---------- smell sprites ----------
  // one soft blob per hue; particles are drawn as scaled copies of these
  const spriteCache = new Map();
  function sprite(hue) {
    if (spriteCache.has(hue)) return spriteCache.get(hue);
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `hsla(${hue}, 90%, 72%, 0.9)`);
    grad.addColorStop(0.35, `hsla(${hue}, 85%, 60%, 0.45)`);
    grad.addColorStop(1, `hsla(${hue}, 80%, 50%, 0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    spriteCache.set(hue, c);
    return c;
  }

  // ---------- ground ----------
  // faint tiled texture so you can tell you are moving at all
  const ground = document.createElement('canvas');
  ground.width = ground.height = 512;
  {
    const g = ground.getContext('2d');
    const r = mulberry32(1234);
    g.fillStyle = '#04060a'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const x = r() * 512, y = r() * 512, a = 0.05 + r() * 0.1;
      g.fillStyle = `rgba(120,150,130,${a})`;
      g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    for (let i = 0; i < 70; i++) {
      // little grass tufts
      const x = r() * 512, y = r() * 512;
      g.strokeStyle = `rgba(90,130,100,${0.12 + r() * 0.12})`;
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 8, y - 4 - r() * 7); g.stroke();
      }
    }
  }
  let groundPattern = null;

  // ---------- world ----------
  const player = { x: 0, y: 0, vx: 0, vy: 0 };
  let landmarks = [];   // rocks and trees, for spatial memory
  let plumes = [];      // smell trails
  let particles = [];   // live wisps
  let level = 1;
  let found = 0;
  let levelDoneAt = 0;
  let time = 0;
  let sniff = 0;        // 0..1, eased
  let flash = 0;        // white flash when you find something
  let lastFindAt = -1;  // for the quick-follow-up bonus
  let popups = [];      // floating "+EXP" text

  // ---------- exp ----------
  // Finding a source earns EXP. Faint trails and quick follow-ups pay more.
  // Total EXP maps to a rank; each rank widens the lens a touch.
  const RANKS = ['Pup', 'Sniffer', 'Tracker', 'Hound', 'Bloodhound', 'Legend'];
  const SAVE_KEY = 'nose.exp';
  const prog = { exp: 0 };
  try { const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); if (Number.isFinite(sv.exp)) prog.exp = sv.exp; } catch (e) { /* no storage, fine */ }
  function expForRank(r) { return 400 * r * (r + 1) / 2; }     // 400, 1200, 2400, 4000, 6000
  function rankOf(exp) {
    let r = 0;
    while (r + 1 < RANKS.length && exp >= expForRank(r + 1)) r++;
    return r;
  }
  function rankBonus() { return 1 + rankOf(prog.exp) * 0.03; }
  function updateExpHud() {
    const r = rankOf(prog.exp);
    const maxed = r >= RANKS.length - 1;
    const lo = expForRank(r), hi = expForRank(r + 1);
    hudRank.textContent = RANKS[r];
    hudExpFill.style.width = (maxed ? 100 : ((prog.exp - lo) / (hi - lo)) * 100) + '%';
    hudExpText.textContent = maxed ? `${prog.exp} exp` : `${prog.exp} / ${hi} exp`;
  }
  function awardExp(pl, cfg) {
    const base = 80 + 40 * level;
    const faint = Math.round(120 * (1 - cfg.trunkEndStrength));           // harder trail, more exp
    const quick = lastFindAt >= 0 && time - lastFindAt < 45 ? 50 : 0;    // kept the thread going
    const gain = base + faint + quick;
    const before = rankOf(prog.exp);
    prog.exp += gain;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ }
    updateExpHud();
    lastFindAt = time;
    popups.push({ text: `+${gain} exp`, sub: quick ? 'quick nose' : (faint > 80 ? 'faint trail' : ''), hue: pl.thing.hue, life: 0, max: 2.2 });
    const after = rankOf(prog.exp);
    if (after > before) {
      popups.push({ text: `Rank up: ${RANKS[after]}`, sub: 'your lens widens', hue: 50, life: -1.2, max: 3 });
      flash = Math.max(flash, 1.2);
    }
    return gain;
  }
  const MAX_PARTICLES = 2600;

  // A plume is a tree of nodes rooted at its source. Each node carries a
  // strength 0..1 (how thick the smell is here). The trunk guarantees a path
  // from the source to somewhere near where you start; branches peel off,
  // thin out and dead-end, so you have to notice which way gets stronger.
  function makePlume(thing, source, end, cfg) {
    const nodes = [];
    const STEP = 36;
    function addPath(from, to, strength0, strength1, wiggle, meander) {
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      const n = Math.max(2, Math.round(len / STEP));
      const nx = -dy / len, ny = dx / len;
      const f1 = rr(0.7, 1.6), f2 = rr(2.2, 4.2), p1 = rr(0, TAU), p2 = rr(0, TAU);
      let off = 0, drift = 0;
      const out = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        // smooth wander plus a slow random walk, pinned to zero at both ends
        const pin = Math.sin(t * Math.PI);
        drift += (rnd() - 0.5) * meander;
        drift *= 0.92;
        off = (Math.sin(t * TAU * f1 + p1) * 0.6 + Math.sin(t * TAU * f2 + p2) * 0.4) * wiggle * pin + drift * pin * 6;
        const s = strength0 + (strength1 - strength0) * t;
        out.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off, s,
                   dirx: dx / len, diry: dy / len });
      }
      for (const nd of out) nodes.push(nd);
      return out;
    }

    // trunk: thick at the source, thin where it reaches you
    const trunk = addPath(source, end, 1, cfg.trunkEndStrength, rr(90, 170), 7);

    // branches: peel off the trunk and die out
    const nBranches = cfg.branches;
    for (let b = 0; b < nBranches; b++) {
      const at = trunk[Math.floor(trunk.length * rr(0.2, 0.85))];
      const ang = Math.atan2(at.diry, at.dirx) + (rnd() < 0.5 ? 1 : -1) * rr(0.6, 1.5);
      const blen = rr(cfg.branchLen * 0.6, cfg.branchLen);
      const to = { x: at.x + Math.cos(ang) * blen, y: at.y + Math.sin(ang) * blen };
      // branches start a little weaker than the trunk and fade to nothing
      const sub = addPath(at, to, at.s * rr(0.75, 0.95), 0, rr(60, 120), 9);
      // sometimes a branch forks again
      if (rnd() < cfg.subBranchChance) {
        const at2 = sub[Math.floor(sub.length * rr(0.3, 0.7))];
        const ang2 = ang + (rnd() < 0.5 ? 1 : -1) * rr(0.5, 1.2);
        const l2 = blen * rr(0.4, 0.7);
        addPath(at2, { x: at2.x + Math.cos(ang2) * l2, y: at2.y + Math.sin(ang2) * l2 }, at2.s * 0.9, 0, 60, 9);
      }
    }
    return { thing, source, nodes, found: false, wind: rr(0, TAU) };
  }

  function levelConfig(lv) {
    return {
      count: Math.min(2 + Math.floor((lv - 1) / 2), 5),
      dist: [900 + lv * 60, 1300 + lv * 110],
      trunkEndStrength: Math.max(0.12, 0.42 - lv * 0.04),
      branches: Math.min(1 + Math.floor(lv / 2), 4),
      branchLen: 380 + lv * 60,
      subBranchChance: Math.min(0.15 + lv * 0.1, 0.7),
    };
  }

  function buildLevel(lv) {
    rnd = mulberry32(seedBase + lv * 7919);
    const cfg = levelConfig(lv);
    plumes = []; particles = []; landmarks = [];
    player.x = 0; player.y = 0; player.vx = player.vy = 0;
    found = 0; levelDoneAt = 0;

    const pool = THINGS.slice();
    const baseAng = rr(0, TAU);
    for (let i = 0; i < cfg.count; i++) {
      const thing = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const ang = baseAng + (i / cfg.count) * TAU + rr(-0.5, 0.5);
      const d = rr(cfg.dist[0], cfg.dist[1]);
      const source = { x: Math.cos(ang) * d, y: Math.sin(ang) * d };
      // the first smell comes right past your nose; later ones end further out
      const endD = 120 + i * 260 + rr(0, 120);
      const endA = ang + rr(-1.2, 1.2);
      const end = { x: Math.cos(endA) * endD, y: Math.sin(endA) * endD };
      plumes.push(makePlume(thing, source, end, cfg));
    }

    for (let i = 0; i < 40; i++) {
      const a = rr(0, TAU), d = rr(150, 2300);
      landmarks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d,
                       r: rr(8, 22), kind: rnd() < 0.6 ? 'rock' : 'tree', seed: rnd() });
    }

    hudTotal.textContent = cfg.count;
    hudFound.textContent = 0;
    hudLevel.textContent = lv;
    showMsg(lv === 1 ? 'Something smells interesting…' : `Level ${lv}`,
            lv === 1 ? 'Wisps get clearer near the centre of your nose. Follow them to where they are thickest.' : '', 2600);
  }

  let msgTimer = 0;
  function showMsg(text, sub, ms) {
    msgEl.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    msgEl.style.opacity = 1;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.style.opacity = 0; }, ms);
  }

  // ---------- input ----------
  const keys = new Set();
  window.addEventListener('keydown', e => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const pointer = { down: false, x: 0, y: 0 };
  canvas.addEventListener('pointerdown', e => { pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
  canvas.addEventListener('pointerup', () => { pointer.down = false; });
  canvas.addEventListener('pointercancel', () => { pointer.down = false; });

  let sniffHeld = false;
  sniffBtn.addEventListener('pointerdown', e => { sniffHeld = true; sniffBtn.classList.add('on'); e.preventDefault(); });
  const sniffOff = () => { sniffHeld = false; sniffBtn.classList.remove('on'); };
  sniffBtn.addEventListener('pointerup', sniffOff);
  sniffBtn.addEventListener('pointercancel', sniffOff);
  sniffBtn.addEventListener('pointerleave', sniffOff);

  // ---------- update ----------
  function update(dt) {
    time += dt;
    const wantSniff = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || sniffHeld;
    sniff += ((wantSniff ? 1 : 0) - sniff) * Math.min(1, dt * 8);

    // movement: keys or drag toward pointer
    let ax = 0, ay = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    if (pointer.down) {
      const dx = pointer.x - W / 2, dy = pointer.y - H / 2;
      const d = Math.hypot(dx, dy);
      if (d > 12) { const k = Math.min(1, d / 160); ax += (dx / d) * k; ay += (dy / d) * k; }
    }
    const al = Math.hypot(ax, ay);
    if (al > 1) { ax /= al; ay /= al; }
    const speed = 260 * (1 - 0.55 * sniff);   // you slow down to sniff properly
    player.vx += (ax * speed - player.vx) * Math.min(1, dt * 7);
    player.vy += (ay * speed - player.vy) * Math.min(1, dt * 7);
    player.x += player.vx * dt; player.y += player.vy * dt;
    const pd = Math.hypot(player.x, player.y);
    if (pd > 2500) { player.x *= 2500 / pd; player.y *= 2500 / pd; }

    // spawn wisps on nodes near the lens
    const R = lensRadius();
    const spawnR = R + 120;
    const spawnR2 = spawnR * spawnR;
    for (const pl of plumes) {
      if (pl.found) continue;
      const wx = Math.cos(pl.wind + Math.sin(time * 0.13) * 0.6) * 9;
      const wy = Math.sin(pl.wind + Math.sin(time * 0.13) * 0.6) * 9;
      for (const nd of pl.nodes) {
        const dx = nd.x - player.x, dy = nd.y - player.y;
        if (dx * dx + dy * dy > spawnR2) continue;
        if (particles.length >= MAX_PARTICLES) break;
        // thicker smell → more, tighter, brighter wisps
        const rate = (0.6 + 3.4 * nd.s) * dt;
        if (rnd() < rate) {
          const spread = 10 + (1 - nd.s) * 46;
          const a = rr(0, TAU), m = rr(0, spread);
          particles.push({
            x: nd.x + Math.cos(a) * m, y: nd.y + Math.sin(a) * m,
            vx: nd.dirx * rr(6, 18) + wx + rr(-6, 6),
            vy: nd.diry * rr(6, 18) + wy + rr(-6, 6),
            life: 0, max: rr(2.2, 4.2),
            size: (14 + rr(0, 10)) * (0.7 + 0.6 * nd.s) + (1 - nd.s) * 10,
            alpha: 0.25 + 0.75 * nd.s,
            hue: pl.thing.hue, ph: rr(0, TAU),
          });
        }
      }
    }

    // move wisps
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.x += (p.vx + Math.sin(time * 1.3 + p.ph) * 6) * dt;
      p.y += (p.vy + Math.cos(time * 1.1 + p.ph) * 6) * dt;
    }

    // did we reach a source?
    for (const pl of plumes) {
      if (pl.found) continue;
      if (Math.hypot(pl.source.x - player.x, pl.source.y - player.y) < 42) {
        pl.found = true; found++; flash = 1;
        hudFound.textContent = found;
        awardExp(pl, levelConfig(level));
        const left = plumes.filter(p => !p.found).length;
        showMsg(`${pl.thing.glyph} Found the ${pl.thing.name}!`,
                left ? `${left} more smell${left > 1 ? 's' : ''} out there.` : 'That is all of them.', 2200);
        if (!left) levelDoneAt = time + 2.4;
      }
    }
    if (levelDoneAt && time > levelDoneAt) { level++; buildLevel(level); }
    flash = Math.max(0, flash - dt * 1.6);
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].life += dt;
      if (popups[i].life >= popups[i].max) popups.splice(i, 1);
    }
  }

  function lensRadius() {
    const breath = 1 + Math.sin(time * 1.1) * 0.025;   // the lens breathes
    return Math.min(W, H) * 0.42 * rankBonus() * (1 - 0.38 * sniff) * breath;
  }

  // ---------- render ----------
  function render() {
    const cx = W / 2, cy = H / 2;
    const R = lensRadius();
    // how fast clarity falls off from the centre. sniffing tightens the lens
    // but lets you see the whole of it clearly.
    const clearR = R * (0.3 + 0.55 * sniff);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ground
    if (!groundPattern) groundPattern = ctx.createPattern(ground, 'repeat');
    ctx.save();
    ctx.translate(cx - player.x, cy - player.y);
    ctx.fillStyle = groundPattern;
    ctx.fillRect(player.x - cx, player.y - cy, W, H);
    ctx.restore();

    // landmarks
    for (const lm of landmarks) {
      const sx = lm.x - player.x + cx, sy = lm.y - player.y + cy;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d > R + lm.r) continue;
      if (lm.kind === 'rock') {
        ctx.fillStyle = 'rgba(52,58,66,0.9)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, lm.r, lm.r * 0.65, lm.seed * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(80,88,96,0.5)';
        ctx.beginPath(); ctx.ellipse(sx - lm.r * 0.25, sy - lm.r * 0.2, lm.r * 0.4, lm.r * 0.22, lm.seed * 3, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(60,50,40,0.9)';
        ctx.beginPath(); ctx.arc(sx, sy, lm.r * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(30,60,38,0.4)';
        ctx.beginPath(); ctx.arc(sx, sy, lm.r * 1.4, 0, TAU); ctx.fill();
      }
    }

    // sources (only visible when close to the lens centre, like everything else)
    for (const pl of plumes) {
      if (pl.found) continue;
      const sx = pl.source.x - player.x + cx, sy = pl.source.y - player.y + cy;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d > R) continue;
      const clarity = Math.max(0, 1 - Math.max(0, (d - clearR) / (R - clearR)));
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * clarity;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
      glow.addColorStop(0, `hsla(${pl.thing.hue}, 90%, 65%, 0.55)`);
      glow.addColorStop(1, `hsla(${pl.thing.hue}, 90%, 65%, 0)`);
      ctx.fillStyle = glow; ctx.fillRect(sx - 60, sy - 60, 120, 120);
      ctx.filter = clarity < 0.95 ? `blur(${(1 - clarity) * 8}px)` : 'none';
      ctx.font = '34px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pl.thing.glyph, sx, sy + 2);
      ctx.restore();
    }

    // wisps: blurry and faint at the edge of the lens, crisp near the centre
    ctx.globalCompositeOperation = 'lighter';
    const R2 = R * R;
    for (const p of particles) {
      const sx = p.x - player.x + cx, sy = p.y - player.y + cy;
      const dx = sx - cx, dy = sy - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2 * 1.1) continue;
      const d = Math.sqrt(d2);
      const far = Math.min(1, Math.max(0, (d - clearR) / (R - clearR)));   // 0 centre … 1 edge
      const fade = Math.sin((p.life / p.max) * Math.PI);                   // in and out over life
      const blur = 1 + far * far * 2.6;
      const size = p.size * blur * (1 + 0.35 * sniff);
      const alpha = p.alpha * fade * (1 - far * 0.8) / blur * (0.7 + 0.5 * sniff);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite(p.hue), sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // the lens: clear in the middle, tapering into darkness
    const vig = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    vig.addColorStop(0.85, 'rgba(0,0,0,0.85)');
    vig.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    // hard edge beyond the lens
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, R, 0, TAU, true);
    ctx.fill();

    // a faint rim so the circle reads as a lens
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.08 * sniff})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, TAU); ctx.stroke();

    // the nose itself
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();

    // floating exp text
    for (const pu of popups) {
      if (pu.life < 0) continue;
      const t = pu.life / pu.max;
      const a = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
      const y = cy - 40 - t * 70;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 12;
      ctx.fillStyle = `hsl(${pu.hue}, 90%, 75%)`;
      ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(pu.text, cx, y);
      if (pu.sub) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '400 14px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillText(pu.sub, cx, y + 24);
      }
      ctx.restore();
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  buildLevel(level);
  updateExpHud();
  requestAnimationFrame(frame);

  // small debug handle for poking at a running game from the console
  window.__nose = { player, get plumes() { return plumes; }, get level() { return level; }, get found() { return found; }, prog, rankOf };
})();
