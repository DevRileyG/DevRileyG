#!/usr/bin/env node
// Space Invaders banner for a GitHub profile README.
//
// Little invaders rain down the screen, one colour per language you write (more of them
// for the languages with more code across your repos). Your contribution heatmap sits
// under the ground as the ammo supply: each shot pulls one square off the heatmap, flies
// it up into the ship and fires it, so every active day of the last year is one bullet.
//
// Usage:
//   node scripts/space-invaders.mjs [--out space-invaders.svg] [--data raw.json] [--save-data raw.json]
//
// Token: GH_TOKEN or GITHUB_TOKEN, falling back to `gh auth token`. It needs read access to
// your repos (private ones included, if you want their languages counted).
//
// Tuning (env vars):
//   MAX_LANGS=10                 how many languages to send in (10 at most)
//   EXCLUDE_LANGS="HTML,Batchfile"
//   EXCLUDE_REPOS="desktop-tutorial"

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const list = value => (value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const OUT = arg('out', 'space-invaders.svg');
const MAX_LANGS = Math.min(10, Number(process.env.MAX_LANGS) || 10);
const EXCLUDE_LANGS = list(process.env.EXCLUDE_LANGS);
const EXCLUDE_REPOS = list(process.env.EXCLUDE_REPOS);

// ---------- GitHub data ----------

function token() {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('No token: set GH_TOKEN, or log in with `gh auth login`.');
  }
}

