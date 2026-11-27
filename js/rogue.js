/* Mode Aventure (roguelike) : un deck de départ, une suite de combats contre l'IA, des récompenses entre les combats. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = () => window.AltPlay;
  const KEY = 'alt-bi-rogue', FIGHTS = 10, LIVES = 3, MINI = [3, 6]; // mini-boss aux combats 4 et 7, boss au 10e
  const BONUS = [{}, {}, { cards: 1 }, { mana: 1, cards: 1 }, { mana: 1 }, { cards: 2 }, { mana: 2 }, { mana: 1, cards: 2 }, { mana: 2, cards: 1 }, { mana: 2, cards: 2 }];
  const bonusTxt = b => [b.mana ? '+' + b.mana + ' ' + L(b.mana > 1 ? 'Orbes de mana' : 'Orbe de mana', b.mana > 1 ? 'Mana Orbs' : 'Mana Orb') : '', b.cards ? '+' + b.cards + ' ' + L(b.cards > 1 ? 'cartes en main' : 'carte en main', b.cards > 1 ? 'cards in hand' : 'card in hand') : ''].filter(Boolean).join(', ');
  const FAC = ['AX', 'BR', 'LY', 'MU', 'OR', 'YZ'];
  const FN = { AX: 'Axiom', BR: 'Bravos', LY: 'Lyra', MU: 'Muna', OR: 'Ordis', YZ: 'Yzmir' };
  const FC = { AX: '#a0622d', BR: '#c4302b', LY: '#c84f86', MU: '#4a8a3a', OR: '#2f6fb5', YZ: '#6b55c9' };
  const EN = () => P() && P().LANG === 'en';
  const L = (fr, en) => EN() ? en : fr;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = r => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { } };
  // ---- Pièces et arbre de talents (méta-progression, conservée entre les aventures) ----
  // Les talents ne touchent jamais la partie elle-même : seulement la construction du deck entre les combats.
  // Plus on dépense de pièces, plus la menace monte (adversaires plus forts). Sans talents : aventure « pure ».
  const MKEY = 'alt-bi-rogue-meta';
  const loadMeta = () => { let m = null; try { m = JSON.parse(localStorage.getItem(MKEY) || 'null'); } catch (e) { } m = m && typeof m === 'object' ? m : {}; m.earned = m.earned | 0; m.alloc = m.alloc && typeof m.alloc === 'object' ? m.alloc : {}; if (m.useTal === undefined) m.useTal = true; return m; };
  const saveMeta = m => { try { localStorage.setItem(MKEY, JSON.stringify(m)); } catch (e) { } };
  const BR = { rec: ['🎴', 'Recrutement', 'Recruitment'], for: ['🎲', 'Fortune', 'Fortune'], ate: ['🔨', 'Atelier', 'Workshop'], bic: ['🧭', 'Exploration', 'Exploration'] };
  const TAL = [
    { id: 'pre', b: 'rec', costs: [1, 3, 5], fr: 'Draft de départ', en: 'Opening draft', d: l => L(l + ' draft' + (l > 1 ? 's' : '') + ' avant le 1er combat', l + ' draft' + (l > 1 ? 's' : '') + ' before the first fight') },
    { id: 'rare', b: 'rec', req: 'pre', costs: [3, 6, 10], fr: 'Flair', en: 'Keen eye', d: l => l < 3 ? L('+' + (10 * l) + ' % de chance de rare au draft', '+' + (10 * l) + '% rare chance in drafts') : L('+20 % de rares, et 5 % de chance d’une unique par carte', '+20% rares, and a 5% chance of a unique per card') },
    { id: 'mini2', b: 'rec', req: 'rare', costs: [6], fr: 'Butin de mini-boss', en: 'Mini-boss loot', d: () => L('Après un mini-boss vaincu, garde 2 cartes du draft', 'After beating a mini-boss, keep 2 cards from the draft') },
    { id: 'wide', b: 'rec', req: 'rare', costs: [10, 20], fr: 'Large choix', en: 'Wide choice', d: l => L((3 + l) + ' cartes proposées au draft', (3 + l) + ' cards offered in drafts') },
    { id: 'rr', b: 'for', costs: [2, 4, 8], fr: 'Relances', en: 'Rerolls', d: l => L([0, 2, 5, 10][l] + ' jetons de relance par aventure (draft, amélioration, unique)', [0, 2, 5, 10][l] + ' reroll tokens per adventure (draft, upgrade, unique)') },
    { id: 'ban', b: 'for', req: 'rr', costs: [2, 4, 6], fr: 'Bannissement', en: 'Ban', d: l => L(l + ' jeton' + (l > 1 ? 's' : '') + ' de bannissement : retire une carte proposée (et son nom du reste de l’aventure)', l + ' ban token' + (l > 1 ? 's' : '') + ': remove an offered card (and its name for the rest of the adventure)') },
    { id: 'mtok', b: 'for', req: 'rr', costs: [4, 8], fr: 'Prime', en: 'Bounty', d: l => L('+' + l + ' jeton' + (l > 1 ? 's' : '') + ' de relance après chaque mini-boss vaincu', '+' + l + ' reroll token' + (l > 1 ? 's' : '') + ' after each mini-boss beaten') },
    { id: 'srare', b: 'ate', costs: [2, 5], fr: 'Bonne base', en: 'Solid base', d: l => L('Commence avec ' + l + ' commune' + (l > 1 ? 's' : '') + ' passée' + (l > 1 ? 's' : '') + ' en rare', 'Start with ' + l + ' common' + (l > 1 ? 's' : '') + ' upgraded to rare') },
    { id: 'pickup', b: 'ate', req: 'srare', costs: [6], fr: 'Libre choix', en: 'Free choice', d: () => L('Choisis toi-même la commune à améliorer (parmi tout ton deck)', 'Pick the common to upgrade yourself (from your whole deck)') },
    { id: 'mini2up', b: 'ate', req: 'srare', costs: [6], fr: 'Forge', en: 'Forge', d: () => L('Après un mini-boss vaincu, améliore 2 cartes au lieu d’une', 'After beating a mini-boss, upgrade 2 cards instead of one') },
    { id: 'smut', b: 'ate', req: 'pickup', costs: [8], fr: 'Mutation de départ', en: 'Opening mutation', d: () => L('Une mutation offerte avant le 1er combat', 'A free mutation before the first fight') },
    { id: 'dmut', b: 'ate', req: 'pickup', costs: [8], fr: 'Double mutation', en: 'Double mutation', d: () => L('Chaque mutation révèle 2 uniques : tu gardes celle que tu veux', 'Each mutation reveals 2 uniques: keep the one you want') },
    { id: 'bi', b: 'bic', costs: [20], fr: 'Aventure bicolore', en: 'Bicolore adventure', d: () => L('Option au départ : choisis une faction voisine sur la roue. Chaque carte draftée a 1 chance sur 2 d’en venir.', 'Start option: pick a neighbouring faction on the wheel. Each drafted card has a 50% chance to come from it.') }
  ];
  const TBY = Object.fromEntries(TAL.map(t => [t.id, t]));
  const spentOf = alloc => TAL.reduce((s, t) => s + t.costs.slice(0, alloc[t.id] | 0).reduce((a, b) => a + b, 0), 0);
  const heatOf = spent => Math.floor(spent / 10); // 1 niveau de menace tous les 10 pièces dépensées
  const heatTxt = h => h ? L('+' + (25 * h) + ' % de rares et d’altérations adverses', '+' + (25 * h) + '% enemy rares and alterations') + (Math.floor(h / 2) ? L(', +' + Math.floor(h / 2) + ' carte' + (Math.floor(h / 2) > 1 ? 's' : '') + ' en main adverse dès le combat 2', ', +' + Math.floor(h / 2) + ' enemy card' + (Math.floor(h / 2) > 1 ? 's' : '') + ' in hand from fight 2') : '') : L('aucune', 'none');
  const T = (run, id) => ((run && run.t) || {})[id] | 0;
  const COIN = i => i === FIGHTS - 1 ? 3 : MINI.includes(i) ? 2 : 1;
  // Roue des factions (celle réglée sur le deckbuilder si elle existe)
  function wheel() { try { const f = JSON.parse(localStorage.getItem('alt-bi-fmt') || 'null'); if (f && Array.isArray(f.wheel) && f.wheel.length === 6 && FAC.every(x => f.wheel.includes(x))) return f.wheel; } catch (e) { } return ['AX', 'BR', 'MU', 'LY', 'YZ', 'OR']; }
  const neighbours = f => { const w = wheel(), i = w.indexOf(f); return i < 0 ? [] : [w[(i + 5) % 6], w[(i + 1) % 6]]; };

  // Stats d'aventure par faction : courses, aventures réussies, meilleur résultat, combats gagnés (sans talents / avec talents séparés)
  const SKEY = 'alt-bi-rogue-stats';
  const loadStats = () => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { return {}; } };
  function record(run) { if (!run || run.counted) return; const S = loadStats(), w = run.log.filter(x => x.won).length, key = (run.tal ? 't:' : '') + run.f, o = S[key] || { runs: 0, wins: 0, best: 0, fights: 0 };
    o.runs++; if (run.over === 'win') o.wins++; o.best = Math.max(o.best, w); o.fights += w; S[key] = o; try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { } run.counted = true; }
  function statsView() { const S = loadStats(), rows = [];
    for (const [pre, lab] of [['', L('sans talents', 'no talents')], ['t:', L('avec talents', 'with talents')]]) for (const f of FAC) { const o = S[pre + f]; if (o && o.runs) rows.push('<tr><td><b style="color:' + FC[f] + '">' + FN[f] + '</b> <span class="small">' + lab + '</span></td><td>' + o.runs + '</td><td>' + o.wins + '</td><td>' + (o.best >= FIGHTS ? '👑' : o.best + ' / ' + FIGHTS) + '</td><td>' + o.fights + '</td></tr>'); }
    if (!rows.length) return '';
    return '<div class="rgbox"><h3 style="margin:0 0 6px">📊 ' + L('Mes stats d’aventure', 'My adventure stats') + '</h3><table class="rgstats"><tr><th></th><th>' + L('Courses', 'Runs') + '</th><th>' + L('Réussies', 'Cleared') + '</th><th>' + L('Record', 'Best') + '</th><th>' + L('Combats gagnés', 'Fights won') + '</th></tr>' + rows.join('') + '</table></div>'; }
  // Hasard reproductible (graine de la partie)
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (R, a) => a[Math.floor(R() * a.length)];
  const shuffle = (R, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fam = r => r.replace(/_(C|R\d|U_\d+)$/, '');
  const num = v => parseInt(String(v ?? '').replace(/#/g, ''), 10) || 0;
  const NM = c => (EN() ? c.en : c.n) || c.n;

  // ---- Cartes altérées : une « unique » fabriquée à partir d'une carte, avec ses stats modifiées ----
  const CH = c => c.t === 'CHARACTER';
  const fx = (fr, en, xe, x) => c => { c.xe = (c.xe ? c.xe + '  ' : '') + xe; c.x = (c.x ? c.x + '  ' : '') + x; c.add = (c.add || []).concat([{ fr, en, x, xe }]); };
  const ALT = [
    // Effets ajoutés (tous automatisés par le moteur)
    { k: 'd', w: 3, fr: 'Main : piochez une carte', en: 'Hand: draw a card', ok: c => true, ap: fx('Main : piochez une carte', 'Hand: draw a card', '{H} Draw a card.', '{H} Piochez une carte.') },
    { k: 'b', w: 3, fr: 'Joué : je gagne 1 boost', en: 'Played: I gain 1 boost', ok: CH, ap: fx('Joué : je gagne 1 boost', 'Played: I gain 1 boost', '{J} I gain 1 boost.', '{J} Je gagne 1 boost.') },
    { k: 'r', w: 2, fr: 'Réserve : je gagne 2 boosts', en: 'Reserve: I gain 2 boosts', ok: CH, ap: fx('Réserve : je gagne 2 boosts', 'Reserve: I gain 2 boosts', '{R} I gain 2 boosts.', '{R} Je gagne 2 boosts.') },
    { k: 'n', w: 2, fr: 'À Midi : je gagne 1 boost', en: 'At Noon: I gain 1 boost', ok: CH, ap: fx('À Midi : je gagne 1 boost', 'At Noon: I gain 1 boost', 'At Noon — I gain 1 boost.', 'À Midi — Je gagne 1 boost.') },
    { k: 'a', w: 2, fr: 'Joué : je gagne Ancré', en: 'Played: I gain Anchored', ok: CH, ap: fx('Joué : je gagne Ancré', 'Played: I gain Anchored', '{J} I gain [[Anchored]].', '{J} Je gagne [[Ancré]].') },
    { k: 'm', w: 2, fr: 'Joué : redressez un Orbe de Mana', en: 'Played: ready a Mana Orb', ok: c => num(c.c) >= 3, ap: fx('Joué : redressez un Orbe de Mana', 'Played: ready a Mana Orb', '{J} Ready a Mana Orb.', '{J} Redressez un Orbe de Mana.') },
    { k: 'e', w: 1, rare: 1, fr: 'Joué : chaque personnage de mon expédition gagne 1 boost', en: 'Played: each Character in my Expedition gains 1 boost', ok: CH, ap: fx('Joué : chaque personnage de mon expédition gagne 1 boost', 'Played: each Character in my Expedition gains 1 boost', '{J} Each Character in my Expedition gains 1 boost.', '{J} Chaque Personnage de mon Expédition gagne 1 boost.') },
    { k: 'D', w: 1, rare: 1, fr: 'Main : piochez deux cartes', en: 'Hand: draw two cards', ok: c => num(c.c) >= 4, ap: fx('Main : piochez deux cartes', 'Hand: draw two cards', '{H} Draw two cards.', '{H} Piochez deux cartes.') },
    // Stats et coûts
    { k: 'A', w: 1, fr: '+1 partout', en: '+1 to all stats', ok: CH, rare: 1, ap: c => { c.p = c.p.map(v => String(num(v) + 1)); } },
    { k: 'H', w: 2, fr: '−1 coût de main', en: '−1 hand cost', ok: c => num(c.c) >= 2, ap: c => { c.c = String(num(c.c) - 1); } },
    { k: 'R', w: 1, fr: '−1 coût de Réserve', en: '−1 Reserve cost', ok: c => num(c.rc) >= 2, ap: c => { c.rc = String(num(c.rc) - 1); } },
  ];
  const wpick = (R, a) => { const t = a.reduce((x, y) => x + (y.w || 1), 0); let r = R() * t; for (const x of a) { r -= (x.w || 1); if (r <= 0) return x; } return a[a.length - 1]; };
  let UQN = 0;
  function alterCard(run, ref, alt) {
    const DB = P().DB, b = DB[ref]; if (!b) return null;
    const c = JSON.parse(JSON.stringify(b)); delete c._s;
    c.p = (c.p || ['0', '0', '0']).slice(); alt.ap(c);
    const n = 900000 + (run.uqSeq = (run.uqSeq || 0) + 1) + (UQN++ % 1);
    c.r = fam(ref) + '_U_' + n; c.u = true; c.y = 'U'; c.v = 'U'; c.alt = (b.alt || []).concat(alt.k);
    c.base = b.base || ref;
    run.uq[c.r] = c; DB[c.r] = c; return c.r;
  }
  function altLabel(c) { return (c && c.alt || []).map(k => { if (k === 'U') return L('vraie unique', 'real unique'); const a = ALT.find(x => x.k === k); return a ? L(a.fr, a.en) : ''; }).join(', '); }

  // ---- Decks ----
  function starter(f) { return P().STARTERS.find(s => s.id === 'starter-' + f); }
  function deckObj(run, d, name) { const uq = {}; for (const r in d.cards) if (run.uq[r]) uq[r] = run.uq[r]; return { hero: d.hero, cards: Object.assign({}, d.cards), name, uq }; }
  function rareOf(R, ref, f) { const DB = P().DB, b = fam(ref); const opts = ['_R1', '_R2'].map(x => b + x).filter(r => DB[r] && (!f || DB[r].f === f || DB[r].h === f)); return opts.length ? pick(R, opts) : null; }
  function addCard(d, r, n = 1) { d.cards[r] = (d.cards[r] || 0) + n; }
  function delCard(d, r, n = 1) { d.cards[r] = (d.cards[r] || 0) - n; if (d.cards[r] <= 0) delete d.cards[r]; }
  // Deck de l'adversaire : un deck de départ de plus en plus amélioré selon le combat (et la menace des talents)
  function edge(run, i) { const b = Object.assign({}, BONUS[i] || {}), h = run.heat | 0; if (i >= 1 && Math.floor(h / 2)) b.cards = (b.cards || 0) + Math.floor(h / 2); return b; }
  function enemyDeck(run, i) {
    const R = rng(run.seed * 31 + i * 977), DB = P().DB;
    const others = FAC.filter(f => f !== run.f), f = pick(R, others), st = starter(f);
    const d = { hero: st.hero, cards: Object.assign({}, st.cards) };
    const boss = i === FIGHTS - 1, mini = MINI.includes(i), hm = 1 + .25 * (run.heat | 0);
    // Paliers : combats 1-3 faciles, mini-boss (4), 5-6, mini-boss (7), 8-9, boss (10)
    const ups = Math.round(([0, 2, 3, 7, 6, 8, 11, 10, 12, 16][i] || 0) * hm), alts = Math.round(([0, 0, 1, 3, 2, 3, 6, 5, 7, 12][i] || 0) * hm);
    for (let k = 0; k < ups; k++) { const commons = Object.keys(d.cards).filter(r => /_C$/.test(r) && DB[r].t !== 'HERO'); if (!commons.length) break; const r = pick(R, commons), up = rareOf(R, r, f); if (!up) continue; delCard(d, r); addCard(d, up); }
    for (let k = 0; k < alts; k++) { const pool = Object.keys(d.cards).filter(r => !DB[r].u && DB[r].t !== 'HERO'); if (!pool.length) break; const r = pick(R, pool), ok = ALT.filter(a => a.ok(DB[r]) && (!a.rare || boss || mini || R() < .3)); if (!ok.length) continue; const nr = alterCard(run, r, wpick(R, ok)); if (nr) { delCard(d, r); addCard(d, nr); } }
    // Avantage de départ (mesuré par simulations IA contre IA : +2 mana ≈ −20 pts de victoire, +2 cartes ≈ −15 pts)
    return { d, f, boss, mini, bonus: edge(run, i) };
  }

  // ---- Récompenses ----
  const MINDECK = 39;
  function cardPool(f) { const DB = P().DB; return Object.values(DB).filter(c => !c.u && c.t !== 'HERO' && !/TOKEN|FOILER/.test(c.t) && (c.f === f || c.h === f) && (c.y === 'C' || (c.y === 'R' && c.f === f))); }
  const sameRare = r => { const DB = P().DB, b = fam(r), f = DB[r] && DB[r].f; return ['_R1', '_R2'].map(x => b + x).find(x => DB[x] && DB[x].f === f) || null; };
  // Chance de rare par carte proposée, de plus en plus forte au fil des combats (≈15 % au début, ≈75 % avant le boss)
  const rareChance = i => .15 + .6 * Math.min(1, Math.max(0, (i - 1) / (FIGHTS - 2)));
  const isQ = r => /^\?U:/.test(r), qBase = r => r.slice(3); // « unique mystère » : révélée au moment où on la prend
  // Draft : n cartes ; après un mini-boss, que des rares (5 % d'unique) ; aventure bicolore : 1 chance sur 2 par carte de venir de la faction voisine
  function draftOffer(run, fi, mini) {
    const R = rng(run.seed * 7 + (fi + 2) * 131 + (run.rrn | 0) * 7919 + run.log.length * 31), DB = P().DB, ban = new Set(run.banned || []);
    const mk = f => { const all = cardPool(f).filter(c => !ban.has(c.n)); return { C: shuffle(R, all.filter(c => c.y === 'C')), R: shuffle(R, all.filter(c => c.y === 'R')) }; };
    const own = mk(run.f), sec = run.sec ? mk(run.sec) : null, rl = T(run, 'rare');
    const n = 3 + T(run, 'wide'), pr = mini ? 1 : Math.min(.95, rareChance(fi) + [0, .1, .2, .2][rl]), pu = mini || rl >= 3 ? .05 : 0, out = [];
    for (let k = 0; k < n * 4 && out.length < n; k++) {
      const src = sec && R() < .5 ? sec : own, u = R() < pu, rare = u || R() < pr, list = rare && src.R.length ? src.R : src.C.length ? src.C : src.R;
      if (!list.length) continue; const c = list.shift(); if (out.some(x => x === c.r || (isQ(x) && qBase(x) === c.r))) continue;
      out.push(u ? '?U:' + c.r : c.r);
    }
    return out;
  }
  function upOffer(run) { const R = rng(run.seed * 11 + run.i * 197 + (run.rrn | 0) * 7919 + run.log.length * 31), DB = P().DB; const cs = shuffle(R, Object.keys(run.deck.cards).filter(r => /_C$/.test(r) && DB[r] && sameRare(r))); return cs.slice(0, 3).map(r => ({ ref: r, to: sameRare(r) })); }
  const upgradable = run => sorted(run.deck.cards).filter(r => /_C$/.test(r) && sameRare(r));
  // Mutation : la carte devient toujours une vraie unique tirée de la base communautaire (meilleure ou pire : c'est le pari)
  async function mutate(run, ref) {
    const DB = P().DB, b = DB[ref]; if (!b) return null;
    const m = fam(ref).match(/^ALT_([A-Z0-9]+)_B_([A-Z]{2})_(\d+)$/);
    if (m && window.AltUniques) {
      for (const set of m[1] === 'CORE' ? ['CORE', 'COREKS'] : [m[1]]) {
        try {
          const res = await fetch('https://api.github.com/repos/Altered-Community/databases/contents/' + set + '/' + m[2] + '/' + m[3]);
          if (!res.ok) continue; const list = (await res.json()).filter(x => /_U_\d+\.json$/.test(x.name)); if (!list.length) continue;
          for (let k = 0; k < 3; k++) {
            const it = list[Math.floor(Math.random() * list.length)], uref = it.name.replace('.json', '').replace('_' + set + '_', '_' + m[1] + '_');
            const c = await AltUniques.fetchRef(uref); const u = c && AltUniques.sanitize(c);
            if (u) { u.alt = ['U']; run.uq[u.r] = u; DB[u.r] = u; return u.r; }
          }
        } catch (e) { }
      }
    }
    return null; // échec (réseau) : la carte n'est pas touchée, on peut réessayer
  }
  // ---- Écrans ----
  function img(ref, cls) { return '<span class="rgc' + (cls ? ' ' + cls : '') + '">' + P().cardImg(ref) + '</span>'; }
  function qImg(r, cls) { return isQ(r) ? '<span class="rgmyst">' + img(qBase(r), cls) + '<b>✦ ' + L('Unique mystère', 'Mystery unique') + '</b></span>' : img(r, cls); }
  function hearts(n) { return '♥'.repeat(Math.max(0, n)) + '<span style="opacity:.25">' + '♥'.repeat(Math.max(0, LIVES - n)) + '</span>'; }
  function track(run) { let h = ''; for (let i = 0; i < FIGHTS; i++) h += '<span class="rgn' + (i < run.i ? ' done' : i === run.i ? ' cur' : '') + (i === FIGHTS - 1 ? ' boss' : MINI.includes(i) ? ' mini' : '') + '">' + (i === FIGHTS - 1 ? '👑' : MINI.includes(i) ? '★' : i + 1) + '</span>'; return '<div class="rgtrack"><div class="rgline"></div>' + h + '</div>'; }
  function deckCount(d) { return Object.values(d.cards).reduce((a, b) => a + b, 0); }
  function show(html) { $('lobby').classList.add('hidden'); $('game').classList.add('hidden'); const r = $('rogue'); r.classList.remove('hidden'); const run0 = load(), f0 = run0 && !run0.over ? run0.f : null, s0 = run0 && run0.sec, h0 = run0 && run0.deck && run0.deck.hero;
    r.style.setProperty('--rf', f0 ? FC[f0] : '#c9a24a'); r.style.setProperty('--rs', s0 ? FC[s0] : (f0 ? FC[f0] : '#5a4bb5')); document.body.classList.add('rgon');
    r.innerHTML = (h0 && f0 ? '<div class="rgbg" style="background-image:url(\'img/' + P().LANG + '/' + esc(h0) + '.webp\')"></div>' : '<div class="rgbg none"></div>') + '<div class="rgwrap"><div class="row lhead"><h1 style="font-size:28px;margin-right:auto">🗡️ ' + L('Aventure', 'Adventure') + ' <span class="beta">' + L('bêta', 'beta') + '</span></h1><button data-rg="home">' + L('← Table', '← Table') + '</button></div>' + html + '</div>'; window.scrollTo(0, 0); }
  function home() { document.body.classList.remove('rgon'); $('rogue').classList.add('hidden'); $('lobby').classList.remove('hidden'); }
  const tokens = run => ((run.rr | 0) || (run.ban | 0)) ? '<span class="rgtok">' + (run.rr | 0 ? '🎲 ' + run.rr + ' ' : '') + (run.ban | 0 ? '⛔ ' + run.ban : '') + '</span>' : '';
  const facLine = run => '<span style="color:' + FC[run.f] + ';font-weight:700">' + FN[run.f] + '</span>' + (run.sec ? ' + <span style="color:' + FC[run.sec] + ';font-weight:700">' + FN[run.sec] + '</span>' : '');

  function screen() {
    const run = load(); if (!run) return choose();
    if (P().DB) for (const c of Object.values(run.uq || {})) P().DB[c.r] = c;
    if (run.over) return end(run);
    if (run.org) return organize(run);
    if (run.reward) return reward(run);
    const DB = P().DB, b = edge(run, run.i);
    show('<div class="rgbox"><div class="rgtop">' + facLine(run) + ' · ' + esc(NM(DB[run.deck.hero])) + tokens(run) + '<span style="margin-left:auto;font-size:20px;color:#e0546a">' + hearts(run.lives) + '</span></div>' + track(run) +
      '<p class="note">' + (run.i === FIGHTS - 1 ? L('Dernier combat : le boss, avec un deck très amélioré.', 'Final fight: the boss, with a heavily upgraded deck.') : L('Combat ', 'Fight ') + (run.i + 1) + ' / ' + FIGHTS + ' · ' + (MINI.includes(run.i) ? L('★ Mini-boss : un adversaire nettement plus coriace.', '★ Mini-boss: a noticeably tougher opponent.') : L('Ton adversaire a un deck plus fort à chaque combat.', 'Your opponent’s deck gets stronger every fight.'))) +
      (bonusTxt(b) ? '<br>⚔️ ' + L('Avantage de l’adversaire : ', 'Opponent’s edge: ') + bonusTxt(b) : '') + (run.heat ? '<br>🔥 ' + L('Menace niveau ', 'Threat level ') + run.heat : '') + '</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="pri" data-rg="fight"' + (deckCount(run.deck) < MINDECK ? ' disabled title="' + L('Il faut au moins 39 cartes', 'You need at least 39 cards') + '"' : '') + '>⚔️ ' + L('Combattre', 'Fight') + '</button><button data-rg="org">🃏 ' + L('Organiser mon deck', 'Organise my deck') + ' (' + deckCount(run.deck) + ')</button><button data-rg="quit" style="margin-left:auto">' + L('Abandonner la partie', 'Abandon the run') + '</button></div></div>' + (run.showDeck ? deckView(run) : ''));
  }
  const rareRefs = run => Object.keys(run.deck.cards).filter(r => P().DB[r] && P().DB[r].y === 'R');
  function deckView(run, act, only) {
    const DB = P().DB, refs = sorted(run.deck.cards).filter(r => !only || only(r));
    return '<div class="rggrid">' + refs.map(r => '<div class="rgitem"' + (act ? ' data-rg="' + act + '" data-r="' + r + '" style="cursor:pointer"' : '') + '>' + img(r) + '<span class="rgq">×' + run.deck.cards[r] + '</span>' + (DB[r].u ? '<span class="rgalt">✦ ' + esc(altLabel(DB[r])) + '</span>' : '') + '</div>').join('') + '</div>';
  }
  function choose() {
    const m = loadMeta(), sp = spentOf(m.alloc), avail = m.earned - sp, h = heatOf(sp);
    show('<div class="rgbox"><p>' + L('Choisis ta faction. Tu pars avec son deck de départ, tu affrontes ' + FIGHTS + ' adversaires de plus en plus forts (dont 2 mini-boss et un boss) et tu améliores ton deck après chaque combat. Trois défaites et c’est fini.', 'Choose your faction. You start with its starter deck, face ' + FIGHTS + ' increasingly strong opponents (including 2 mini-bosses and a boss) and improve your deck after every fight. Three losses and it is over.') + '</p>' +
      '<div class="rgtalbar"><button data-rg="tal">🌳 ' + L('Talents', 'Talents') + ' · 🪙 ' + avail + '</button>' + (sp ? '<label><input type="checkbox" data-rg="usetal"' + (m.useTal ? ' checked' : '') + '> ' + L('Jouer avec mes talents', 'Play with my talents') + ' <span class="small">(🔥 ' + L('menace ', 'threat ') + h + ')</span></label>' : '<span class="small">' + L('Gagne des pièces en battant des adversaires pour débloquer des talents.', 'Earn coins by beating opponents to unlock talents.') + '</span>') + '</div><div class="rgfac">' +
      FAC.map(f => '<button data-rg="start" data-f="' + f + '" style="border-color:' + FC[f] + '"><b style="color:' + FC[f] + '">' + FN[f] + '</b>' + (starter(f) ? '<span class="small">' + esc(NM(P().DB[starter(f).hero])) + '</span>' : '') + '</button>').join('') + '</div></div>' + statsView());
  }
  function chooseSec(f) {
    show('<div class="rgbox"><p><b>🧭 ' + L('Aventure bicolore ?', 'Bicolore adventure?') + '</b></p><p class="note">' + L('Avec une faction voisine, chaque carte proposée au draft a 1 chance sur 2 de venir d’elle.', 'With a neighbouring faction, each card offered in drafts has a 50% chance to come from it.') + '</p><div class="rgfac">' +
      '<button data-rg="start2" data-f="' + f + '" data-s=""><b style="color:' + FC[f] + '">' + FN[f] + '</b><span class="small">' + L('seule', 'alone') + '</span></button>' +
      neighbours(f).map(s => '<button data-rg="start2" data-f="' + f + '" data-s="' + s + '" style="border-color:' + FC[s] + '"><b><span style="color:' + FC[f] + '">' + FN[f] + '</span> + <span style="color:' + FC[s] + '">' + FN[s] + '</span></b></button>').join('') + '</div></div>');
  }
  function start(f, sec) {
    const st = starter(f); if (!st) return;
    const m = loadMeta(), sp = spentOf(m.alloc), tal = !!(m.useTal && sp), t = tal ? Object.assign({}, m.alloc) : {};
    const run = { v: 2, f, sec: tal && t.bi && neighbours(f).includes(sec) ? sec : '', tal, t, heat: tal ? heatOf(sp) : 0, seed: Math.floor(Math.random() * 1e9), i: 0, lives: LIVES, deck: { hero: st.hero, cards: Object.assign({}, st.cards) }, bench: {}, uq: {}, log: [], rr: [0, 2, 5, 10][t.rr | 0], ban: t.ban | 0, banned: [], rrn: 0, queue: [] };
    const R = rng(run.seed * 3);
    for (let k = 0; k < (t.srare | 0); k++) { const cs = upgradable(run); if (!cs.length) break; const r = pick(R, cs); delCard(run.deck, r); addCard(run.deck, sameRare(r)); }
    for (let k = 0; k < (t.pre | 0); k++) run.queue.push('draft');
    if (t.smut) run.queue.push('smut');
    nextStep(run); save(run); screen();
  }
  function fight() {
    const run = load(); if (!run) return;
    for (const c of Object.values(run.uq)) P().DB[c.r] = c;
    const e = enemyDeck(run, run.i);
    const me = deckObj(run, run.deck, L('Mon deck', 'My deck')), foe = deckObj(run, e.d, e.boss ? 'Boss' : e.mini ? L('Mini-boss', 'Mini-boss') : FN[e.f]);
    save(run);
    const who = (e.boss ? '👑 ' + L('Boss', 'Boss') + ' ' : e.mini ? '★ ' + L('Mini-boss', 'Mini-boss') + ' ' : '') + FN[e.f];
    $('rogue').classList.add('hidden');
    P().start(me, foe, L('Toi', 'You'), who, won => after(won), e.bonus);
  }
  // Après chaque combat, gagné ou perdu : draft puis amélioration. Les pièces ne viennent qu'avec une victoire.
  function after(won) {
    const run = load(); if (!run) return home();
    const fi = run.i, mini = MINI.includes(fi); let coins = 0;
    run.log.push({ i: fi, won });
    if (won) { coins = COIN(fi); const m = loadMeta(); m.earned += coins; saveMeta(m); if (mini) run.rr = (run.rr | 0) + T(run, 'mtok'); if (fi === FIGHTS - 1) run.over = 'win'; else run.i++; }
    else { run.lives--; if (run.lives <= 0) run.over = 'lose'; }
    if (run.over) record(run);
    else run.reward = { step: 'draft', fi, mini, won, coins, picks: won && mini && T(run, 'mini2') ? 2 : 1, cards: draftOffer(run, fi, mini) };
    save(run); screen();
  }
  function toBoon(run) { const rw = run.reward; if (rw.pre) return nextStep(run); run.reward = { step: 'boon', fi: rw.fi, mini: rw.mini, won: rw.won, coins: rw.coins, upsLeft: rw.won && rw.mini && T(run, 'mini2up') ? 2 : 1, ups: upOffer(run) }; }
  function nextStep(run) { run.reward = null; const s = (run.queue || []).shift(); if (s === 'draft') run.reward = { step: 'draft', pre: true, fi: 0, picks: 1, cards: draftOffer(run, 0, false) }; else if (s === 'smut') run.reward = { step: 'boon', pre: true, free: true }; }
  function reward(run) {
    const rw = run.reward, top = '<div class="rgtop">' + (rw.pre ? '<b>🎒 ' + L('Préparation de l’aventure', 'Getting ready') + '</b>' : rw.won ? '<b>' + L('Victoire !', 'Victory!') + '</b>' + (rw.coins ? ' <span class="rgcoin">+' + rw.coins + ' 🪙</span>' : '') : '<b>' + L('Défaite…', 'Defeat…') + '</b> <span class="small">' + L('tu gardes ta récompense, sans pièce', 'you keep your reward, no coin') + '</span>') + tokens(run) + '<span style="margin-left:auto;font-size:20px;color:#e0546a">' + hearts(run.lives) + '</span></div>' + track(run);
    if (rw.step === 'draft') {
      const cnt = run.queue && rw.pre ? ' (' + L('draft de départ', 'opening draft') + ')' : '';
      show('<div class="rgbox">' + top + '<p>' + (rw.pre ? '' : '<b>1/2</b> · ') + (rw.picks > 1 ? L('Choisis <b>' + rw.picks + ' cartes</b> à ajouter à ton deck', 'Choose <b>' + rw.picks + ' cards</b> to add to your deck') : L('Choisis une carte à ajouter à ton deck', 'Choose a card to add to your deck')) + cnt + (rw.mini ? ' · ★ ' + L('que des rares', 'rares only') : '') + ' :</p><div class="rgoffers">' +
        rw.cards.map((r, k) => '<div class="rgoff"><button class="rgoffer" data-rg="draft" data-k="' + k + '"' + (rw.busy ? ' disabled' : '') + '>' + qImg(r) + '</button>' + ((run.ban | 0) && !rw.busy ? '<button class="rgban" data-rg="ban" data-k="' + k + '" title="' + L('Bannir cette carte', 'Ban this card') + '">⛔</button>' : '') + '</div>').join('') + '</div>' +
        (rw.busy ? '<p class="note">⏳ ' + L('Révélation de l’unique…', 'Revealing the unique…') + '</p>' : '') +
        '<div class="row" style="margin-top:10px;gap:8px">' + ((run.rr | 0) ? '<button data-rg="reroll"' + (rw.busy ? ' disabled' : '') + '>🎲 ' + L('Relancer', 'Reroll') + ' (' + run.rr + ')</button>' : '') + '<button data-rg="draftskip"' + (rw.busy ? ' disabled' : '') + '>' + L('Ne rien prendre', 'Take nothing') + '</button></div></div>');
    } else if (rw.step === 'boon') {
      const ups = rw.ups || [], free = !!rw.free, res = rw.res || [];
      const upPart = free ? '' : '<p><b>2/2</b> · ' + L('Améliore une carte en rare', 'Upgrade a card to rare') + (rw.upsLeft > 1 ? ' (' + L('encore ', '') + rw.upsLeft + L('', ' left') + ')' : '') + '…</p>' +
        (T(run, 'pickup') ? (upgradable(run).length ? '<p class="note">' + L('Libre choix : clique la commune à améliorer.', 'Free choice: click the common to upgrade.') + '</p>' + deckView(run, 'upd', r => /_C$/.test(r) && !!sameRare(r)) : '<p class="note">' + L('Aucune commune améliorable dans ton deck.', 'No upgradable common in your deck.') + '</p>')
          : (ups.length ? '<div class="rgoffers">' + ups.map((o, k) => '<button class="rgoffer" data-rg="up" data-k="' + k + '"><div class="rgpair">' + img(o.ref, 'sm') + '<span class="rgarr">→</span>' + img(o.to, 'sm') + '</div></button>').join('') + '</div>' + ((run.rr | 0) ? '<div class="row" style="margin-top:6px"><button data-rg="uprr">🎲 ' + L('Relancer', 'Reroll') + ' (' + run.rr + ')</button></div>' : '') : '<p class="note">' + L('Aucune commune améliorable dans ton deck.', 'No upgradable common in your deck.') + '</p>'));
      const mutTxt = free ? '<p>🎁 ' + L('<b>Mutation offerte</b> : choisis une carte de ton deck, elle devient une <b>vraie unique</b> tirée au hasard.', '<b>Free mutation</b>: pick a card from your deck and it becomes a random <b>real unique</b>.') + '</p>'
        : '<p style="margin-top:14px">' + L('…ou tente une <b>mutation</b> 🎲 : choisis une <b>rare</b> de ton deck, elle devient une <b>vraie unique</b> tirée au hasard. Parfois bien meilleure, parfois pire : c’est le pari !', '…or try a <b>mutation</b> 🎲: pick a <b>rare</b> from your deck and it becomes a random <b>real unique</b>. Sometimes much better, sometimes worse: that’s the gamble!') + '</p>';
      const canMut = free ? (r => P().DB[r].t !== 'HERO' && !P().DB[r].u) : (r => P().DB[r].y === 'R');
      const resPart = res.length ? '<div class="rgbox" style="text-align:center"><p><b>' + (res.length > 1 ? L('Choisis ton unique :', 'Pick your unique:') : L('Résultat :', 'Result:')) + '</b></p><div class="rgoffers" style="justify-content:center">' + res.map((r, k) => '<button class="rgoffer" data-rg="mutkeep" data-k="' + k + '"><div class="rgpair">' + (k === 0 ? img(rw.from, 'sm') + '<span class="rgarr">→</span>' : '') + img(r) + '</div></button>').join('') + '</div><p class="note">' + L('Clique l’unique pour la garder', 'Click the unique to keep it') + (res.length === 1 ? '' : '') + '.</p>' + ((run.rr | 0) ? '<div class="row" style="justify-content:center"><button data-rg="mutrr">🎲 ' + L('Relancer l’unique', 'Reroll the unique') + ' (' + run.rr + ')</button></div>' : '') + '</div>' : '';
      show('<div class="rgbox">' + top + upPart + (res.length ? resPart : mutTxt + '<div class="row"><button data-rg="mutpick"' + (rw.busy ? ' disabled' : '') + '>🎲 ' + L('Mutation', 'Mutation') + '</button><button data-rg="boonskip"' + (rw.busy ? ' disabled' : '') + '>' + L('Passer', 'Skip') + '</button></div>' +
        (rw.picking ? (Object.keys(run.deck.cards).some(canMut) ? '<p class="note">' + L('Clique la carte à faire muter :', 'Click the card to mutate:') + '</p>' + deckView(run, 'mut', canMut) : '<p class="note">' + L('Il te faut d’abord une rare : améliore une commune, puis fais-la muter à un prochain combat.', 'You need a rare first: upgrade a common, then mutate it after a later fight.') + '</p>') : '') +
        (rw.fail ? '<p class="note">' + L('La mutation n’a pas pu se faire (connexion ?) : ta carte n’a pas changé, réessaie.', 'The mutation failed (connection?): your card is unchanged, try again.') + '</p>' : '') + (rw.busy ? '<p class="note">⏳ ' + L('Mutation en cours…', 'Mutating…') + '</p>' : '')) + '</div>');
    }
  }
  // Arbre de talents
  function talents() {
    const m = loadMeta(), sp = spentOf(m.alloc), avail = m.earned - sp, h = heatOf(sp), run = load();
    const node = t => { const l = m.alloc[t.id] | 0, max = t.costs.length, cost = t.costs[l], lockd = t.req && !(m.alloc[t.req] | 0), kids = TAL.some(x => x.req === t.id && (m.alloc[x.id] | 0)), can = l < max && !lockd && avail >= cost;
      return '<div class="rgnode' + (l ? ' on' : '') + (lockd ? ' lock' : '') + '"><div class="rgnh"><b>' + L(t.fr, t.en) + '</b><span class="rgpips">' + t.costs.map((c, i) => '<i class="' + (i < l ? 'f' : '') + '"></i>').join('') + '</span></div>' +
        '<p class="small">' + (l ? t.d(l) : t.d(1)) + (l && l < max ? '<br>→ ' + t.d(l + 1) : '') + '</p>' + (lockd ? '<p class="small">🔒 ' + L('Demande : ', 'Requires: ') + L(TBY[t.req].fr, TBY[t.req].en) + '</p>' : '') +
        '<div class="row" style="gap:6px">' + (l < max ? '<button class="pri" data-rg="tadd" data-id="' + t.id + '"' + (can ? '' : ' disabled') + '>+ ' + cost + ' 🪙</button>' : '<span class="small">' + L('Max', 'Max') + '</span>') + (l ? '<button data-rg="tsub" data-id="' + t.id + '"' + (l === 1 && kids ? ' disabled title="' + L('D’abord retirer les talents qui en dépendent', 'Remove the talents that depend on it first') + '"' : '') + '>−</button>' : '') + '</div></div>'; };
    show('<div class="rgbox"><div class="rgtop"><b>🌳 ' + L('Talents', 'Talents') + '</b><span style="margin-left:auto">🪙 <b>' + avail + '</b> <span class="small">/ ' + m.earned + ' ' + L('gagnées', 'earned') + '</span></span></div>' +
      '<p class="note">' + L('Pièces : +1 par combat gagné, +2 pour un mini-boss, +3 pour le boss. Les talents ne changent rien pendant la partie : ils aident à construire ton deck. Tu peux les retirer à tout moment pour récupérer tes pièces.', 'Coins: +1 per fight won, +2 for a mini-boss, +3 for the boss. Talents change nothing during the game: they help you build your deck. You can remove them any time to get your coins back.') + '</p>' +
      '<div class="rgheat"><div class="rgheatbar"><i style="width:' + Math.min(100, sp) + '%"></i></div><span>🔥 ' + L('Menace ', 'Threat ') + '<b>' + h + '</b> : ' + heatTxt(h) + '</span></div><p class="small">' + L('Chaque tranche de 10 pièces dépensées rend les adversaires plus forts. Décoche « Jouer avec mes talents » pour une aventure sans talents ni menace.', 'Every 10 coins spent makes opponents stronger. Untick “Play with my talents” for an adventure with no talents and no threat.') + '</p>' +
      (run && !run.over ? '<p class="note">⚠️ ' + L('Les changements s’appliqueront à ta prochaine aventure.', 'Changes apply to your next adventure.') + '</p>' : '') +
      '<div class="rgtal">' + Object.keys(BR).map(b => '<div class="rgbr"><h3>' + BR[b][0] + ' ' + L(BR[b][1], BR[b][2]) + '</h3>' + TAL.filter(t => t.b === b).map(node).join('') + '</div>').join('') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="pri" data-rg="open">' + L('Retour', 'Back') + '</button></div></div>');
  }
  // Organiser son deck : retirer des cartes vers la réserve d'aventure (banc) ou les remettre, minimum 39 cartes
  // Organiser son deck : même présentation que le deckbuilder (héros en haut, cartes par type, stats à droite)
  function orgCard(r, n, act) { const c = P().DB[r]; return '<div class="rgoc">' + img(r) + (c.u ? '<span class="rgalt">✦ ' + esc(altLabel(c)) + '</span>' : '') + '<span class="rgob"><button data-rg="' + act + '" data-r="' + esc(r) + '" title="' + (act === 'out' ? L('Mettre de côté', 'Set aside') : L('Remettre dans le deck', 'Put back in the deck')) + '">' + (act === 'out' ? '−' : '+') + '</button><b>×' + n + '</b></span></div>'; }
  function orgGroups(m, act) { const DB = P().DB, refs = sorted(m), G = [['CHARACTER', L('Personnages', 'Characters')], ['SPELL', L('Sorts', 'Spells')], ['PERM', L('Permanents', 'Permanents')]];
    return G.map(([k, t]) => { const R = refs.filter(r => k === 'PERM' ? /PERMANENT/.test(DB[r].t) : DB[r].t === k); if (!R.length) return ''; const n = R.reduce((a, r) => a + m[r], 0);
      return '<h3 class="rgog">' + t + ' <span>' + n + '</span></h3><div class="rgogrid">' + R.map(r => orgCard(r, m[r], act)).join('') + '</div>'; }).join(''); }
  function orgStats(d) { const DB = P().DB, cur = [0, 0, 0, 0, 0, 0, 0, 0], pw = [0, 0, 0]; let C = 0, R = 0, U = 0, ch = 0, sp = 0, pe = 0;
    for (const [r, n] of Object.entries(d.cards)) { const c = DB[r]; if (!c) continue; if (c.u) U += n; else if (c.y === 'R') R += n; else C += n;
      cur[Math.min(7, num(c.c))] += n; if (c.t === 'CHARACTER') { ch += n; (c.p || []).forEach((v, i) => { if (i < 3) pw[i] += num(v) * n; }); } else if (c.t === 'SPELL') sp += n; else pe += n; }
    const mx = Math.max(1, ...cur), tot = deckCount(d);
    return '<div class="rgst"><div class="rgsth"><b>' + tot + '</b> / ' + MINDECK + '+ ' + L('cartes', 'cards') + '</div>' +
      '<div class="rggem"><span class="g c">' + C + '</span>' + L('communes', 'commons') + '<span class="g r">' + R + '</span>' + L('rares', 'rares') + '<span class="g u">' + U + '</span>' + L('uniques', 'uniques') + '</div>' +
      '<div class="rgcurve">' + cur.map((v, i) => '<div><small>' + v + '</small><i style="height:' + Math.round(v / mx * 100) + '%"></i><span>' + (i === 7 ? '7+' : i) + '</span></div>').join('') + '</div>' +
      '<div class="rgtyp"><span>' + L('Personnages', 'Characters') + ' <b>' + ch + '</b></span><span>' + L('Sorts', 'Spells') + ' <b>' + sp + '</b></span><span>' + L('Permanents', 'Permanents') + ' <b>' + pe + '</b></span></div>' +
      '<div class="rgpw"><span class="F" title="' + L('Forêt', 'Forest') + '">' + pw[0] + '</span><span class="M" title="' + L('Montagne', 'Mountain') + '">' + pw[1] + '</span><span class="O" title="' + L('Océan', 'Ocean') + '">' + pw[2] + '</span></div><p class="small" style="margin:4px 0 0">' + L('Puissance totale des personnages par terrain', 'Total character power per terrain') + '</p></div>'; }
  function organize(run) {
    const DB = P().DB, h = DB[run.deck.hero], nb = Object.values(run.bench || {}).reduce((a, b) => a + b, 0), ok = deckCount(run.deck) >= MINDECK;
    show('<div class="rgbox rgorgh"><img class="rghero" alt="" src="img/' + P().LANG + '/' + esc(run.deck.hero) + '.webp"><div><div class="small">🃏 ' + L('Organiser mon deck', 'Organise my deck') + '</div><h2 style="margin:2px 0 4px">' + esc(h ? NM(h) : '') + '</h2><div>' + facLine(run) + '</div><p class="note" style="margin:6px 0 0">' + L('« − » met une carte de côté, « + » la remet. Au moins 39 cartes pour combattre, pas de limite d’exemplaires. Survole une carte pour la lire.', '“−” sets a card aside, “+” puts it back. At least 39 cards to fight, no copy limit. Hover a card to read it.') + '</p></div>' +
      '<button class="pri" data-rg="orgdone" style="margin-left:auto;align-self:center"' + (ok ? '' : ' title="' + L('Il faut au moins 39 cartes', 'You need at least 39 cards') + '"') + '>' + L('Terminé', 'Done') + '</button></div>' +
      '<div class="rgorg"><div class="rgbox">' + orgGroups(run.deck.cards, 'out') + '<h3 class="rgog" style="margin-top:18px">' + L('De côté', 'Set aside') + ' <span>' + nb + '</span></h3>' + (nb ? orgGroups(run.bench, 'in') : '<p class="note">—</p>') + '</div><aside class="rgside">' + orgStats(run.deck) + '</aside></div>');
  }
  function sorted(m) { const DB = P().DB; return Object.keys(m).filter(r => DB[r]).sort((a, b) => num(DB[a].c) - num(DB[b].c) || NM(DB[a]).localeCompare(NM(DB[b]))); }
  function benchView(run) { const b = run.bench || {}, DB = P().DB, refs = sorted(b); return refs.length ? '<div class="rggrid">' + refs.map(r => '<div class="rgitem" data-rg="in" data-r="' + r + '" style="cursor:pointer">' + img(r) + '<span class="rgq">×' + b[r] + '</span>' + (DB[r].u ? '<span class="rgalt">✦ ' + esc(altLabel(DB[r])) + '</span>' : '') + '</div>').join('') + '</div>' : '<p class="note">—</p>'; }
  function end(run) {
    const won = run.over === 'win', wins = run.log.filter(x => x.won).length, coins = run.log.filter(x => x.won).reduce((a, x) => a + COIN(x.i), 0);
    show('<div class="rgbox" style="text-align:center"><h2>' + (won ? '🏆 ' + L('Aventure réussie !', 'Adventure complete!') : '💀 ' + L('Aventure terminée', 'Adventure over')) + '</h2><p>' + L('Combats gagnés : ', 'Fights won: ') + wins + ' / ' + FIGHTS + ' · 🪙 +' + coins + '</p>' + track(run) + '<div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="pri" data-rg="new">' + L('Nouvelle aventure', 'New adventure') + '</button><button data-rg="tal">🌳 ' + L('Talents', 'Talents') + '</button><button data-rg="deck2">🃏 ' + L('Voir mon deck final', 'See my final deck') + '</button></div>' + (run.showDeck ? deckView(run) : '') + '</div>' + statsView());
  }
  // Mutation : 1 unique (ou 2 avec « Double mutation »), la carte d'origine n'est remplacée qu'au choix final
  function doMutate(run, r) {
    const n = T(run, 'dmut') ? 2 : 1; run.reward.busy = true; run.reward.picking = false; run.reward.fail = false; save(run); screen();
    (async () => { const res = []; for (let k = 0; k < n * 2 && res.length < n; k++) { const x = await mutate(run, r); if (x && !res.includes(x)) res.push(x); } return res; })().then(res => {
      const rr = load(); if (!rr || !rr.reward) return; rr.uq = run.uq; rr.uqSeq = run.uqSeq; rr.reward.busy = false;
      if (res.length) { rr.reward.res = res; rr.reward.from = r; } else rr.reward.fail = true; save(rr); screen(); });
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rg]'); if (!b) return; const k = b.dataset.rg; let run = load();
    if (k === 'open') return screen();
    if (k === 'home') return home();
    if (k === 'tal') return talents();
    if (k === 'usetal') { const m = loadMeta(); m.useTal = !!b.checked; saveMeta(m); return; }
    if (k === 'tadd' || k === 'tsub') { const m = loadMeta(), t = TBY[b.dataset.id]; if (!t) return; const l = m.alloc[t.id] | 0;
      if (k === 'tadd' && l < t.costs.length && m.earned - spentOf(m.alloc) >= t.costs[l] && (!t.req || (m.alloc[t.req] | 0))) m.alloc[t.id] = l + 1;
      if (k === 'tsub' && l && !(l === 1 && TAL.some(x => x.req === t.id && (m.alloc[x.id] | 0)))) { if (l === 1) delete m.alloc[t.id]; else m.alloc[t.id] = l - 1; }
      saveMeta(m); return talents(); }
    if (k === 'start') { const m = loadMeta(); if (m.useTal && (m.alloc.bi | 0) && spentOf(m.alloc)) return chooseSec(b.dataset.f); return start(b.dataset.f, ''); }
    if (k === 'start2') return start(b.dataset.f, b.dataset.s || '');
    if (!run) return screen();
    if (k === 'fight') return fight();
    if (k === 'deck' || k === 'deck2') { run.showDeck = !run.showDeck; save(run); return screen(); }
    if (k === 'quit') { if (confirm(L('Abandonner cette aventure ?', 'Abandon this adventure?'))) { if (run.log && run.log.length) record(run); localStorage.removeItem(KEY); screen(); } return; }
    if (k === 'new') { localStorage.removeItem(KEY); return screen(); }
    const rw = run.reward;
    if (k === 'draft' && rw && !rw.busy) { const r = rw.cards[+b.dataset.k]; if (!r) return;
      const done = rr => { const w = rr.reward; w.cards = w.cards.filter(x => x !== r); w.picks = (w.picks | 0) - 1; if (w.picks <= 0 || !w.cards.length) toBoon(rr); save(rr); screen(); };
      if (!isQ(r)) { addCard(run.deck, r); return done(run); }
      rw.busy = true; save(run); screen();
      return mutate(run, qBase(r)).then(nr => { const rr = load(); if (!rr || !rr.reward) return; rr.uq = run.uq; rr.uqSeq = run.uqSeq; rr.reward.busy = false; addCard(rr.deck, nr || qBase(r)); done(rr); }); }
    if (k === 'draftskip' && rw) { toBoon(run); save(run); return screen(); }
    if (k === 'reroll' && rw && (run.rr | 0) > 0) { run.rr--; run.rrn = (run.rrn | 0) + 1; rw.cards = draftOffer(run, rw.fi, rw.mini); save(run); return screen(); }
    if (k === 'ban' && rw && (run.ban | 0) > 0) { const r = rw.cards[+b.dataset.k]; if (!r) return; const c = P().DB[isQ(r) ? qBase(r) : r]; run.ban--; if (c) (run.banned = run.banned || []).push(c.n); rw.cards = rw.cards.filter(x => x !== r); if (!rw.cards.length) toBoon(run); save(run); return screen(); }
    const upDone = () => { rw.upsLeft = (rw.upsLeft | 0) - 1; if (rw.upsLeft > 0) { rw.ups = upOffer(run); save(run); return screen(); } nextStep(run); save(run); return screen(); };
    if (k === 'up' && rw) { const o = (rw.ups || [])[+b.dataset.k]; if (!o) return; delCard(run.deck, o.ref); addCard(run.deck, o.to); return upDone(); }
    if (k === 'upd' && rw && T(run, 'pickup')) { const r = b.dataset.r, to = sameRare(r); if (!to || !run.deck.cards[r]) return; delCard(run.deck, r); addCard(run.deck, to); return upDone(); }
    if (k === 'uprr' && rw && (run.rr | 0) > 0) { run.rr--; run.rrn = (run.rrn | 0) + 1; rw.ups = upOffer(run); save(run); return screen(); }
    if (k === 'boonskip' || k === 'boonok') { nextStep(run); save(run); return screen(); }
    if (k === 'mutpick' && rw) { rw.picking = !rw.picking; save(run); return screen(); }
    if (k === 'mut' && rw && !rw.busy && !(rw.res && rw.res.length)) return doMutate(run, b.dataset.r);
    if (k === 'mutrr' && rw && rw.from && (run.rr | 0) > 0) { run.rr--; rw.res = null; save(run); return doMutate(run, rw.from); }
    if (k === 'mutkeep' && rw && rw.res) { const r = rw.res[+b.dataset.k]; if (!r || !run.deck.cards[rw.from]) return; delCard(run.deck, rw.from); addCard(run.deck, r); nextStep(run); save(run); return screen(); }
    if (k === 'org') { run.org = true; save(run); return screen(); }
    if (k === 'orgdone') { run.org = false; save(run); return screen(); }
    if (k === 'out') { delCard(run.deck, b.dataset.r); run.bench = run.bench || {}; addCard({ cards: run.bench }, b.dataset.r); save(run); return screen(); }
    if (k === 'in') { delCard({ cards: run.bench }, b.dataset.r); addCard(run.deck, b.dataset.r); save(run); return screen(); }
  });
  // Zoom des cartes : survol (PC) ou appui long (téléphone), comme dans le deckbuilder
  { const Z = document.createElement('div'); Z.id = 'rgZoom'; document.body.appendChild(Z); let tm = null, lp = false;
    const showZ = (el, x) => { Z.innerHTML = el.innerHTML; Z.classList.add('on'); const w = Math.min(340, innerWidth * .8); Z.style.width = w + 'px';
      if (x == null || innerWidth < 700) { Z.style.left = (innerWidth - w) / 2 + 'px'; Z.style.top = Math.max(10, (innerHeight - w * 1.4) / 2) + 'px'; }
      else { Z.style.left = (x > innerWidth / 2 ? Math.max(10, x - w - 30) : Math.min(innerWidth - w - 10, x + 30)) + 'px'; Z.style.top = Math.max(10, (innerHeight - w * 1.4) / 2) + 'px'; } };
    const hideZ = () => { clearTimeout(tm); Z.classList.remove('on'); };
    document.addEventListener('mouseover', e => { const c = e.target.closest && e.target.closest('#rogue .rgc'); if (!c || matchMedia('(hover: none)').matches) return; clearTimeout(tm); tm = setTimeout(() => showZ(c, e.clientX), 250); });
    document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('#rogue .rgc'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) hideZ(); });
    document.addEventListener('touchstart', e => { const c = e.target.closest && e.target.closest('#rogue .rgc'); lp = false; if (!c) return; clearTimeout(tm); tm = setTimeout(() => { lp = true; showZ(c); }, 420); }, { passive: true });
    document.addEventListener('touchmove', () => clearTimeout(tm), { passive: true });
    document.addEventListener('touchend', () => { clearTimeout(tm); if (lp) setTimeout(hideZ, 0); });
    document.addEventListener('click', e => { if (lp && e.target.closest && e.target.closest('#rogue')) { lp = false; e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('scroll', hideZ, { passive: true }); }
  window.AltRogue = { screen, _enemyDeck: enemyDeck, _after: after, _draftOffer: draftOffer, _meta: { load: loadMeta, save: saveMeta, spentOf, heatOf } };
})();
