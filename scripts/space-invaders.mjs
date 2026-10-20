#!/usr/bin/env node
// Space Invaders banner for a GitHub profile README.
//
// Every invader is a language you write (ranked by bytes of code across your repos).
// Every bullet the ship fires is a batch of your commits: a language takes one hit per
// batch of commits made in repos that use it, so the languages you commit to most
// take the longest to shoot down.
//
// Usage:
//   node scripts/space-invaders.mjs [--out space-invaders.svg] [--data raw.json] [--save-data raw.json]
//
// Token: GH_TOKEN or GITHUB_TOKEN, falling back to `gh auth token`. It needs read access to
// your repos (private ones included, if you want them counted).
//
// Tuning (env vars):
//   MAX_LANGS=10                 how many invaders to draw
//   EXCLUDE_LANGS="HTML,Batchfile"
//   EXCLUDE_REPOS="desktop-tutorial"
//   TARGET_SHOTS=36              roughly how many bullets one loop fires

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const list = value => (value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const OUT = arg('out', 'space-invaders.svg');
const MAX_LANGS = Number(process.env.MAX_LANGS) || 10;
const TARGET_SHOTS = Number(process.env.TARGET_SHOTS) || 36;
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

const REPOS_QUERY = `query($id: ID!, $after: String) {
  viewer {
    repositories(first: 50, after: $after, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
        defaultBranchRef { target { ... on Commit { history(author: { id: $id }) { totalCount } } } }
      }
    }
  }
}`;

async function fetchData() {
  const auth = token();
  const { viewer } = await gql(auth, '{ viewer { id login bio } }');
  const repos = [];
  for (let after = null; ;) {
    const page = (await gql(auth, REPOS_QUERY, { id: viewer.id, after })).viewer.repositories;
    repos.push(...page.nodes.map(r => ({
      name: r.name,
      commits: r.defaultBranchRef?.target?.history?.totalCount ?? 0,
      languages: r.languages.edges.map(e => ({ name: e.node.name, color: e.node.color, bytes: e.size })),
    })));
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return { login: viewer.login, bio: viewer.bio, repos };
}

// A repo's commits are split across its languages by bytes of code.
function summarize({ login, bio, repos }) {
  const langs = new Map();
  let commits = 0;
  for (const repo of repos) {
    if (EXCLUDE_REPOS.includes(repo.name.toLowerCase())) continue;
    commits += repo.commits;
    const used = repo.languages.filter(l => !EXCLUDE_LANGS.includes(l.name.toLowerCase()));
    const repoBytes = used.reduce((sum, l) => sum + l.bytes, 0);
    for (const l of used) {
      const entry = langs.get(l.name) ?? { name: l.name, color: l.color || '#cccccc', bytes: 0, commits: 0 };
      entry.bytes += l.bytes;
      entry.commits += (repo.commits * l.bytes) / repoBytes;
      langs.set(l.name, entry);
    }
  }
  const all = [...langs.values()].sort((a, b) => b.bytes - a.bytes);
  if (!all.length) throw new Error('No languages found in your repos.');
  const totalBytes = all.reduce((sum, l) => sum + l.bytes, 0);
  const languages = all.slice(0, MAX_LANGS).map(l => ({ ...l, share: l.bytes / totalBytes }));
  return { login, bio: bio || '', commits, languages };
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
const EXPLOSION = bmp('....#...#.... ..#..#.#..#.. ...#.....#... .##.......##. ...#.....#... ..#..#.#..#.. ....#...#....');
const SHIP = bmp('......#...... .....###..... .....###..... .###########. ############# ############# ############# #############');
const UFO = bmp('.....######..... ...##########... ..############.. .##.##.##.##.##. ################ ..###..##..###.. ...#........#...');
const SPARK = bmp('#..#..# .#.#.#. ..###.. ###.### ..###.. .#.#.#. #..#..#');
const BOMB = bmp('.#. #.. .#. ..# .#. #.. .#.');

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

// ---------- scene ----------

const W = 800;
const COLS = 5;
const COL_W = 150;
const P = 4; // invader pixel size
const FORMATION_TOP = 92;
const ROW_H = 106;
const GREEN = '#39ff6a';
const WHITE = '#eef1f8';
const GREY = '#8b93ad';

// The formation marches in 8px steps, flipping animation frames on each step.
const STEP = 0.5;
const SWAY = [0, 8, 16, 24, 16, 8, 0, -8, -16, -24, -16, -8];
const sway = t => SWAY[Math.floor(t / STEP) % SWAY.length];

const START = 0.8;
const GAP = 0.2;
const BURST = 4;
const BULLET_SPEED = 720;
const SHIP_SPEED = 480;
const BOMB_SPEED = 230;
const EPS = 0.004;

const ALIASES = { 'Jupyter Notebook': 'Jupyter', 'Visual Basic .NET': 'VB.NET', 'Vim Script': 'Vim' };
const MAX_LABEL = Math.floor((COL_W - 12) / 12);

const label = name => {
  const s = (ALIASES[name] ?? name).toUpperCase();
  return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}.` : s;
};
const percent = share => (share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`);

function render({ login, bio, commits, languages }) {
  const rng = seeded(hash(login));
  const rows = Math.ceil(languages.length / COLS);
  const shipTop = FORMATION_TOP + rows * ROW_H + 70;
  const groundY = shipTop + 30;
  const H = groundY + 42;
  const bulletY = shipTop - 12;

  const attributed = languages.reduce((sum, l) => sum + l.commits, 0);
  const perShot = Math.max(1, Math.round(attributed / TARGET_SHOTS));

  const invaders = languages.map((lang, i) => {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, languages.length - row * COLS);
    const kind = ['octopus', 'crab', 'squid'][Math.min(row, 2)];
    const hp = Math.min(24, Math.max(1, Math.round(lang.commits / perShot)));
    return {
      ...lang,
      row,
      kind,
      hp,
      left: hp,
      cx: W / 2 + ((i % COLS) - (inRow - 1) / 2) * COL_W,
      top: FORMATION_TOP + row * ROW_H,
      w: SPRITES[kind][0][0].length * P,
      h: SPRITES[kind][0].length * P,
      color: readable(lang.color),
      hits: [],
      kill: Infinity,
    };
  });

  // Like the arcade, only invaders with nothing alive below them can be hit (or shoot back).
  const covered = (v, pool) => pool.some(o => o.row > v.row && Math.abs(o.cx - v.cx) < (o.w + v.w) / 2);

  // Sweep the exposed invaders back and forth, firing a short burst at each, until all are down.
  const shots = [];
  const shipKeys = [[0, W / 2], [START, W / 2]];
  let t = START;
  let shipX = W / 2;
  for (let alive = [...invaders]; alive.length; alive = alive.filter(v => v.left)) {
    const targets = alive.filter(v => !covered(v, alive)).sort((a, b) => a.cx - b.cx);
    if (Math.abs(targets.at(-1).cx - shipX) < Math.abs(targets[0].cx - shipX)) targets.reverse();
    for (const v of targets) {
      for (let b = Math.min(v.left, BURST); b > 0; b--) {
        const jitter = Math.round((rng() - 0.5) * v.w * 0.5);
        const dist = bulletY - (v.top + v.h - 8);
        const travel = dist / BULLET_SPEED;
        let fire = t + GAP;
        for (let k = 0; k < 3; k++) {
          const aim = v.cx + sway(fire + travel) + jitter;
          fire = Math.max(t + GAP, t + Math.abs(aim - shipX) / SHIP_SPEED + 0.08);
        }
        const hit = fire + travel;
        const aim = v.cx + sway(hit) + jitter;
        shots.push({ v, fire, hit, aim, dist });
        shipKeys.push([fire, aim]);
        shipX = aim;
        t = fire;
        v.left--;
        v.hits.push(hit);
        if (!v.left) v.kill = hit;
      }
    }
  }

  const cleared = Math.max(...invaders.map(v => v.kill));
  const hide = cleared + 0.7;
  const T = Math.ceil(hide + 4.5); // whole seconds keeps the 1s sprite flip in sync across loops
  shipKeys.push([cleared + 1.2, W / 2], [T, W / 2]);

  const shipAt = time => {
    for (let i = 1; i < shipKeys.length; i++) {
      const [t0, x0] = shipKeys[i - 1];
      const [t1, x1] = shipKeys[i];
      if (time <= t1) return t1 === t0 ? x1 : x0 + ((x1 - x0) * (time - t0)) / (t1 - t0);
    }
    return W / 2;
  };

  // A few bombs dropped by exposed invaders, skipped if they would land on the ship.
  const bombs = [];
  for (let drop = 1.4; drop < cleared - 1; drop += 1.6 + rng() * 1.2) {
    const live = invaders.filter(v => v.kill > drop + 0.1);
    const shooters = live.filter(v => !covered(v, live));
    if (!shooters.length) continue;
    const v = shooters[Math.floor(rng() * shooters.length)];
    const x = v.cx + sway(drop);
    const y0 = v.top + v.h;
    const y1 = groundY - 14;
    const land = drop + (y1 - y0) / BOMB_SPEED;
    let safe = true;
    for (let s = drop + (shipTop - 14 - y0) / BOMB_SPEED; s <= land; s += 0.03) {
      if (Math.abs(shipAt(s) - x) < 28) safe = false;
    }
    if (safe) bombs.push({ x, y0, y1, drop, land });
  }

  // Score climbs with each hit, by that language's share of commits, ending on the total.
  const hits = shots
    .map(s => ({ t: s.hit, w: attributed ? s.v.commits / s.v.hp : 1 }))
    .sort((a, b) => a.t - b.t);
  const totalWeight = hits.reduce((sum, h) => sum + h.w, 0);
  const scores = [[0, 0]];
  let cum = 0;
  for (const h of hits) {
    cum += h.w;
    const value = Math.round((commits * cum) / totalWeight);
    if (value === scores.at(-1)[1]) continue;
    scores.push([h.t, value]);
  }
  const digits = Math.max(4, String(commits).length);
  const pad = n => String(n).padStart(digits, '0');

  // ---- CSS keyframes; every timeline loops over T seconds ----
  const css = [];
  let id = 0;
  const pct = time => `${num(Math.min(Math.max(time / T, 0), 1) * 100)}%`;
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

  const out = [];

  // stars
  for (let i = 0; i < 48; i++) {
    const x = Math.round(rng() * W);
    const y = Math.round(58 + rng() * (shipTop - 70));
    const shade = ['#2a3150', '#3b4468', '#5a648f'][Math.floor(rng() * 3)];
    const twinkle = rng() < 0.4 ? ` class="tw" style="animation-delay:-${num(rng() * 3)}s"` : '';
    out.push(`<rect x="${x}" y="${y}" width="2" height="2" fill="${shade}"${twinkle}/>`);
  }

  // mystery ship
  out.push(
    `<g transform="translate(-40,0)" style="${keyframes([
      [0, 'transform:translate(-40px,0px)'],
      [2.4, 'transform:translate(-40px,0px)'],
      [7.4, `transform:translate(${W + 40}px,0px)`],
      [T, `transform:translate(${W + 40}px,0px)`],
    ], 'linear')}"><path d="${bitmap(UFO, 0, 62, 2)}" fill="#ff4b5c"/></g>`,
  );

  // formation
  const cells = [];
  for (const v of invaders) {
    const [a, b] = SPRITES[v.kind];
    const x = Math.round(v.cx - v.w / 2);
    const barX = Math.round(v.cx - 26);
    cells.push(
      `<g fill="${v.color}" style="${stepped('opacity', 1, [[v.kill, 0]])}">` +
        `<path class="fa" d="${bitmap(a, x, v.top, P)}"/>` +
        `<path class="fb" opacity="0" d="${bitmap(b, x, v.top, P)}"/></g>`,
      `<path d="${bitmap(EXPLOSION, barX, v.top + 2, P)}" fill="${v.color}" opacity="0" style="${during(v.kill, v.kill + 0.35)}"/>`,
      `<g style="${stepped('opacity', 1, [[v.kill, 0.35]])}">` +
        `<rect x="${barX}" y="${v.top + 40}" width="52" height="4" fill="#1a1f2e"/>` +
        `<rect x="${barX}" y="${v.top + 40}" width="52" height="4" fill="${v.color}" style="transform-box:fill-box;transform-origin:left;${stepped(
          'transform',
          'scaleX(1)',
          v.hits.map((h, i) => [h, `scaleX(${num((v.hp - i - 1) / v.hp)})`]),
        )}"/>` +
        `<path d="${text(label(v.name), v.cx, v.top + 52, 2, 'center')}" fill="${WHITE}"/>` +
        `<path d="${text(percent(v.share), v.cx, v.top + 72, 2, 'center')}" fill="${GREY}"/></g>`,
    );
  }
  const march = [];
  for (let s = 0; s < hide; s += STEP) march.push([s, `transform:translate(${sway(s)}px,0px);opacity:1`]);
  march.push([hide, 'transform:translate(0px,0px);opacity:0'], [T, 'transform:translate(0px,0px);opacity:0']);
  out.push(`<g style="${keyframes(march, 'step-end')}">${cells.join('')}</g>`);

  // bombs
  for (const bomb of bombs) {
    const from = `translate(${num(bomb.x)}px,${bomb.y0}px)`;
    const to = `translate(${num(bomb.x)}px,${bomb.y1}px)`;
    out.push(
      `<g opacity="0" style="${keyframes([
        [0, `opacity:0;transform:${from}`],
        [bomb.drop - EPS, `opacity:0;transform:${from}`],
        [bomb.drop, `opacity:1;transform:${from}`],
        [bomb.land, `opacity:1;transform:${to}`],
        [bomb.land + EPS, `opacity:0;transform:${to}`],
        [T, `opacity:0;transform:${to}`],
      ], 'linear')}"><path d="${bitmap(BOMB, -3, 0, 2)}" fill="#d9dce6"/></g>`,
      `<path d="${bitmap(SPARK, Math.round(bomb.x - 7), groundY - 14, 2)}" fill="#d9dce6" opacity="0" style="${during(bomb.land, bomb.land + 0.25)}"/>`,
    );
  }

  // bullets: one per batch of commits, in the colour of the language it's aimed at
  for (const s of shots) {
    const from = `translate(${num(s.aim)}px,0px)`;
    const to = `translate(${num(s.aim)}px,${-s.dist}px)`;
    out.push(
      `<g opacity="0" style="${keyframes([
        [0, `opacity:0;transform:${from}`],
        [s.fire - EPS, `opacity:0;transform:${from}`],
        [s.fire, `opacity:1;transform:${from}`],
        [s.hit, `opacity:1;transform:${to}`],
        [s.hit + EPS, `opacity:0;transform:${to}`],
        [T, `opacity:0;transform:${to}`],
      ], 'linear')}"><rect x="-1" y="${bulletY}" width="3" height="12" fill="${s.v.color}"/></g>`,
      `<path d="${bitmap(SPARK, Math.round(s.aim - 7), s.v.top + s.v.h - 14, 2)}" fill="#ffffff" opacity="0" style="${during(s.hit, s.hit + 0.1)}"/>`,
    );
  }

  // ship
  out.push(
    `<g transform="translate(${W / 2},0)" style="${keyframes(
      shipKeys.map(([time, x]) => [time, `transform:translate(${num(x)}px,0px)`]),
      'linear',
    )}"><path d="${bitmap(SHIP, -19, shipTop, 3)}" fill="${GREEN}"/></g>`,
  );

  // HUD
  out.push(
    `<path d="${text('SCORE', 24, 16, 2)}" fill="${WHITE}"/>`,
    `<path d="${text('HI-SCORE', W - 24, 16, 2, 'right')}" fill="${WHITE}"/>`,
    `<path d="${text(pad(commits), W - 24, 36, 2, 'right')}" fill="${WHITE}"/>`,
    `<path d="${text(login, W / 2, 16, 2, 'center')}" fill="${GREEN}"/>`,
    `<path d="${text(bio.length > 40 ? `${bio.slice(0, 39)}.` : bio, W / 2, 36, 2, 'center')}" fill="${GREY}"/>`,
  );
  scores.forEach(([from, value], i) => {
    const last = i === scores.length - 1;
    const to = last ? T : scores[i + 1][0];
    const style = from === 0 ? stepped('opacity', 1, [[to, 0]]) : during(from, to);
    out.push(`<path d="${text(pad(value), 24, 36, 2)}" fill="${WHITE}" opacity="${last ? 1 : 0}" style="${style}"/>`);
  });

  // ground and footer
  const footY = groundY + 14;
  out.push(
    `<rect x="16" y="${groundY}" width="${W - 32}" height="2" fill="${GREEN}"/>`,
    `<path d="${text('3', 24, footY, 2)}" fill="${WHITE}"/>`,
    `<path d="${bitmap(SHIP, 44, footY - 1, 2)}${bitmap(SHIP, 76, footY - 1, 2)}" fill="${GREEN}"/>`,
    `<path d="${text(`1 shot = ${perShot} commit${perShot > 1 ? 's' : ''}`, W / 2, footY, 2, 'center')}" fill="${GREY}"/>`,
    `<path d="${text('CREDIT 00', W - 24, footY, 2, 'right')}" fill="${GREY}"/>`,
  );

  // wave cleared
  const midY = FORMATION_TOP + (rows * ROW_H) / 2 - 44;
  const n = languages.length;
  out.push(
    `<g opacity="0" style="${during(hide, T)}">` +
      `<path d="${text('WAVE CLEARED!', W / 2, midY, 4, 'center')}" fill="${GREEN}"/>` +
      `<path d="${text(`${commits} commits fired - ${n} language${n > 1 ? 's' : ''} down`, W / 2, midY + 46, 2, 'center')}" fill="${WHITE}"/>` +
      `<path class="bl" d="${text('INSERT COMMIT TO CONTINUE', W / 2, midY + 76, 2, 'center')}" fill="#ffd23f"/></g>`,
  );

  const desc = `Space Invaders animation for ${login}: ${commits} commits are fired as bullets at invaders for each language - ` +
    languages.map(l => `${l.name} ${percent(l.share)}`).join(', ') + '.';

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
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="screen"><rect width="${W}" height="${H}" rx="12"/></clipPath>
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
console.log(`${OUT}: ${(svg.length / 1024).toFixed(0)} KB, ${summary.commits} commits, ` +
  summary.languages.map(l => `${l.name} ${percent(l.share)}`).join(', '));