async function gql(auth, query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${auth}`, 'Content-Type': 'application/json', 'User-Agent': 'space-invaders-profile' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

const VIEWER_QUERY = `{
  viewer {
    login
    bio
    contributionsCollection {
      contributionCalendar { weeks { contributionDays { date weekday contributionCount contributionLevel } } }
    }
  }
}`;

const REPOS_QUERY = `query($after: String) {
  viewer {
    repositories(first: 50, after: $after, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes { name languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
  }
}`;

async function fetchData() {
  const auth = token();
  const { viewer } = await gql(auth, VIEWER_QUERY);
  const repos = [];
  for (let after = null; ;) {
    const page = (await gql(auth, REPOS_QUERY, { after })).viewer.repositories;
    repos.push(...page.nodes.map(r => ({
      name: r.name,
      languages: r.languages.edges.map(e => ({ name: e.node.name, color: e.node.color, bytes: e.size })),
    })));
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  const weeks = viewer.contributionsCollection.contributionCalendar.weeks.map(w => w.contributionDays.map(d => ({
    date: d.date,
    weekday: d.weekday,
    count: d.contributionCount,
    level: ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'].indexOf(d.contributionLevel),
  })));
  return { login: viewer.login, bio: viewer.bio, weeks, repos };
}

function summarize({ login, bio, weeks, repos }) {
  const langs = new Map();
  for (const repo of repos) {
    if (EXCLUDE_REPOS.includes(repo.name.toLowerCase())) continue;
    for (const l of repo.languages) {
      if (EXCLUDE_LANGS.includes(l.name.toLowerCase())) continue;
      const entry = langs.get(l.name) ?? { name: l.name, color: l.color || '#cccccc', bytes: 0 };
      entry.bytes += l.bytes;
      langs.set(l.name, entry);
    }
  }
  const all = [...langs.values()].sort((a, b) => b.bytes - a.bytes);
  if (!all.length) throw new Error('No languages found in your repos.');
  const totalBytes = all.reduce((sum, l) => sum + l.bytes, 0);
  const languages = all.slice(0, MAX_LANGS).map(l => ({ ...l, share: l.bytes / totalBytes }));
  return { login, bio: bio || '', weeks, languages };
}

// ---------- pixel art ----------

const bmp = s => s.trim().split(/\s+/);

const FONT = {
  A: bmp('.###. #...# #...# ##### #...# #...# #...#'),
  B: bmp('####. #...# #...# ####. #...# #...# ####.'),
  C: bmp('.###. #...# #.... #.... #.... #...# .###.'),
  D: bmp('####. #...# #...# #...# #...# #...# ####.'),
  E: bmp('##### #.... #.... ####. #.... #.... #####'),
  F: bmp('##### #.... #.... ####. #.... #.... #....'),
  G: bmp('.###. #...# #.... #.### #...# #...# .####'),
  H: bmp('#...# #...# #...# ##### #...# #...# #...#'),
  I: bmp('.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.'),
  J: bmp('..### ...#. ...#. ...#. ...#. #..#. .##..'),
  K: bmp('#...# #..#. #.#.. ##... #.#.. #..#. #...#'),
  L: bmp('#.... #.... #.... #.... #.... #.... #####'),
  M: bmp('#...# ##.## #.#.# #.#.# #...# #...# #...#'),
  N: bmp('#...# #...# ##..# #.#.# #..## #...# #...#'),
  O: bmp('.###. #...# #...# #...# #...# #...# .###.'),
  P: bmp('####. #...# #...# ####. #.... #.... #....'),
  Q: bmp('.###. #...# #...# #...# #.#.# #..#. .##.#'),
  R: bmp('####. #...# #...# ####. #.#.. #..#. #...#'),
  S: bmp('.#### #.... #.... .###. ....# ....# ####.'),
  T: bmp('##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..'),
  U: bmp('#...# #...# #...# #...# #...# #...# .###.'),
  V: bmp('#...# #...# #...# #...# #...# .#.#. ..#..'),
  W: bmp('#...# #...# #...# #.#.# #.#.# #.#.# .#.#.'),
  X: bmp('#...# #...# .#.#. ..#.. .#.#. #...# #...#'),
  Y: bmp('#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..'),
  Z: bmp('##### ....# ...#. ..#.. .#... #.... #####'),
  0: bmp('.###. #...# #..## #.#.# ##..# #...# .###.'),
  1: bmp('..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.'),
  2: bmp('.###. #...# ....# ...#. ..#.. .#... #####'),
  3: bmp('##### ...#. ..#.. ...#. ....# #...# .###.'),
  4: bmp('...#. ..##. .#.#. #..#. ##### ...#. ...#.'),
  5: bmp('##### #.... ####. ....# ....# #...# .###.'),
  6: bmp('..##. .#... #.... ####. #...# #...# .###.'),
  7: bmp('##### ....# ...#. ..#.. .#... .#... .#...'),
  8: bmp('.###. #...# #...# .###. #...# #...# .###.'),
  9: bmp('.###. #...# #...# .#### ....# ...#. .##..'),
  '%': bmp('##... ##..# ...#. ..#.. .#... #..## ...##'),
  '.': bmp('..... ..... ..... ..... ..... .##.. .##..'),
  ',': bmp('..... ..... ..... ..... .##.. ..#.. .#...'),
  '+': bmp('..... ..#.. ..#.. ##### ..#.. ..#.. .....'),
  '#': bmp('.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.'),
  '-': bmp('..... ..... ..... ##### ..... ..... .....'),
  '_': bmp('..... ..... ..... ..... ..... ..... #####'),
  ':': bmp('..... .##.. .##.. ..... .##.. .##.. .....'),
  '!': bmp('..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..'),
  '?': bmp('.###. #...# ....# ...#. ..#.. ..... ..#..'),
  '=': bmp('..... ..... ##### ..... ##### ..... .....'),
  '<': bmp('...#. ..#.. .#... #.... .#... ..#.. ...#.'),
  '>': bmp('.#... ..#.. ...#. ....# ...#. ..#.. .#...'),
  '/': bmp('....# ....# ...#. ..#.. .#... #.... #....'),
  "'": bmp('..#.. ..#.. .#... ..... ..... ..... .....'),
  '(': bmp('...#. ..#.. .#... .#... .#... ..#.. ...#.'),
  ')': bmp('.#... ..#.. ...#. ...#. ...#. ..#.. .#...'),
  '&': bmp('.##.. #..#. #.#.. .#... #.#.# #..#. .##.#'),
  '@': bmp('.###. #...# #.### #.#.# #.### #.... .####'),
};

const SPRITES = {
  octopus: [
    bmp('....####.... .##########. ############ ###..##..### ############ ...##..##... ..##.##.##.. ##........##'),
    bmp('....####.... .##########. ############ ###..##..### ############ ..###..###.. .##..##..##. ..##....##..'),
  ],
  crab: [
    bmp('..#.....#.. ...#...#... ..#######.. .##.###.##. ########### #.#######.# #.#.....#.# ...##.##...'),
    bmp('..#.....#.. #..#...#..# #.#######.# ###.###.### ########### .#########. ..#.....#.. .#.......#.'),
  ],
  squid: [
    bmp('...##... ..####.. .######. ##.##.## ######## ..#..#.. .#.##.#. #.#..#.#'),
    bmp('...##... ..####.. .######. ##.##.## ######## .#.##.#. #......# .#....#.'),
  ],
};
const KINDS = ['octopus', 'crab', 'squid'];
const EXPLOSION = bmp('....#...#.... ..#..#.#..#.. ...#.....#... .##.......##. ...#.....#... ..#..#.#..#.. ....#...#....');
const SHIP = bmp('......#...... .....###..... .....###..... .###########. ############# ############# ############# #############');
const UFO = bmp('.....######..... ...##########... ..############.. .##.##.##.##.##. ################ ..###..##..###.. ...#........#...');

// Heatmap greens, a touch brighter than GitHub's dark theme so the squares still read as bullets.
const HEAT = ['#161b22', '#1b5e33', '#1f8a42', '#2fbf52', '#4ae168'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const num = n => +n.toFixed(2);

// One <path> for a bitmap, merging each row's runs of lit pixels.
function bitmap(rows, x0, y0, p) {
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let w = 1;
      while (row[x + w] === '#') w++;
      d += `M${num(x0 + x * p)} ${num(y0 + y * p)}h${num(w * p)}v${p}h${-num(w * p)}z`;
      x += w - 1;
    }
  });
  return d;
}

function text(str, x, y, s, align = 'left') {
  const chars = [...str.toUpperCase()];
  const width = chars.length * 6 * s - s;
  const x0 = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  return chars.map((c, i) => (FONT[c] ? bitmap(FONT[c], x0 + i * 6 * s, y, s) : '')).join('');
}

// Lighten a language colour until it reads on the black screen (Lua's navy, PowerShell's blue).
function readable(hex) {
  let rgb = hex.replace('#', '').match(/../g).map(h => parseInt(h, 16));
  const luminance = () => rgb
    .map(c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  while (luminance() < 0.2) rgb = rgb.map(c => c + (255 - c) * 0.1);
  return `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One invader per bullet, split across languages by share of code (at least one each).
function allocate(languages, n) {
  const used = languages.slice(0, Math.min(languages.length, n));
  const totalShare = used.reduce((sum, l) => sum + l.share, 0);
  const quotas = used.map(l => (l.share / totalShare) * (n - used.length));
  const counts = quotas.map(q => 1 + Math.floor(q));
  const byRemainder = quotas.map((q, i) => [q - Math.floor(q), i]).sort((a, b) => b[0] - a[0]);
  const leftover = n - counts.reduce((a, b) => a + b, 0);
  for (let k = 0; k < leftover; k++) counts[byRemainder[k][1]]++;
  return used.map((l, i) => ({ ...l, count: counts[i] }));
}

// ---------- scene ----------

const W = 800;
const FIELD = { left: 16, right: 584, top: 56, bottom: 380 };
const GROUND_Y = FIELD.bottom;
const SHIP_TOP = GROUND_Y - 30;
const NOSE_Y = SHIP_TOP - 2;
const SPAWN_Y = FIELD.top - 16; // invader centre while still hidden above the field
const HIT_MIN = FIELD.top + 50;
const HIT_MAX = GROUND_Y - 100;
const X_MIN = FIELD.left + 24;
const X_MAX = FIELD.right - 24;
const FIELD_MID = (FIELD.left + FIELD.right) / 2;
const SIDEBAR_X = 600;
const PITCH = 12; // heatmap cell + gap
const HEAT_Y = GROUND_Y + 22;
const P = 2; // invader pixel size
const GREEN = '#39ff6a';
const WHITE = '#eef1f8';
const GREY = '#8b93ad';

const START = 3.5;
const BATTLE = 20; // seconds of shooting to spread the shots across
const LIFT = 0.7;
const BULLET_SPEED = 360;
const SHIP_SPEED = 300;
const BOOM = 0.45;
const EPS = 0.004;

const ALIASES = { 'Jupyter Notebook': 'Jupyter', 'Visual Basic .NET': 'VB.NET', 'Vim Script': 'Vim' };
const MAX_LABEL = 10;

const label = name => {
  const s = (ALIASES[name] ?? name).toUpperCase();
  return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}.` : s;
};
const percent = share => (share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`);

function render({ login, bio, weeks, languages }) {
  const rng = seeded(hash(login));

  // ---- the ammo: every active day on the heatmap, oldest first ----
  const heatX = Math.round((W - (weeks.length * PITCH - 2)) / 2);
  const cells = weeks.flatMap((week, wi) => week.map(day => ({
    ...day,
    cx: heatX + wi * PITCH + 5,
    cy: HEAT_Y + day.weekday * PITCH + 5,
  })));
  const ammo = cells.filter(c => c.count > 0);
  const n = ammo.length;
  if (!n) throw new Error('No contributions in the last year, so there is no ammo to fire.');
  const total = ammo.reduce((sum, c) => sum + c.count, 0);

  // ---- the invaders: one per square, languages shuffled together ----
  const squad = allocate(languages, n).map((l, rank) => {
    const kind = KINDS[rank % KINDS.length];
    return { ...l, rank, kind, w: SPRITES[kind][0][0].length * P, color: readable(l.color), kills: [] };
  });
  const order = squad.flatMap(l => Array(l.count).fill(l));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Between shots the ship holds still, glides to the next target, then settles before firing.
  const gap = clamp(BATTLE / n, 0.25, 0.8);
  const maxStep = Math.min(140, SHIP_SPEED * gap * 0.55);
  const yAt = (e, t) => SPAWN_Y + e.speed * (t - e.spawn);
  const shotY = (e, t) => NOSE_Y - BULLET_SPEED * (t - e.fire);
  const crosses = (from, to, gapY, dy) => {
    for (let t = from; t <= to; t += 0.02) if (Math.abs(dy(t)) < gapY) return true;
    return false;
  };
  // Keep invaders from overlapping each other, and bullets from passing through the wrong one.
  const clashes = (c, others) => others.some(o => {
    const dx = Math.abs(c.x - o.x);
    return (
      (dx < (c.w + o.w) / 2 + 4 && crosses(Math.max(c.spawn, o.spawn), Math.min(c.hit, o.hit), 22, t => yAt(c, t) - yAt(o, t))) ||
      (dx < (c.w + 26) / 2 && crosses(Math.max(c.spawn, o.hit), Math.min(c.hit, o.hit + BOOM), 18, t => yAt(c, t) - o.yHit)) ||
      (dx < o.w / 2 + 6 && crosses(Math.max(c.fire, o.spawn), Math.min(c.hit, o.hit), 14, t => shotY(c, t) - yAt(o, t))) ||
      (dx < c.w / 2 + 6 && crosses(Math.max(o.fire, c.spawn), Math.min(o.hit, c.hit), 14, t => shotY(o, t) - yAt(c, t)))
    );
  });

  // The ship wanders left and right under the waterfall, firing one square every `gap` seconds.
  const enemies = [];
  let x = FIELD_MID;
  let dir = rng() < 0.5 ? -1 : 1;
  order.forEach((lang, k) => {
    const fire = START + k * gap;
    let pick;
    for (let attempt = 0; attempt < 60; attempt++) {
      const step = (20 + rng() * (maxStep - 20)) * (rng() < 0.8 ? dir : -dir);
      const yHit = HIT_MIN + rng() * (HIT_MAX - HIT_MIN);
      const hit = fire + (NOSE_Y - (yHit + 11)) / BULLET_SPEED;
      let speed = 16 + rng() * 14;
      let spawn = hit - (yHit - SPAWN_Y) / speed;
      if (spawn < 0.3) {
        spawn = 0.3;
        speed = (yHit - SPAWN_Y) / (hit - spawn);
      }
      pick = { lang, w: lang.w, x: Math.round(clamp(x + step, X_MIN, X_MAX)), yHit, fire, hit, spawn, speed, ammo: ammo[k] };
      if (!clashes(pick, enemies)) break;
    }
    if (pick.x <= X_MIN || pick.x >= X_MAX) dir = -dir;
    else if (pick.x !== x) dir = Math.sign(pick.x - x);
    x = pick.x;
    lang.kills.push(pick.hit);
    enemies.push(pick);
  });

  const cleared = Math.max(...enemies.map(e => e.hit));
  const hide = cleared + 0.8;
  const T = Math.ceil(hide + 5.5); // whole seconds keeps the 1s sprite flip in sync across loops
  const refill = k => hide + 1.2 + (k * 3) / n;
  const shipKeys = [
    [0, FIELD_MID],
    [START - 1, FIELD_MID],
    ...enemies.flatMap(e => [[e.fire - gap * 0.2, e.x], [e.fire + gap * 0.25, e.x]]),
    [cleared + 1.5, FIELD_MID],
    [T, FIELD_MID],
  ];

  // Score climbs by each fired day's contribution count.
  const scores = [[0, 0]];
  let running = 0;
  for (const e of [...enemies].sort((a, b) => a.hit - b.hit)) {
    running += e.ammo.count;
    scores.push([e.hit, running]);
  }
  const digits = Math.max(4, String(total).length);
  const pad = v => String(v).padStart(digits, '0');

  // ---- CSS keyframes; every timeline loops over T seconds ----
  const css = [];
  let id = 0;
  const pct = time => `${num(clamp(time / T, 0, 1) * 100)}%`;
  const keyframes = (frames, timing) => {
    const name = `k${(id++).toString(36)}`;
    css.push(`@keyframes ${name}{${frames.map(([time, decl]) => `${pct(time)}{${decl}}`).join('')}}`);
    return `animation:${name} ${T}s ${timing} infinite`;
  };
  // Holds each value from its time until the next change.
  const stepped = (prop, initial, changes) => keyframes(
    [[0, initial], ...changes, [T, changes.length ? changes.at(-1)[1] : initial]].map(([time, v]) => [time, `${prop}:${v}`]),
    'step-end',
  );
  const during = (from, to) => stepped('opacity', 0, [[from, 1], [to, 0]]);
  const at = (px, py, scale = 1) => `transform:translate(${num(px)}px,${num(py)}px) scale(${scale})`;

  const defs = [];
  for (const kind of KINDS) {
    const [a, b] = SPRITES[kind];
    const w = a[0].length * P;
    const h = a.length * P;
    defs.push(`<g id="${kind}"><path class="fa" d="${bitmap(a, -w / 2, -h / 2, P)}"/><path class="fb" opacity="0" d="${bitmap(b, -w / 2, -h / 2, P)}"/></g>`);
  }
  defs.push(`<path id="boom" d="${bitmap(EXPLOSION, -13, -7, P)}"/>`);
  for (let d = 0; d < 10; d++) defs.push(`<path id="n${d}" d="${bitmap(FONT[d], 0, 0, 2)}"/>`);

  const out = [];
  const field = [];

  // stars
  for (let i = 0; i < 40; i++) {
    const sx = Math.round(FIELD.left + rng() * (FIELD.right - FIELD.left));
    const sy = Math.round(FIELD.top + 4 + rng() * (SHIP_TOP - FIELD.top - 20));
    const shade = ['#2a3150', '#3b4468', '#5a648f'][Math.floor(rng() * 3)];
    const twinkle = rng() < 0.4 ? ` class="tw" style="animation-delay:-${num(rng() * 3)}s"` : '';
    field.push(`<rect x="${sx}" y="${sy}" width="2" height="2" fill="${shade}"${twinkle}/>`);
  }

  // mystery ship
  field.push(
    `<g transform="translate(-40,0)" style="${keyframes([
      [0, 'transform:translate(-40px,0px)'],
      [4, 'transform:translate(-40px,0px)'],
      [12, `transform:translate(${FIELD.right + 40}px,0px)`],
      [T, `transform:translate(${FIELD.right + 40}px,0px)`],
    ], 'linear')}"><path d="${bitmap(UFO, 0, FIELD.top + 4, 2)}" fill="#ff4b5c"/></g>`,
  );

  // the waterfall (positioned as if paused mid-wave, for viewers with animation off)
  const still = START + 3;
  for (const e of enemies) {
    const visible = e.spawn <= still && still < e.hit;
    const top = at(e.x, SPAWN_Y);
    const low = at(e.x, e.yHit);
    field.push(
      `<use href="#${e.lang.kind}" fill="${e.lang.color}" transform="translate(${e.x},${num(visible ? yAt(e, still) : SPAWN_Y)})" opacity="${visible ? 1 : 0}" style="${keyframes([
        [0, `opacity:0;${top}`],
        [e.spawn - EPS, `opacity:0;${top}`],
        [e.spawn, `opacity:1;${top}`],
        [e.hit, `opacity:1;${low}`],
        [e.hit + EPS, `opacity:0;${low}`],
        [T, `opacity:0;${low}`],
      ], 'linear')}"/>`,
      `<use href="#boom" fill="${e.lang.color}" x="${e.x}" y="${num(e.yHit)}" opacity="0" style="${during(e.hit, e.hit + BOOM)}"/>`,
    );
  }

  // wave cleared
  const midY = (FIELD.top + GROUND_Y) / 2 - 56;
  field.push(
    `<g opacity="0" style="${during(hide, T)}">` +
      `<path d="${text('WAVE CLEARED!', FIELD_MID, midY, 4, 'center')}" fill="${GREEN}"/>` +
      `<path d="${text(`${total} contributions fired`, FIELD_MID, midY + 46, 2, 'center')}" fill="${WHITE}"/>` +
      `<path d="${text(`${n} squares - ${n} invaders down`, FIELD_MID, midY + 68, 2, 'center')}" fill="${GREY}"/>` +
      `<path class="bl" d="${text('INSERT COMMIT TO CONTINUE', FIELD_MID, midY + 98, 2, 'center')}" fill="#ffd23f"/></g>`,
  );

  out.push(`<g clip-path="url(#field)">${field.join('\n')}</g>`);

  // the heatmap: empty slots underneath, a loose square on top of each active day
  const months = [];
  weeks.forEach((week, wi) => {
    const month = Number(week[0].date.slice(5, 7)) - 1;
    if (wi > 0 && month !== Number(weeks[wi - 1][0].date.slice(5, 7)) - 1 && wi < weeks.length - 2) {
      months.push(text(MONTHS[month], heatX + wi * PITCH, GROUND_Y + 10, 1));
    }
  });
  out.push(
    `<path d="${months.join('')}" fill="${GREY}"/>`,
    `<path d="${cells.map(c => `M${c.cx - 5} ${c.cy - 5}h10v10h-10z`).join('')}" fill="${HEAT[0]}"/>`,
  );
  enemies.forEach((e, k) => {
    const cell = e.ammo;
    const home = at(cell.cx, cell.cy);
    const muzzle = at(e.x, NOSE_Y, 0.7);
    const end = at(e.x, e.yHit + 11, 0.7);
    out.push(
      `<g transform="translate(${cell.cx},${cell.cy})" style="${keyframes([
        [0, `opacity:1;${home}`],
        [e.fire - LIFT, `opacity:1;${home}`],
        [e.fire, `opacity:1;${muzzle}`],
        [e.hit, `opacity:1;${end}`],
        [e.hit + EPS, `opacity:0;${end}`],
        [refill(k), `opacity:0;${at(cell.cx, cell.cy, 0.2)}`],
        [refill(k) + 0.25, `opacity:1;${home}`],
        [T, `opacity:1;${home}`],
      ], 'linear')}"><rect x="-5" y="-5" width="10" height="10" fill="${HEAT[Math.max(1, cell.level)]}"/>` +
        `<rect x="-5" y="-5" width="10" height="10" fill="#7dff9a" opacity="0" style="${during(e.fire - LIFT, e.hit + EPS)}"/></g>`,
    );
  });

  // ship (drawn over the squares, so each one disappears into it before it's fired)
  out.push(
    `<g transform="translate(${FIELD_MID},0)" style="${keyframes(
      shipKeys.map(([time, sx]) => [time, `transform:translate(${num(sx)}px,0px)`]),
      'linear',
    )}"><path d="${bitmap(SHIP, -19, SHIP_TOP, 3)}" fill="${GREEN}"/></g>`,
    `<rect x="${FIELD.left}" y="${GROUND_Y}" width="${W - 2 * FIELD.left}" height="2" fill="${GREEN}"/>`,
  );

  // sidebar: one row per language, its bar emptying as its invaders fall
  out.push(`<rect x="${SIDEBAR_X - 8}" y="${FIELD.top + 4}" width="1" height="${SHIP_TOP - FIELD.top}" fill="#1f2740"/>`);
  squad.forEach((l, i) => {
    const y = FIELD.top + 10 + i * 29;
    const done = l.kills.at(-1);
    out.push(
      `<g style="${stepped('opacity', 1, [[done, 0.35]])}">` +
        `<use href="#${l.kind}" fill="${l.color}" x="${SIDEBAR_X + 12}" y="${y + 8}"/>` +
        `<path d="${text(label(l.name), SIDEBAR_X + 32, y + 1, 2)}" fill="${WHITE}"/>` +
        `<rect x="${SIDEBAR_X + 32}" y="${y + 19}" width="110" height="3" fill="#1a1f2e"/>` +
        `<rect x="${SIDEBAR_X + 32}" y="${y + 19}" width="110" height="3" fill="${l.color}" style="transform-box:fill-box;transform-origin:left;${stepped(
          'transform',
          'scaleX(1)',
          l.kills.map((t, k) => [t, `scaleX(${num((l.count - k - 1) / l.count)})`]),
        )}"/>` +
        `<path d="${text(percent(l.share), W - 16, y + 17, 1, 'right')}" fill="${GREY}"/></g>`,
    );
  });

  // HUD
  out.push(
    `<path d="${text('SCORE', 24, 16, 2)}" fill="${WHITE}"/>`,
    `<path d="${text('HI-SCORE', W - 24, 16, 2, 'right')}" fill="${WHITE}"/>`,
    `<path d="${text(pad(total), W - 24, 36, 2, 'right')}" fill="${WHITE}"/>`,
    `<path d="${text(login, W / 2, 16, 2, 'center')}" fill="${GREEN}"/>`,
    `<path d="${text(bio.length > 40 ? `${bio.slice(0, 39)}.` : bio, W / 2, 36, 2, 'center')}" fill="${GREY}"/>`,
  );
  scores.forEach(([from, value], i) => {
    const last = i === scores.length - 1;
    const to = last ? T : scores[i + 1][0];
    const style = from === 0 ? stepped('opacity', 1, [[to, 0]]) : during(from, to);
    const glyphs = [...pad(value)].map((d, j) => `<use href="#n${d}" x="${24 + j * 12}" y="36"/>`).join('');
    out.push(`<g fill="${WHITE}" opacity="${last ? 1 : 0}" style="${style}">${glyphs}</g>`);
  });

  // footer
  const footY = HEAT_Y + 7 * PITCH + 10;
  const legendX = W - 24 - 23;
  out.push(
    `<path d="${text('3', 24, footY, 2)}" fill="${WHITE}"/>`,
    `<path d="${bitmap(SHIP, 44, footY - 1, 2)}${bitmap(SHIP, 76, footY - 1, 2)}" fill="${GREEN}"/>`,
    `<path d="${text('1 square = 1 shot', W / 2, footY, 2, 'center')}" fill="${GREY}"/>`,
    `<path d="${text('LESS', legendX - 5 * PITCH - 30, footY + 4, 1)}${text('MORE', legendX, footY + 4, 1)}" fill="${GREY}"/>`,
    ...HEAT.map((c, i) => `<rect x="${legendX - 5 * PITCH - 4 + i * PITCH}" y="${footY + 2}" width="10" height="10" fill="${c}"/>`),
  );

  const H = footY + 28;
  const desc = `Space Invaders animation for ${login}: each of the ${n} active days on the contribution heatmap ` +
    `is pulled off as a bullet and fired at invaders falling for each language - ` +
    squad.map(l => `${l.name} ${percent(l.share)}`).join(', ') + '.';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${escape(`${login} - Space Invaders`)}</title>
<desc id="d">${escape(desc)}</desc>
<style>
.fa{animation:fa 1s step-end infinite}.fb{animation:fb 1s step-end infinite}
@keyframes fa{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
@keyframes fb{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
.tw{animation:tw 3s ease-in-out infinite}@keyframes tw{0%,100%{opacity:1}50%{opacity:.15}}
.bl{animation:bl 1s step-end infinite}@keyframes bl{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
${css.join('\n')}
</style>
<defs>
${defs.join('\n')}
<clipPath id="screen"><rect width="${W}" height="${H}" rx="12"/></clipPath>
<clipPath id="field"><rect x="${FIELD.left}" y="${FIELD.top}" width="${FIELD.right - FIELD.left}" height="${GROUND_Y - FIELD.top}"/></clipPath>
<radialGradient id="glow" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#0e1426"/><stop offset="1" stop-color="#03040a"/></radialGradient>
<pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".28"/></pattern>
</defs>
<g clip-path="url(#screen)">
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<g shape-rendering="crispEdges">
${out.join('\n')}
</g>
<rect width="${W}" height="${H}" fill="url(#scan)"/>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="#1f2740"/>
</svg>
`;
}

// ---------- main ----------

const raw = arg('data') ? JSON.parse(readFileSync(arg('data'), 'utf8')) : await fetchData();
if (arg('save-data')) writeFileSync(arg('save-data'), JSON.stringify(raw, null, 2));
const summary = summarize(raw);
const svg = render(summary);
writeFileSync(OUT, svg);
const days = summary.weeks.flat().filter(d => d.count > 0).length;
console.log(`${OUT}: ${(svg.length / 1024).toFixed(0)} KB, ${days} active days, ` +
  summary.languages.map(l => `${l.name} ${percent(l.share)}`).join(', '));
