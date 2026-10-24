// Nose — a game about being a dog, which is to say a game about smelling.
//
// You are the single eye where a dog's nose should be: a lens of light on a
// dark field. Smells drift through the dark as coloured wisps, crisp near the
// centre of the lens and blurry at its rim. Every walk the neighbourhood is
// thick with them:
//
//   trails   something moved through here and left a line to follow
//   marks    pee-mail from the dogs of the neighbourhood, on posts and trees
//   pools    low places where old smells settle in layers, like sediment
//   air      scents carried on the wind from far off, follow them upwind
//
// Hold sniff on a smell to READ it. Reading is where the fun is: who, how
// long ago, what mood, which way they went. Then your human whistles, and you
// go home a little wiser.

(() => {
  // ---------- dom ----------
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const hud = { walk: $('walkNo'), clock: $('clock'), wind: $('windLabel'), rank: $('rank'), fill: $('expfill'), exptext: $('exptext') };
  const msgEl = $('msg'), readEl = $('read');
  const sniffBtn = $('sniff'), markBtn = $('mark'), journalBtn = $('journalBtn');
  const journalEl = $('journal'), summaryEl = $('summary');

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

  // ---------- utils ----------
  const TAU = Math.PI * 2;
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const params = new URLSearchParams(location.search);
  let seedBase = parseInt(params.get('seed'), 10);
  if (!Number.isFinite(seedBase)) seedBase = (Math.random() * 1e9) | 0;

  // how old a smell is, as text and as a 0..1 number for how faded it looks
  function ageText(min) {
    if (min < 3) return 'Still warm.';
    if (min < 60) return `About ${Math.round(min / 5) * 5 || 5} minutes ago.`;
    if (min < 90) return 'An hour ago, give or take.';
    if (min < 60 * 20) return `${Math.round(min / 60)} hours ago.`;
    if (min < 60 * 36) return 'Yesterday.';
    return `${Math.round(min / 1440)} days old, nearly gone.`;
  }
  const ageNorm = min => clamp(Math.log(1 + min) / Math.log(1 + 4320), 0, 1);
  // lines that say "still warm" are kept for smells that actually are
  function lineFor(subject, ageMin) {
    const fresh = /still|warm|steaming|panic|look at you/i;
    const ok = ageMin < 90 ? subject.lines : subject.lines.filter(l => !fresh.test(l));
    return pick(ok.length ? ok : subject.lines);
  }

  // ---------- the smellable world ----------
  const THINGS = [
    { key: 'sausage', name: 'a sausage', glyph: '🌭', hue: 18, lines: ['Pork. Dropped, not thrown. Nobody is coming back for it.', 'Sausage. Still a little warm from a pocket.'] },
    { key: 'bone', name: 'a bone', glyph: '🦴', hue: 48, lines: ['A bone. Someone buried this badly.', 'Old marrow. Another dog gave up on it. Their loss.'] },
    { key: 'sock', name: 'an old sock', glyph: '🧦', hue: 275, lines: ['A sock. Feet, laundry soap, a whole person in one sock.', 'Sock. Worn two days. Left foot.'] },
    { key: 'pie', name: 'a pie', glyph: '🥧', hue: 345, lines: ['Butter and apples. A windowsill somewhere has lost a pie.', 'Pie. Still steaming on the inside.'] },
    { key: 'fish', name: 'a fish', glyph: '🐟', hue: 195, lines: ['Fish. River fish. Someone carried it in a bag that leaked.', 'Fish, a day out of the water. Wonderful.'] },
    { key: 'cheese', name: 'some cheese', glyph: '🧀', hue: 55, lines: ['Cheese. The strong kind. Left out on purpose, surely.'] },
    { key: 'ball', name: 'a tennis ball', glyph: '🎾', hue: 85, lines: ['Rubber, felt, and the hands of a child. A ball.', 'Tennis ball. Chewed by a dog you do not know.'] },
    { key: 'glove', name: 'a lost glove', glyph: '🧤', hue: 210, lines: ['Wool and one cold hand. A glove, lost and missed.'] },
  ];
  const CREATURES = [
    { key: 'squirrel', name: 'a squirrel', glyph: '🐿️', hue: 25, bolts: true, caught: 'up a tree, scolding you', lines: ['A squirrel. Nervous, fast, full of acorns.', 'Squirrel. It stopped here to look at you first.'] },
    { key: 'cat', name: 'a cat', glyph: '🐈', hue: 300, bolts: true, caught: 'on a fence, pretending not to care', lines: ['Cat. Unbothered. It walked, it did not run.', 'A cat, well fed, from the house with the blue door.'] },
    { key: 'fox', name: 'a fox', glyph: '🦊', hue: 15, bolts: false, caught: 'long gone, but this is where it slept', lines: ['Fox. Musk and bins. It comes through most nights.', 'Fox. A vixen. She has cubs somewhere near.'] },
    { key: 'rabbit', name: 'a rabbit', glyph: '🐇', hue: 100, bolts: true, caught: 'in a burrow, out of reach', lines: ['Rabbit. Clover breath. It zigzagged, you can smell the panic.'] },
    { key: 'hedgehog', name: 'a hedgehog', glyph: '🦔', hue: 40, bolts: false, caught: 'curled up tight under a hedge', lines: ['Hedgehog. Slugs and leaf mould. It is not in a hurry, ever.'] },
  ];
  const AIR_SOURCES = [
    { key: 'bbq', name: 'a barbecue', glyph: '🍖', hue: 10, lines: ['Charcoal and fat on the wind. Somebody is grilling, upwind.'], found: 'A barbecue. People, sausages, a dropped one if you wait.' },
    { key: 'bakery', name: 'a bakery', glyph: '🥐', hue: 42, lines: ['Warm bread on the wind. Upwind. Follow it.'], found: 'The bakery. The whole street smells like morning here.' },
    { key: 'bins', name: 'the bins', glyph: '🗑️', hue: 110, lines: ['Bins. A rich, complicated smell. Upwind, and not far.'], found: 'Bin day. Chicken bones, coffee grounds, a pizza box. Paradise.' },
    { key: 'grass', name: 'cut grass', glyph: '🌱', hue: 95, lines: ['Cut grass on the wind. Green and wet.'], found: 'The mown lawn. Every blade of grass is shouting.' },
    { key: 'rain', name: 'rain coming', glyph: '🌧️', hue: 205, lines: ['Wet stone and ozone on the wind. Rain, in about an hour.'], found: 'The puddle where the first rain fell. You smelled it coming.' },
  ];
  const DOG_NAMES = ['Biscuit', 'Mabel', 'Otto', 'Pickle', 'Juno', 'Rufus', 'Wendy', 'Moose', 'Pepper', 'Hugo', 'Olive', 'Ziggy', 'Nell', 'Bruno', 'Daisy', 'Frank'];
  const BREEDS = ['beagle', 'greyhound', 'terrier', 'labrador', 'spaniel', 'collie', 'dachshund', 'whippet', 'mongrel of distinction', 'poodle', 'husky', 'old sheepdog'];
  const MOODS = ['happy', 'anxious', 'bored', 'very pleased with himself', 'very pleased with herself', 'in a hurry', 'lovesick', 'grumpy', 'curious', 'sleepy'];
  const DOG_DETAILS = ['Ate chicken for breakfast.', 'Just had a bath. Poor thing.', 'Rolled in something dead recently. Respect.', 'Has a new collar.', 'Walked by someone different today.', 'Is getting old.', 'Is a puppy still, really.', 'Has been to the vet. Smells of worry.', 'Had cheese. Someone spoils them.', 'Was running. Chasing something.'];
  const POOL_LAYERS = [
    { hue: 15, text: 'A fox nosed around here.', age: [600, 1800] },
    { hue: 205, text: 'Rain pooled here and dried.', age: [1200, 4000] },
    { hue: 48, text: 'A child dropped a biscuit. Ants finished it.', age: [120, 900] },
    { hue: 300, text: 'A cat sat here a long time, watching birds.', age: [200, 1200] },
    { hue: 100, text: 'Rabbits, many, in the dark.', age: [300, 700] },
    { hue: 60, text: 'Someone sat on this grass and cried a little.', age: [100, 500] },
    { hue: 190, text: 'A hose was left running. Wet earth, worms.', age: [60, 400] },
    { hue: 30, text: 'A dog you do not know yet marked right here, twice.', age: [30, 300] },
  ];
  const RANKS = ['Pup', 'Sniffer', 'Tracker', 'Hound', 'Bloodhound', 'Legend'];

  // ---------- save data ----------
  const SAVE_KEY = 'nose.save';
  const save = { exp: 0, walks: 0, journal: {}, dogs: null, markedLastWalk: 0 };
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    if (Number.isFinite(sv.exp)) save.exp = sv.exp;
    if (Number.isFinite(sv.walks)) save.walks = sv.walks;
    if (sv.journal && typeof sv.journal === 'object') save.journal = sv.journal;
    if (Array.isArray(sv.dogs)) save.dogs = sv.dogs;
    if (Number.isFinite(sv.markedLastWalk)) save.markedLastWalk = sv.markedLastWalk;
    // older save from the first prototype
    if (!sv.exp) { const old = JSON.parse(localStorage.getItem('nose.exp') || '{}'); if (Number.isFinite(old.exp)) save.exp = old.exp; }
  } catch (e) { /* no storage; the walk still happens */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // the dogs of the neighbourhood are made once and come back walk after walk
  if (!save.dogs) {
    const r = mulberry32(seedBase ^ 0x5eed);
    const names = DOG_NAMES.slice(), breeds = BREEDS.slice();
    save.dogs = [];
    for (let i = 0; i < 6; i++) {
      const name = names.splice(Math.floor(r() * names.length), 1)[0];
      const breed = breeds.splice(Math.floor(r() * breeds.length), 1)[0];
      save.dogs.push({ name, breed, hue: Math.floor(r() * 360), she: r() < 0.5 });
    }
    persist();
  }

  const expForRank = r => 400 * r * (r + 1) / 2;
  function rankOf(exp) { let r = 0; while (r + 1 < RANKS.length && exp >= expForRank(r + 1)) r++; return r; }
  const rankBonus = () => 1 + rankOf(save.exp) * 0.03;
  function updateExpHud() {
    const r = rankOf(save.exp), maxed = r >= RANKS.length - 1;
    const lo = expForRank(r), hi = expForRank(r + 1);
    hud.rank.textContent = RANKS[r];
    hud.fill.style.width = (maxed ? 100 : ((save.exp - lo) / (hi - lo)) * 100) + '%';
    hud.exptext.textContent = maxed ? `${save.exp} exp` : `${save.exp} / ${hi} exp`;
  }

  // ---------- sprites ----------
  const spriteCache = new Map();
  function sprite(hue, sat) {
    const k = hue + ':' + sat;
    if (spriteCache.has(k)) return spriteCache.get(k);
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `hsla(${hue}, ${sat}%, 72%, 0.9)`);
    grad.addColorStop(0.35, `hsla(${hue}, ${sat}%, 60%, 0.45)`);
    grad.addColorStop(1, `hsla(${hue}, ${sat}%, 50%, 0)`);
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    spriteCache.set(k, c);
    return c;
  }
  const satFor = ageN => Math.round(88 - ageN * 58);   // old smells go grey

  const ground = document.createElement('canvas');
  ground.width = ground.height = 512;
  {
    const g = ground.getContext('2d'), r = mulberry32(1234);
    g.fillStyle = '#04060a'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120,150,130,${0.05 + r() * 0.1})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * 512, y = r() * 512;
      g.strokeStyle = `rgba(90,130,100,${0.12 + r() * 0.12})`; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y - 4 - r() * 7); g.stroke(); }
    }
  }
  let groundPattern = null;

  // ---------- state ----------
  const WALK_SECONDS = 270;
  const player = { x: 0, y: 0, vx: 0, vy: 0 };
  let posts = [], decor = [], smells = [], particles = [], popups = [], creatures = [];
  let time = 0, walkT = 0, walkOver = false, paused = false;
  let sniff = 0, flash = 0;
  let wind = { a: 0, target: 0, speed: 1 };
  let reading = null;   // { smell, part, t }
  const walkStats = { read: 0, found: 0, exp: 0, newKeys: [] };
  const MAX_PARTICLES = 3000;

  // ---------- messages ----------
  let msgTimer = 0, readTimer = 0;
  function showMsg(text, sub, ms) {
    msgEl.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    msgEl.style.opacity = 1; clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.style.opacity = 0; }, ms);
  }
  function showRead(text, ms) {
    readEl.textContent = text; readEl.classList.add('show'); clearTimeout(readTimer);
    readTimer = setTimeout(() => readEl.classList.remove('show'), ms || 5200);
  }

  // ---------- exp & journal ----------
  function journalAdd(key, name, glyph, kind, line) {
    const j = save.journal;
    const isNew = !j[key];
    if (isNew) { j[key] = { name, glyph, kind, count: 0, firstWalk: save.walks + 1, line }; walkStats.newKeys.push(key); }
    j[key].count++;
    if (line) j[key].line = line;
    persist();
    return isNew;
  }
  function awardExp(gain, label, hue) {
    const before = rankOf(save.exp);
    save.exp += gain; walkStats.exp += gain;
    persist(); updateExpHud();
    popups.push({ text: `+${gain} exp`, sub: label || '', hue: hue ?? 50, life: 0, max: 2.2 });
    const after = rankOf(save.exp);
    if (after > before) {
      popups.push({ text: `Rank up: ${RANKS[after]}`, sub: 'your nose reaches further', hue: 50, life: -1.3, max: 3.2 });
      flash = Math.max(flash, 1.2);
    }
  }

  // ---------- building a walk ----------
  // trails are trees of nodes rooted at the source; the trunk reaches toward
  // somewhere you will plausibly pass, branches thin out into dead ends.
  function pathNodes(from, to, s0, s1, wiggle, meander, out) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    const n = Math.max(2, Math.round(len / 36)), nx = -dy / len, ny = dx / len;
    const f1 = rr(0.7, 1.6), f2 = rr(2.2, 4.2), p1 = rr(0, TAU), p2 = rr(0, TAU);
    let drift = 0; const seg = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, pin = Math.sin(t * Math.PI);
      drift += (rnd() - 0.5) * meander; drift *= 0.92;
      const off = (Math.sin(t * TAU * f1 + p1) * 0.6 + Math.sin(t * TAU * f2 + p2) * 0.4) * wiggle * pin + drift * pin * 6;
      const nd = { x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off, s: s0 + (s1 - s0) * t, dirx: dx / len, diry: dy / len };
      seg.push(nd); out.push(nd);
    }
    return seg;
  }
  function makeTrail(subject, source, end, cfg, isCreature) {
    const nodes = [];
    const trunk = pathNodes(source, end, 1, cfg.endStrength, rr(90, 170), 7, nodes);
    for (let b = 0; b < cfg.branches; b++) {
      const at = trunk[Math.floor(trunk.length * rr(0.2, 0.85))];
      const ang = Math.atan2(at.diry, at.dirx) + (rnd() < 0.5 ? 1 : -1) * rr(0.6, 1.5);
      const blen = rr(cfg.branchLen * 0.6, cfg.branchLen);
      const sub = pathNodes(at, { x: at.x + Math.cos(ang) * blen, y: at.y + Math.sin(ang) * blen }, at.s * rr(0.75, 0.95), 0, rr(60, 120), 9, nodes);
      if (rnd() < cfg.fork) {
        const at2 = sub[Math.floor(sub.length * rr(0.3, 0.7))], ang2 = ang + (rnd() < 0.5 ? 1 : -1) * rr(0.5, 1.2), l2 = blen * rr(0.4, 0.7);
        pathNodes(at2, { x: at2.x + Math.cos(ang2) * l2, y: at2.y + Math.sin(ang2) * l2 }, at2.s * 0.9, 0, 60, 9, nodes);
      }
    }
    const age = isCreature ? rr(4, 120) : rr(10, 400);
    return { kind: 'trail', subject, source: { ...source }, nodes, hue: subject.hue, age, ageN: ageNorm(age), found: false, read: false,
             isCreature, hint: 0, hintDir: 0, spawn: { spread: 10, spreadFar: 46, size: 1, speed: 1, alpha: 1, rate: 1 } };
  }
  function makeMark(post, dog, overYou) {
    const age = overYou ? rr(10, 600) : rr(8, 60 * 50);
    const mood = pick(MOODS).replace('himself', dog.she ? 'herself' : 'himself').replace('herself', dog.she ? 'herself' : 'himself');
    let text = `${dog.name}. ${dog.breed[0].toUpperCase() + dog.breed.slice(1)}, ${dog.she ? 'she' : 'he'} is ${mood}. ${pick(DOG_DETAILS)} ${ageText(age)}`;
    if (overYou) text = `${dog.name}, right over your mark from last walk. ${dog.she ? 'She' : 'He'} is ${mood}. Rude, frankly. ${ageText(age)}`;
    post.mark = { kind: 'mark', dog, post, x: post.x, y: post.y, hue: dog.hue, age, ageN: ageNorm(age), read: false, text,
                  nodes: [{ x: post.x, y: post.y - 8, s: 0.9 - ageNorm(age) * 0.5, dirx: 0, diry: -1 }],
                  spawn: { spread: 14, spreadFar: 30, size: 0.9, speed: 0.6, alpha: 0.9, rate: 1.6 } };
    return post.mark;
  }
  function makePool(center, r) {
    const layers = []; const pool = POOL_LAYERS.slice();
    for (let i = 0; i < 3; i++) {
      const L = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const age = rr(L.age[0], L.age[1]);
      layers.push({ hue: L.hue, text: L.text, age, read: false });
    }
    layers.sort((a, b) => a.age - b.age);   // newest on top, you dig down into the past
    const nodes = [];
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU), d = Math.sqrt(rnd()) * r * 0.8;
      const L = layers[i % layers.length];
      nodes.push({ x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, s: 0.35, dirx: 0, diry: 0, hue: L.hue, ageN: ageNorm(L.age) });
    }
    return { kind: 'pool', x: center.x, y: center.y, r, layers, nodes, hue: layers[0].hue, ageN: ageNorm(layers[0].age), depth: 0,
             spawn: { spread: 30, spreadFar: 50, size: 1.8, speed: 0.25, alpha: 0.45, rate: 0.5 } };
  }
  function makeAir(src, pos) {
    return { kind: 'air', subject: src, source: pos, x: pos.x, y: pos.y, hue: src.hue, age: 0, ageN: 0, found: false, read: false, nodes: [],
             spawn: { spread: 18, spreadFar: 70, size: 1.1, speed: 1, alpha: 0.7, rate: 0.9 } };
  }
  // the air stream is re-laid every frame so it swings with the wind
  function layAirStream(sm) {
    const wx = Math.cos(wind.a), wy = Math.sin(wind.a);
    const len = 1500, n = 42;
    if (sm.nodes.length !== n + 1) { sm.nodes = []; for (let i = 0; i <= n; i++) sm.nodes.push({ x: 0, y: 0, s: 0, dirx: 0, diry: 0, wob: rr(0, TAU) }); }
    for (let i = 0; i <= n; i++) {
      const t = i / n, nd = sm.nodes[i], d = t * len;
      const side = Math.sin(t * 5 + time * 0.25 + nd.wob) * d * 0.09;   // the plume wavers
      nd.x = sm.source.x + wx * d - wy * side; nd.y = sm.source.y + wy * d + wx * side;
      nd.s = 1 - t * 0.85; nd.dirx = wx; nd.diry = wy;
    }
  }

  function walkConfig(n) {
    return {
      things: 2, creatures: Math.min(1 + Math.floor(n / 2), 3), marks: Math.min(5 + n, 9), pools: 2, airs: Math.min(1 + Math.floor(n / 3), 2),
      dist: [850 + n * 40, 1250 + n * 80], endStrength: Math.max(0.12, 0.42 - n * 0.03),
      branches: Math.min(1 + Math.floor(n / 2), 4), branchLen: 380 + n * 50, fork: Math.min(0.15 + n * 0.08, 0.7),
    };
  }

  function buildWalk() {
    const n = save.walks + 1;
    rnd = mulberry32(seedBase + n * 7919);
    const cfg = walkConfig(n);
    posts = []; decor = []; smells = []; particles = []; popups = []; creatures = [];
    player.x = player.y = player.vx = player.vy = 0;
    walkT = 0; walkOver = false; reading = null;
    walkStats.read = walkStats.found = walkStats.exp = 0; walkStats.newKeys = [];
    readEl.classList.remove('show'); msgEl.style.opacity = 0;
    wind.a = rr(0, TAU); wind.target = wind.a; wind.speed = rr(0.6, 1.4);

    // posts: things dogs mark. hydrants, lamps, trees, benches, the gate you came in by
    const POST_KINDS = [['hydrant', '🚒'], ['lamp post', '💡'], ['tree', '🌳'], ['bench', '🪑'], ['bin', '🗑️'], ['gate post', '🚪']];
    posts.push({ x: 60, y: -40, kind: 'gate post', mark: null, yours: false });
    for (let i = 0; i < 14; i++) {
      const a = rr(0, TAU), d = rr(220, 1700);
      posts.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, kind: pick(POST_KINDS)[0], mark: null, yours: false });
    }
    for (let i = 0; i < 36; i++) {
      const a = rr(0, TAU), d = rr(150, 2300);
      decor.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rr(8, 22), kind: rnd() < 0.6 ? 'rock' : 'bush', seed: rnd() });
    }

    // trails
    const baseAng = rr(0, TAU); let slot = 0;
    const total = cfg.things + cfg.creatures;
    const things = THINGS.slice(), crits = CREATURES.slice();
    for (let i = 0; i < total; i++, slot++) {
      const isCreature = i >= cfg.things;
      const subject = isCreature ? crits.splice(Math.floor(rnd() * crits.length), 1)[0] : things.splice(Math.floor(rnd() * things.length), 1)[0];
      const ang = baseAng + (slot / total) * TAU + rr(-0.4, 0.4), d = rr(cfg.dist[0], cfg.dist[1]);
      const source = { x: Math.cos(ang) * d, y: Math.sin(ang) * d };
      const endD = 110 + slot * 230 + rr(0, 120), endA = ang + rr(-1.2, 1.2);
      const tr = makeTrail(subject, source, { x: Math.cos(endA) * endD, y: Math.sin(endA) * endD }, cfg, isCreature);
      smells.push(tr);
      if (isCreature) creatures.push({ trail: tr, x: source.x, y: source.y, bolted: 0, fleeing: null });
    }
    // marks: the neighbourhood dogs have been busy
    const dogs = save.dogs.slice();
    const markPosts = posts.slice(1).sort(() => rnd() - 0.5).slice(0, cfg.marks);
    let overYouDone = save.markedLastWalk === 0;
    markPosts.forEach((p, i) => {
      const dog = dogs[i % dogs.length];
      const over = !overYouDone && i > 0; if (over) overYouDone = true;
      smells.push(makeMark(p, dog, over));
    });
    // pools
    for (let i = 0; i < cfg.pools; i++) {
      const a = rr(0, TAU), d = rr(350, 1300);
      smells.push(makePool({ x: Math.cos(a) * d, y: Math.sin(a) * d }, rr(130, 210)));
    }
    // air: far-off sources whose scent streams downwind, so you'll meet the plume somewhere
    const airs = AIR_SOURCES.slice();
    for (let i = 0; i < cfg.airs; i++) {
      const src = airs.splice(Math.floor(rnd() * airs.length), 1)[0];
      // put the source upwind of a point near the start, so the stream crosses your path
      const near = { x: rr(-250, 250), y: rr(-250, 250) }, d = rr(700, 1100);
      const pos = { x: near.x - Math.cos(wind.a) * d, y: near.y - Math.sin(wind.a) * d };
      smells.push(makeAir(src, pos));
    }

    hud.walk.textContent = n;
    updateExpHud();
    showMsg(n === 1 ? 'Out the gate. Nose down.' : `Walk ${n}`,
            n === 1 ? 'Hold Space on a smell to read it. Everything here has a story.' : pick(['Something new on the wind.', 'The neighbourhood has been busy.', 'Fresh marks on the posts today.']), 3200);
  }

  // ---------- input ----------
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyJ') { toggleJournal(); return; }
    if (e.code === 'Enter' && walkOver) { nextWalk(); return; }
    if (e.code === 'KeyM') { tryMark(); }
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
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', e => { on(); el.classList.add('on'); e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { off(); el.classList.remove('on'); });
  };
  hold(sniffBtn, () => { sniffHeld = true; }, () => { sniffHeld = false; });
  markBtn.addEventListener('pointerdown', e => { e.preventDefault(); tryMark(); });
  journalBtn.addEventListener('pointerdown', e => { e.preventDefault(); toggleJournal(); });
  journalEl.addEventListener('pointerdown', () => toggleJournal(false));
  $('nextWalk').addEventListener('click', nextWalk);

  // ---------- journal / summary ----------
  function toggleJournal(force) {
    const show = force === undefined ? !journalEl.classList.contains('show') : force;
    if (walkOver) return;
    journalEl.classList.toggle('show', show); paused = show;
    if (!show) return;
    const j = save.journal, entries = Object.values(j);
    $('journalSub').textContent = `${entries.length} smells known · ${save.walks} walk${save.walks === 1 ? '' : 's'} so far · rank ${RANKS[rankOf(save.exp)]}`;
    const li = e => `<li><span class="g">${e.glyph}</span><span class="n">${e.name}${e.line ? `<span class="d">${e.line}</span>` : ''}</span><span class="c">×${e.count}</span></li>`;
    const dogsHtml = entries.filter(e => e.kind === 'dog').map(li).join('') || '<li><span class="n" style="color:rgba(255,255,255,.4)">No pee-mail read yet. Sniff a post.</span></li>';
    const rest = entries.filter(e => e.kind !== 'dog').map(li).join('') || '<li><span class="n" style="color:rgba(255,255,255,.4)">Nothing yet. Nose down.</span></li>';
    $('jDogs').innerHTML = dogsHtml; $('jThings').innerHTML = rest;
  }
  function endWalk() {
    walkOver = true; paused = true; reading = null; keys.clear();
    save.walks++; save.markedLastWalk = posts.filter(p => p.yours).length; persist();
    $('sumSub').textContent = pick(['Your human whistles. You pretend not to hear, then you hear.', 'Your human calls. One last sniff, then home.', 'Time to go. The smells will keep until tomorrow. Mostly.']);
    $('sRead').textContent = walkStats.read; $('sFound').textContent = walkStats.found; $('sExp').textContent = walkStats.exp;
    const items = walkStats.newKeys.map(k => save.journal[k]).filter(Boolean);
    $('sNew').innerHTML = items.length ? items.map(e => `<li><span class="g">${e.glyph}</span><span class="n">${e.name}</span></li>`).join('')
                                       : '<li><span class="n" style="color:rgba(255,255,255,.4)">Nothing new today. Old friends, old smells.</span></li>';
    summaryEl.classList.add('show');
  }
  function nextWalk() { summaryEl.classList.remove('show'); paused = false; buildWalk(); }

  // ---------- actions ----------
  function tryMark() {
    if (paused || walkOver) return;
    let best = null, bd = 70;
    for (const p of posts) { const d = dist(p, player); if (d < bd) { bd = d; best = p; } }
    if (!best) { showRead('Nothing here worth marking. Find a post.', 1800); return; }
    if (best.yours) { showRead(`You already marked this ${best.kind}. Twice is just showing off.`, 2000); return; }
    best.yours = true;
    const over = best.mark ? ` Right over ${best.mark.dog.name}'s. ${best.mark.dog.she ? 'She' : 'He'} will know.` : '';
    showRead(`You mark the ${best.kind}.${over} This is yours now.`, 3200);
    awardExp(25, 'marked', 50);
    particles.push(...Array.from({ length: 24 }, () => ({ x: best.x + rr(-8, 8), y: best.y + rr(-6, 6), vx: rr(-10, 10), vy: rr(-22, -6), life: 0, max: rr(1.5, 3), size: rr(10, 20), alpha: 0.7, hue: 50, sat: 60, ph: rr(0, TAU) })));
  }

  // what can be read from where you stand? returns { smell, part, ref } or null
  function readTarget() {
    let best = null, bd = 1e9;
    for (const sm of smells) {
      if (sm.kind === 'trail') {
        if (sm.found || sm.read) continue;
        for (const nd of sm.nodes) { if (nd.s < 0.05) continue; const d = dist(nd, player); if (d < 48 && d < bd) { bd = d; best = { smell: sm, part: null }; } }
      } else if (sm.kind === 'mark') {
        if (sm.read) continue;
        const d = dist(sm, player); if (d < 72 && d < bd) { bd = d; best = { smell: sm, part: null }; }
      } else if (sm.kind === 'pool') {
        if (sm.depth >= sm.layers.length) continue;
        const d = dist(sm, player); if (d < sm.r * 0.6 && d < bd) { bd = d; best = { smell: sm, part: sm.depth }; }
      } else if (sm.kind === 'air') {
        if (sm.read || sm.found) continue;
        for (const nd of sm.nodes) { const d = dist(nd, player); if (d < 64 && d < bd) { bd = d; best = { smell: sm, part: null }; } }
      }
    }
    return best;
  }
  function finishRead(t) {
    const sm = t.smell; walkStats.read++;
    if (sm.kind === 'trail') {
      sm.read = true;
      const line = lineFor(sm.subject, sm.age) + ' ' + ageText(sm.age) + (sm.isCreature ? ' It went that way.' : ' It is that way.');
      sm.hint = time + 5; sm.hintDir = Math.atan2(sm.source.y - player.y, sm.source.x - player.x);
      showRead(line);
      const isNew = journalAdd(sm.subject.key, sm.subject.name, sm.subject.glyph, sm.isCreature ? 'creature' : 'thing', pick(sm.subject.lines));
      awardExp(30 + (isNew ? 30 : 0), isNew ? 'a new smell' : 'read the trail', sm.hue);
    } else if (sm.kind === 'mark') {
      sm.read = true; showRead(sm.text);
      const isNew = journalAdd('dog:' + sm.dog.name, `${sm.dog.name} the ${sm.dog.breed}`, '🐕', 'dog', sm.text.split('. ').slice(1, 3).join('. ') + '.');
      awardExp(40 + (isNew ? 40 : 0), isNew ? 'a new dog' : 'pee-mail', sm.hue);
    } else if (sm.kind === 'pool') {
      const L = sm.layers[sm.depth]; sm.depth++;
      const deeper = sm.depth < sm.layers.length ? ' Deeper still, something older.' : ' That is the bottom of it.';
      showRead(`${L.text} ${ageText(L.age)}${deeper}`);
      journalAdd('pool:' + L.text, L.text.replace(/\.$/, ''), '🫧', 'layer', ageText(L.age));
      awardExp(35 + sm.depth * 10, sm.depth > 1 ? 'dug into the past' : 'read the ground', L.hue);
    } else if (sm.kind === 'air') {
      sm.read = true; showRead(pick(sm.subject.lines));
      const isNew = journalAdd(sm.subject.key, sm.subject.name, sm.subject.glyph, 'air', pick(sm.subject.lines));
      awardExp(30 + (isNew ? 30 : 0), 'caught it on the wind', sm.hue);
    }
  }

  // ---------- update ----------
  function update(dt) {
    if (paused) return;
    time += dt; walkT += dt;
    if (walkT >= WALK_SECONDS) { endWalk(); return; }
    const left = Math.max(0, WALK_SECONDS - walkT);
    hud.clock.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    hud.clock.classList.toggle('late', left < 30);

    // wind wanders
    if (rnd() < dt * 0.08) wind.target = wind.a + rr(-0.9, 0.9);
    wind.a += (wind.target - wind.a) * Math.min(1, dt * 0.3);
    const dirs = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
    hud.wind.textContent = `wind from the ${dirs[(Math.round(((wind.a + Math.PI) / TAU) * 8) % 8 + 8) % 8]}`;

    const wantSniff = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || sniffHeld;
    sniff += ((wantSniff ? 1 : 0) - sniff) * Math.min(1, dt * 8);

    // move
    let ax = 0, ay = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    if (pointer.down) {
      const dx = pointer.x - W / 2, dy = pointer.y - H / 2, d = Math.hypot(dx, dy);
      if (d > 12) { const k = Math.min(1, d / 160); ax += (dx / d) * k; ay += (dy / d) * k; }
    }
    const al = Math.hypot(ax, ay); if (al > 1) { ax /= al; ay /= al; }
    const speed = 260 * (1 - 0.55 * sniff);
    player.vx += (ax * speed - player.vx) * Math.min(1, dt * 7);
    player.vy += (ay * speed - player.vy) * Math.min(1, dt * 7);
    player.x += player.vx * dt; player.y += player.vy * dt;
    const pd = Math.hypot(player.x, player.y);
    if (pd > 2500) { player.x *= 2500 / pd; player.y *= 2500 / pd; }

    // reading: hold sniff, mostly still, on a smell
    if (wantSniff) {
      const t = readTarget();
      const still = Math.hypot(player.vx, player.vy) < 90;
      if (t && still) {
        if (!reading || reading.smell !== t.smell || reading.part !== t.part) reading = { smell: t.smell, part: t.part, t: 0 };
        reading.t += dt;
        if (reading.t >= 1.1) { finishRead(reading); reading = null; }
      } else reading = null;
    } else reading = null;

    // creatures bolt when you get close, leaving a fresh trail behind them
    for (const c of creatures) {
      const tr = c.trail; if (tr.found) continue;
      if (c.fleeing) {
        c.fleeing.t += dt;
        const k = Math.min(1, c.fleeing.t / 1.1), e = 1 - Math.pow(1 - k, 3);
        c.x = c.fleeing.fx + (c.fleeing.tx - c.fleeing.fx) * e; c.y = c.fleeing.fy + (c.fleeing.ty - c.fleeing.fy) * e;
        if (k >= 1) { tr.source.x = c.x; tr.source.y = c.y; c.fleeing = null; }
        continue;
      }
      const d = dist(c, player);
      if (d < 42) {
        tr.found = true; walkStats.found++; flash = 1;
        showMsg(`${tr.subject.glyph} ${tr.subject.name[0].toUpperCase() + tr.subject.name.slice(1)}, ${tr.subject.caught}.`, 'Found it.', 2600);
        const isNew = journalAdd(tr.subject.key, tr.subject.name, tr.subject.glyph, 'creature', pick(tr.subject.lines));
        awardExp(110 + c.bolted * 40 + (isNew ? 30 : 0), c.bolted ? 'chased it down' : 'found it', tr.hue);
      } else if (d < 130 && tr.subject.bolts && c.bolted < 1) {
        c.bolted++;
        const away = Math.atan2(c.y - player.y, c.x - player.x) + rr(-0.7, 0.7), run = rr(380, 520);
        const to = { x: c.x + Math.cos(away) * run, y: c.y + Math.sin(away) * run };
        const freshNodes = []; pathNodes({ x: c.x, y: c.y }, to, 1, 1, 40, 4, freshNodes);
        for (const nd of freshNodes) { nd.dirx = -nd.dirx; nd.diry = -nd.diry; }   // smell streams back toward you
        tr.nodes.push(...freshNodes);
        tr.age = 0.5; tr.ageN = 0; tr.read = false;
        c.fleeing = { t: 0, fx: c.x, fy: c.y, tx: to.x, ty: to.y };
        showRead(`${tr.subject.name[0].toUpperCase() + tr.subject.name.slice(1)} bolts! The trail is fresh now. Hot, even.`, 3000);
      }
    }
    // things and air sources
    for (const sm of smells) {
      if (sm.kind === 'trail' && !sm.isCreature && !sm.found && dist(sm.source, player) < 42) {
        sm.found = true; walkStats.found++; flash = 1;
        showMsg(`${sm.subject.glyph} Found ${sm.subject.name}!`, lineFor(sm.subject, sm.age), 2600);
        const isNew = journalAdd(sm.subject.key, sm.subject.name, sm.subject.glyph, 'thing', pick(sm.subject.lines));
        awardExp(120 + Math.round(60 * sm.ageN) + (isNew ? 30 : 0), sm.ageN > 0.6 ? 'an old, faint trail' : 'found it', sm.hue);
      }
      if (sm.kind === 'air' && !sm.found && dist(sm.source, player) < 70) {
        sm.found = true; walkStats.found++; flash = 1;
        showMsg(`${sm.subject.glyph} ${sm.subject.name[0].toUpperCase() + sm.subject.name.slice(1)}`, sm.subject.found, 3200);
        journalAdd(sm.subject.key, sm.subject.name, sm.subject.glyph, 'air', sm.subject.found);
        awardExp(170, 'followed the wind to its source', sm.hue);
      }
    }

    // spawn wisps near the lens
    for (const sm of smells) if (sm.kind === 'air') layAirStream(sm);
    const R = lensRadius(), spawnR2 = (R + 120) * (R + 120);
    const wx = Math.cos(wind.a) * 9 * wind.speed, wy = Math.sin(wind.a) * 9 * wind.speed;
    for (const sm of smells) {
      if (sm.found || (sm.kind === 'pool' && sm.depth >= sm.layers.length)) continue;
      const sp = sm.spawn;
      for (const nd of sm.nodes) {
        const dx = nd.x - player.x, dy = nd.y - player.y;
        if (dx * dx + dy * dy > spawnR2) continue;
        if (particles.length >= MAX_PARTICLES) break;
        const ageN = nd.ageN ?? sm.ageN;
        if (rnd() < (0.6 + 3.4 * nd.s) * sp.rate * (1 - ageN * 0.45) * dt) {
          const spread = (sp.spread + (1 - nd.s) * sp.spreadFar) * (1 + ageN * 0.8);
          const a = rr(0, TAU), m = rr(0, spread), spd = rr(6, 18) * sp.speed * (1 - ageN * 0.6);
          particles.push({
            x: nd.x + Math.cos(a) * m, y: nd.y + Math.sin(a) * m,
            vx: nd.dirx * spd + wx * (sm.kind === 'air' ? 3 : 1) + rr(-6, 6), vy: nd.diry * spd + wy * (sm.kind === 'air' ? 3 : 1) + rr(-6, 6),
            life: 0, max: rr(2.2, 4.2) * (1 + ageN * 0.5),
            size: ((14 + rr(0, 10)) * (0.7 + 0.6 * nd.s) + (1 - nd.s) * 10) * sp.size * (1 + ageN * 0.8),
            alpha: (0.25 + 0.75 * nd.s) * sp.alpha * (1 - ageN * 0.5),
            hue: nd.hue ?? sm.hue, sat: satFor(ageN), ph: rr(0, TAU),
          });
        }
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life += dt;
      if (p.life >= p.max) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.x += (p.vx + Math.sin(time * 1.3 + p.ph) * 6) * dt; p.y += (p.vy + Math.cos(time * 1.1 + p.ph) * 6) * dt;
    }
    flash = Math.max(0, flash - dt * 1.6);
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].life += dt; if (popups[i].life >= popups[i].max) popups.splice(i, 1); }
  }

  function lensRadius() {
    const breath = 1 + Math.sin(time * 1.1) * 0.025;
    return Math.min(W, H) * 0.42 * rankBonus() * (1 - 0.38 * sniff) * breath;
  }

  // ---------- render ----------
  // emoji are pre-rendered at a few blur levels; a live blur filter every frame is far too slow
  const glyphCache = new Map();
  function glyphSprite(glyph, size, level) {
    const k = glyph + size + ':' + level;
    if (glyphCache.has(k)) return glyphCache.get(k);
    const pad = 24, s = size + pad * 2, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    if (level > 0) g.filter = `blur(${level * 2}px)`;
    g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(glyph, s / 2, s / 2 + 2);
    glyphCache.set(k, c);
    return c;
  }
  function glyphAt(glyph, sx, sy, size, clarity) {
    const level = Math.round((1 - clarity) * 4);
    const c = glyphSprite(glyph, size, level);
    ctx.globalAlpha = 0.25 + 0.75 * clarity;
    ctx.drawImage(c, sx - c.width / 2, sy - c.height / 2);
    ctx.globalAlpha = 1;
  }
  function render() {
    const cx = W / 2, cy = H / 2, R = lensRadius(), clearR = R * (0.3 + 0.55 * sniff);
    const toS = (x, y) => [x - player.x + cx, y - player.y + cy];
    const clarityAt = d => clamp(1 - Math.max(0, (d - clearR) / (R - clearR)), 0, 1);

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!groundPattern) groundPattern = ctx.createPattern(ground, 'repeat');
    ctx.save(); ctx.translate(cx - player.x, cy - player.y); ctx.fillStyle = groundPattern; ctx.fillRect(player.x - cx, player.y - cy, W, H); ctx.restore();

    // pools are faint darker hollows in the ground
    for (const sm of smells) {
      if (sm.kind !== 'pool') continue;
      const [sx, sy] = toS(sm.x, sm.y); if (Math.hypot(sx - cx, sy - cy) > R + sm.r) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sm.r);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - sm.r, sy - sm.r, sm.r * 2, sm.r * 2);
    }
    for (const lm of decor) {
      const [sx, sy] = toS(lm.x, lm.y); if (Math.hypot(sx - cx, sy - cy) > R + lm.r) continue;
      if (lm.kind === 'rock') {
        ctx.fillStyle = 'rgba(52,58,66,0.9)'; ctx.beginPath(); ctx.ellipse(sx, sy, lm.r, lm.r * 0.65, lm.seed * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(80,88,96,0.5)'; ctx.beginPath(); ctx.ellipse(sx - lm.r * 0.25, sy - lm.r * 0.2, lm.r * 0.4, lm.r * 0.22, lm.seed * 3, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(30,60,38,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, lm.r * 1.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(45,85,55,0.35)'; ctx.beginPath(); ctx.arc(sx - lm.r * 0.3, sy - lm.r * 0.3, lm.r * 0.7, 0, TAU); ctx.fill();
      }
    }
    // posts
    const POST_GLYPH = { 'hydrant': '🧯', 'lamp post': '🏮', 'tree': '🌳', 'bench': '🪑', 'bin': '🗑️', 'gate post': '🚪' };
    for (const p of posts) {
      const [sx, sy] = toS(p.x, p.y); const d = Math.hypot(sx - cx, sy - cy); if (d > R + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(sx, sy + 12, 16, 6, 0, 0, TAU); ctx.fill();
      glyphAt(POST_GLYPH[p.kind] || '📍', sx, sy, 28, clarityAt(d));
      if (p.yours) { ctx.fillStyle = 'rgba(255,220,120,0.5)'; ctx.beginPath(); ctx.arc(sx, sy + 14, 3, 0, TAU); ctx.fill(); }
    }
    // things, creatures, air sources
    for (const sm of smells) {
      if (sm.kind === 'trail' && !sm.found) {
        const c = sm.isCreature ? creatures.find(k => k.trail === sm) : null;
        const px = c ? c.x : sm.source.x, py = c ? c.y : sm.source.y;
        const [sx, sy] = toS(px, py); const d = Math.hypot(sx - cx, sy - cy); if (d > R) continue;
        const cl = clarityAt(d);
        ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * cl;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
        glow.addColorStop(0, `hsla(${sm.hue}, 90%, 65%, 0.5)`); glow.addColorStop(1, `hsla(${sm.hue}, 90%, 65%, 0)`);
        ctx.fillStyle = glow; ctx.fillRect(sx - 60, sy - 60, 120, 120); ctx.restore();
        glyphAt(sm.subject.glyph, sx, sy, 34, cl);
      } else if (sm.kind === 'air' && !sm.found) {
        const [sx, sy] = toS(sm.source.x, sm.source.y); const d = Math.hypot(sx - cx, sy - cy); if (d > R) continue;
        glyphAt(sm.subject.glyph, sx, sy, 40, clarityAt(d));
      }
    }

    // wisps
    ctx.globalCompositeOperation = 'lighter';
    const R2 = R * R;
    for (const p of particles) {
      const sx = p.x - player.x + cx, sy = p.y - player.y + cy, dx = sx - cx, dy = sy - cy, d2 = dx * dx + dy * dy;
      if (d2 > R2 * 1.1) continue;
      const d = Math.sqrt(d2), far = clamp((d - clearR) / (R - clearR), 0, 1);
      const fade = Math.sin((p.life / p.max) * Math.PI), blur = 1 + far * far * 2.6;
      const size = p.size * blur * (1 + 0.35 * sniff), alpha = p.alpha * fade * (1 - far * 0.8) / blur * (0.7 + 0.5 * sniff);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha; ctx.drawImage(sprite(p.hue, p.sat ?? 88), sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // after reading a trail, a brief sense of which way it goes
    for (const sm of smells) {
      if (sm.kind !== 'trail' || sm.hint <= time) continue;
      const a = clamp((sm.hint - time) / 1.5, 0, 1) * 0.7, r0 = 95 + (5 - (sm.hint - time)) * 16;
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = `hsl(${sm.hue}, 90%, 75%)`; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const r = r0 + i * 30, x = cx + Math.cos(sm.hintDir) * r, y = cy + Math.sin(sm.hintDir) * r;
        ctx.beginPath(); ctx.moveTo(x - Math.cos(sm.hintDir + 2.5) * 18, y - Math.sin(sm.hintDir + 2.5) * 18);
        ctx.lineTo(x, y); ctx.lineTo(x - Math.cos(sm.hintDir - 2.5) * 18, y - Math.sin(sm.hintDir - 2.5) * 18); ctx.stroke();
      }
      ctx.restore();
    }

    // lens
    const vig = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(0.5, 'rgba(0,0,0,0.35)'); vig.addColorStop(0.85, 'rgba(0,0,0,0.85)'); vig.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, R, 0, TAU, true); ctx.fill();

    // the drift: a dog's nose knows roughly where the strong smells are, even out of view.
    // a faint glow on the rim leans toward the richest smell beyond the lens, stronger while sniffing.
    {
      let gx = 0, gy = 0;
      for (const sm of smells) {
        if (sm.found) continue;
        let px, py, w;
        if (sm.kind === 'trail') { if (sm.read && !sm.isCreature) continue; px = sm.source.x; py = sm.source.y; w = 1.0; }
        else if (sm.kind === 'mark') { if (sm.read) continue; px = sm.x; py = sm.y; w = 0.5 * (1 - sm.ageN * 0.6); }
        else if (sm.kind === 'pool') { if (sm.depth >= sm.layers.length) continue; px = sm.x; py = sm.y; w = 0.6; }
        else { if (sm.read) continue; px = sm.source.x; py = sm.source.y; w = 0.8; }
        const dx = px - player.x, dy = py - player.y, d = Math.hypot(dx, dy);
        if (d < R) continue;
        const k = w * 220 / d; gx += dx / d * k; gy += dy / d * k;
      }
      const mag = Math.hypot(gx, gy);
      if (mag > 0.01) {
        const ang = Math.atan2(gy, gx), a = clamp(mag, 0, 1) * (0.12 + 0.3 * sniff);
        const g = ctx.createRadialGradient(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, 0, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, R * 0.9);
        g.addColorStop(0, `rgba(255,235,200,${a})`); g.addColorStop(1, 'rgba(255,235,200,0)');
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    }

    ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.08 * sniff})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();

    // reading ring
    if (reading) {
      const k = Math.min(1, reading.t / 1.1), hue = reading.smell.kind === 'pool' ? reading.smell.layers[reading.part].hue : reading.smell.hue;
      ctx.save(); ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.9)`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (sniff > 0.5 && readTarget()) {
      // something here can be read, stay still
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + Math.sin(time * 6) * 0.1})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.stroke();
    }

    for (const pu of popups) {
      if (pu.life < 0) continue;
      const t = pu.life / pu.max, a = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4), y = cy - 40 - t * 70;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 12;
      ctx.fillStyle = `hsl(${pu.hue}, 90%, 75%)`; ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.fillText(pu.text, cx, y);
      if (pu.sub) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '400 14px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.fillText(pu.sub, cx, y + 24); }
      ctx.restore();
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }
  buildWalk();
  requestAnimationFrame(frame);

  window.__nose = { player, get smells() { return smells; }, get creatures() { return creatures; }, get posts() { return posts; }, save, walkStats,
                    get reading() { return reading; }, get walkOver() { return walkOver; }, get wind() { return wind; }, setWalkT(t) { walkT = t; } };
})();
