/* Mode Aventure (roguelike) : un deck de départ, une suite de combats contre l'IA, des récompenses entre les combats. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = () => window.AltPlay;
  const KEY = 'alt-bi-rogue', FIGHTS = 8, LIVES = 3;
  const FAC = ['AX', 'BR', 'LY', 'MU', 'OR', 'YZ'];
  const FN = { AX: 'Axiom', BR: 'Bravos', LY: 'Lyra', MU: 'Muna', OR: 'Ordis', YZ: 'Yzmir' };
  const FC = { AX: '#a0622d', BR: '#c4302b', LY: '#c84f86', MU: '#4a8a3a', OR: '#2f6fb5', YZ: '#6b55c9' };
  const EN = () => P() && P().LANG === 'en';
  const L = (fr, en) => EN() ? en : fr;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = r => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { } };
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
  // Deck de l'adversaire : un deck de départ de plus en plus amélioré selon le combat
  function enemyDeck(run, i) {
    const R = rng(run.seed * 31 + i * 977), DB = P().DB;
    const others = FAC.filter(f => f !== run.f), f = pick(R, others), st = starter(f);
    const d = { hero: st.hero, cards: Object.assign({}, st.cards) };
    const boss = i === FIGHTS - 1;
    const ups = [0, 2, 4, 6, 8, 10, 12, 16][i] || 0, alts = [0, 0, 0, 2, 3, 5, 7, 12][i] || 0;
    for (let k = 0; k < ups; k++) { const commons = Object.keys(d.cards).filter(r => /_C$/.test(r) && DB[r].t !== 'HERO'); if (!commons.length) break; const r = pick(R, commons), up = rareOf(R, r, f); if (!up) continue; delCard(d, r); addCard(d, up); }
    for (let k = 0; k < alts; k++) { const pool = Object.keys(d.cards).filter(r => !DB[r].u && DB[r].t !== 'HERO'); if (!pool.length) break; const r = pick(R, pool), ok = ALT.filter(a => a.ok(DB[r]) && (!a.rare || boss || R() < .3)); if (!ok.length) continue; const nr = alterCard(run, r, wpick(R, ok)); if (nr) { delCard(d, r); addCard(d, nr); } }
    return { d, f, boss };
  }

  // ---- Récompenses ----
  const MINDECK = 39;
  function cardPool(f) { const DB = P().DB; return Object.values(DB).filter(c => !c.u && c.t !== 'HERO' && !/TOKEN|FOILER/.test(c.t) && (c.f === f || c.h === f) && (c.y === 'C' || (c.y === 'R' && c.f === f))); }
  const sameRare = r => { const DB = P().DB, b = fam(r), f = DB[r] && DB[r].f; return ['_R1', '_R2'].map(x => b + x).find(x => DB[x] && DB[x].f === f) || null; };
  // Étape 1 : drafter une carte parmi 3 ; étape 2 : améliorer une carte en rare (parmi 3) ou tenter une mutation
  function draftOffer(run) { const R = rng(run.seed * 7 + run.i * 131), pool = shuffle(R, cardPool(run.f)); const out = []; for (const c of pool) { if (out.length >= 3) break; if (!out.includes(c.r)) out.push(c.r); } return out; }
  function upOffer(run) { const R = rng(run.seed * 11 + run.i * 197), DB = P().DB; const cs = shuffle(R, Object.keys(run.deck.cards).filter(r => /_C$/.test(r) && DB[r] && sameRare(r))); return cs.slice(0, 3).map(r => ({ ref: r, to: sameRare(r) })); }
  // Mutation : la carte devient une vraie unique tirée de la base communautaire (sinon, une altération de stats au hasard)
  async function mutate(run, ref) {
    const DB = P().DB, b = DB[ref]; if (!b) return null;
    const m = fam(ref).match(/^ALT_([A-Z0-9]+)_B_([A-Z]{2})_(\d+)$/);
    if (m && window.AltUniques && Math.random() < .5) { // une chance sur deux : une vraie unique (meilleure ou pire, c'est le pari)
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
    const ok = ALT.filter(a => a.ok(b) && (!a.rare || Math.random() < .6)); return ok.length ? alterCard(run, ref, wpick(Math.random, ok)) : null;
  }
  // ---- Écrans ----
  function img(ref, cls) { return '<span class="rgc' + (cls ? ' ' + cls : '') + '">' + P().cardImg(ref) + '</span>'; }
  function hearts(n) { return '♥'.repeat(n) + '<span style="opacity:.25">' + '♥'.repeat(LIVES - n) + '</span>'; }
  function track(run) { let h = ''; for (let i = 0; i < FIGHTS; i++) h += '<span class="rgn' + (i < run.i ? ' done' : i === run.i ? ' cur' : '') + (i === FIGHTS - 1 ? ' boss' : '') + '">' + (i === FIGHTS - 1 ? '👑' : i + 1) + '</span>'; return '<div class="rgtrack">' + h + '</div>'; }
  function deckCount(d) { return Object.values(d.cards).reduce((a, b) => a + b, 0); }
  function show(html) { $('lobby').classList.add('hidden'); $('game').classList.add('hidden'); const r = $('rogue'); r.classList.remove('hidden'); r.innerHTML = '<div class="rgwrap"><div class="row lhead"><h1 style="font-size:28px;margin-right:auto">🗡️ ' + L('Aventure', 'Adventure') + '</h1><button data-rg="home">' + L('← Table', '← Table') + '</button></div>' + html + '</div>'; window.scrollTo(0, 0); }
  function home() { $('rogue').classList.add('hidden'); $('lobby').classList.remove('hidden'); }

  function screen() {
    const run = load(); if (!run) return choose();
    if (P().DB) for (const c of Object.values(run.uq || {})) P().DB[c.r] = c;
    if (run.over) return end(run);
    if (run.org) return organize(run);
    if (run.reward) return reward(run);
    const st = starter(run.f), DB = P().DB;
    show('<div class="rgbox"><div class="rgtop"><span style="color:' + FC[run.f] + ';font-weight:700">' + FN[run.f] + '</span> · ' + esc(NM(DB[run.deck.hero])) + '<span style="margin-left:auto;font-size:20px;color:#e0546a">' + hearts(run.lives) + '</span></div>' + track(run) +
      '<p class="note">' + (run.i === FIGHTS - 1 ? L('Dernier combat : le boss, avec un deck très amélioré.', 'Final fight: the boss, with a heavily upgraded deck.') : L('Combat ', 'Fight ') + (run.i + 1) + ' / ' + FIGHTS + ' · ' + L('Ton adversaire a un deck plus fort à chaque combat.', 'Your opponent’s deck gets stronger every fight.')) + '</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="pri" data-rg="fight"' + (deckCount(run.deck) < MINDECK ? ' disabled title="' + L('Il faut au moins 39 cartes', 'You need at least 39 cards') + '"' : '') + '>⚔️ ' + L('Combattre', 'Fight') + '</button><button data-rg="org">🃏 ' + L('Organiser mon deck', 'Organise my deck') + ' (' + deckCount(run.deck) + ')</button><button data-rg="quit" style="margin-left:auto">' + L('Abandonner la partie', 'Abandon the run') + '</button></div></div>' + (run.showDeck ? deckView(run) : ''));
  }
  const rareRefs = run => Object.keys(run.deck.cards).filter(r => P().DB[r] && P().DB[r].y === 'R');
  function deckView(run, act, only) {
    const DB = P().DB, refs = sorted(run.deck.cards).filter(r => !only || only(r));
    return '<div class="rggrid">' + refs.map(r => '<div class="rgitem"' + (act ? ' data-rg="' + act + '" data-r="' + r + '" style="cursor:pointer"' : '') + '>' + img(r) + '<span class="rgq">×' + run.deck.cards[r] + '</span>' + (DB[r].u ? '<span class="rgalt">✦ ' + esc(altLabel(DB[r])) + '</span>' : '') + '</div>').join('') + '</div>';
  }
  function choose() {
    show('<div class="rgbox"><p>' + L('Choisis ta faction. Tu pars avec son deck de départ, tu affrontes 8 adversaires de plus en plus forts et tu améliores ton deck entre chaque combat. Trois défaites et c’est fini.', 'Choose your faction. You start with its starter deck, face 8 increasingly strong opponents and improve your deck between fights. Three losses and it is over.') + '</p><div class="rgfac">' +
      FAC.map(f => '<button data-rg="start" data-f="' + f + '" style="border-color:' + FC[f] + '"><b style="color:' + FC[f] + '">' + FN[f] + '</b>' + (starter(f) ? '<span class="small">' + esc(NM(P().DB[starter(f).hero])) + '</span>' : '') + '</button>').join('') + '</div></div>');
  }
  function start(f) {
    const st = starter(f); if (!st) return;
    const run = { v: 1, f, seed: Math.floor(Math.random() * 1e9), i: 0, lives: LIVES, deck: { hero: st.hero, cards: Object.assign({}, st.cards) }, bench: {}, uq: {}, log: [] };
    save(run); screen();
  }
  function fight() {
    const run = load(); if (!run) return;
    for (const c of Object.values(run.uq)) P().DB[c.r] = c;
    const e = enemyDeck(run, run.i);
    const me = deckObj(run, run.deck, L('Mon deck', 'My deck')), foe = deckObj(run, e.d, e.boss ? 'Boss' : FN[e.f]);
    save(run);
    const who = (e.boss ? '👑 ' + L('Boss', 'Boss') + ' ' : '') + FN[e.f];
    $('rogue').classList.add('hidden');
    P().start(me, foe, L('Toi', 'You'), who, won => after(won));
  }
  function after(won) {
    const run = load(); if (!run) return home();
    run.log.push({ i: run.i, won });
    if (won) { if (run.i === FIGHTS - 1) { run.over = 'win'; } else { run.i++; run.reward = { step: 'draft', cards: draftOffer(run) }; } }
    else { run.lives--; if (run.lives <= 0) run.over = 'lose'; }
    save(run); screen();
  }
  function reward(run) {
    const rw = run.reward, top = '<div class="rgtop"><b>' + L('Victoire !', 'Victory!') + '</b><span style="margin-left:auto;font-size:20px;color:#e0546a">' + hearts(run.lives) + '</span></div>' + track(run);
    if (rw.step === 'draft') {
      show('<div class="rgbox">' + top + '<p><b>1/2</b> · ' + L('Choisis une carte à ajouter à ton deck (pas de limite d’exemplaires) :', 'Choose a card to add to your deck (no copy limit):') + '</p><div class="rgoffers">' +
        rw.cards.map((r, k) => '<button class="rgoffer" data-rg="draft" data-k="' + k + '">' + img(r) + '</button>').join('') + '</div><div class="row" style="margin-top:10px"><button data-rg="draftskip">' + L('Ne rien prendre', 'Take nothing') + '</button></div></div>');
    } else if (rw.step === 'boon') {
      const ups = rw.ups || [];
      show('<div class="rgbox">' + top + '<p><b>2/2</b> · ' + L('Améliore une carte en rare…', 'Upgrade a card to rare…') + '</p>' + (ups.length ? '<div class="rgoffers">' + ups.map((o, k) => '<button class="rgoffer" data-rg="up" data-k="' + k + '"><div class="rgpair">' + img(o.ref, 'sm') + '<span class="rgarr">→</span>' + img(o.to, 'sm') + '</div></button>').join('') + '</div>' : '<p class="note">' + L('Aucune commune améliorable dans ton deck.', 'No upgradable common in your deck.') + '</p>') +
        '<p style="margin-top:14px">' + L('…ou tente une <b>mutation</b> 🎲 : choisis une <b>rare</b> de ton deck. Une chance sur deux, elle reçoit un bonus garanti (effet, boosts ou coût réduit) ; sinon elle devient une <b>vraie unique</b> tirée au hasard : parfois bien meilleure, parfois pire. C’est le pari !', '…or try a <b>mutation</b> 🎲: pick a <b>rare</b> from your deck. Half the time it gets a guaranteed bonus (effect, boosts or reduced cost); otherwise it becomes a random <b>real unique</b>: sometimes much better, sometimes worse. That’s the gamble!') + '</p><div class="row"><button data-rg="mutpick">🎲 ' + L('Mutation', 'Mutation') + '</button><button data-rg="boonskip">' + L('Passer', 'Skip') + '</button></div>' +
        (rw.picking ? (rareRefs(run).length ? '<p class="note">' + L('Clique la rare à faire muter :', 'Click the rare to mutate:') + '</p>' + deckView(run, 'mut', r => P().DB[r].y === 'R') : '<p class="note">' + L('Il te faut d’abord une rare : améliore une commune, puis fais-la muter à un prochain combat.', 'You need a rare first: upgrade a common, then mutate it after a later fight.') + '</p>') : '') + (rw.busy ? '<p class="note">⏳ ' + L('Mutation en cours…', 'Mutating…') + '</p>' : '') + (rw.result ? '<div class="rgbox" style="text-align:center"><p><b>' + L('Résultat :', 'Result:') + '</b></p>' + (rw.from ? '<div class="rgpair">' + img(rw.from, 'sm') + '<span class="rgarr">→</span>' + img(rw.result) + '</div>' : img(rw.result)) + '<p class="rgalt" style="display:inline-block;margin-top:6px">✦ ' + esc(altLabel(P().DB[rw.result])) + '</p><div class="row" style="justify-content:center;margin-top:8px"><button class="pri" data-rg="boonok">' + L('Continuer', 'Continue') + '</button></div></div>' : '') + '</div>');
    }
  }
  // Organiser son deck : retirer des cartes vers la réserve d'aventure (banc) ou les remettre, minimum 39 cartes
  function organize(run) {
    show('<div class="rgbox"><div class="rgtop"><b>🃏 ' + L('Organiser mon deck', 'Organise my deck') + '</b><span style="margin-left:auto">' + deckCount(run.deck) + ' / ' + MINDECK + '+</span></div><p class="note">' + L('Clique une carte du deck pour la mettre de côté, ou une carte de côté pour la remettre. Il faut au moins 39 cartes pour combattre ; pas de limite d’exemplaires.', 'Click a deck card to set it aside, or a set-aside card to put it back. You need at least 39 cards to fight; no copy limit.') + '</p>' +
      '<h3>' + L('Deck', 'Deck') + '</h3>' + deckView(run, 'out') + '<h3 style="margin-top:14px">' + L('De côté', 'Set aside') + ' (' + Object.values(run.bench || {}).reduce((a, b) => a + b, 0) + ')</h3>' + benchView(run) + '<div class="row" style="margin-top:12px"><button class="pri" data-rg="orgdone">' + L('Terminé', 'Done') + '</button></div></div>');
  }
  function sorted(m) { const DB = P().DB; return Object.keys(m).filter(r => DB[r]).sort((a, b) => num(DB[a].c) - num(DB[b].c) || NM(DB[a]).localeCompare(NM(DB[b]))); }
  function benchView(run) { const b = run.bench || {}, DB = P().DB, refs = sorted(b); return refs.length ? '<div class="rggrid">' + refs.map(r => '<div class="rgitem" data-rg="in" data-r="' + r + '" style="cursor:pointer">' + img(r) + '<span class="rgq">×' + b[r] + '</span>' + (DB[r].u ? '<span class="rgalt">✦ ' + esc(altLabel(DB[r])) + '</span>' : '') + '</div>').join('') + '</div>' : '<p class="note">—</p>'; }
  function end(run) {
    const won = run.over === 'win', wins = run.log.filter(x => x.won).length;
    show('<div class="rgbox" style="text-align:center"><h2>' + (won ? '🏆 ' + L('Aventure réussie !', 'Adventure complete!') : '💀 ' + L('Aventure terminée', 'Adventure over')) + '</h2><p>' + L('Combats gagnés : ', 'Fights won: ') + wins + ' / ' + FIGHTS + '</p>' + track(run) + '<div class="row" style="justify-content:center;gap:8px"><button class="pri" data-rg="new">' + L('Nouvelle aventure', 'New adventure') + '</button><button data-rg="deck2">🃏 ' + L('Voir mon deck final', 'See my final deck') + '</button></div>' + (run.showDeck ? deckView(run) : '') + '</div>');
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rg]'); if (!b) return; const k = b.dataset.rg; let run = load();
    if (k === 'open') return screen();
    if (k === 'home') return home();
    if (k === 'start') return start(b.dataset.f);
    if (k === 'fight') return fight();
    if (k === 'deck' || k === 'deck2') { run.showDeck = !run.showDeck; save(run); return screen(); }
    if (k === 'quit') { if (confirm(L('Abandonner cette aventure ?', 'Abandon this adventure?'))) { localStorage.removeItem(KEY); screen(); } return; }
    if (k === 'new') { localStorage.removeItem(KEY); return screen(); }
    if (k === 'draft') { addCard(run.deck, run.reward.cards[+b.dataset.k]); run.reward = { step: 'boon', ups: upOffer(run) }; save(run); return screen(); }
    if (k === 'draftskip') { run.reward = { step: 'boon', ups: upOffer(run) }; save(run); return screen(); }
    if (k === 'up') { const o = run.reward.ups[+b.dataset.k]; delCard(run.deck, o.ref); addCard(run.deck, o.to); run.reward = null; save(run); return screen(); }
    if (k === 'boonskip' || k === 'boonok') { run.reward = null; save(run); return screen(); }
    if (k === 'mutpick') { run.reward.picking = !run.reward.picking; save(run); return screen(); }
    if (k === 'mut') { if (run.reward.busy || run.reward.result) return; const r = b.dataset.r; run.reward.busy = true; run.reward.picking = false; save(run); screen();
      mutate(run, r).then(nr => { const rr = load(); if (!rr || !rr.reward) return; rr.uq = run.uq; rr.uqSeq = run.uqSeq; rr.reward.busy = false; if (nr) { delCard(rr.deck, r); addCard(rr.deck, nr); rr.reward.result = nr; rr.reward.from = r; } save(rr); screen(); }); return; }
    if (k === 'org') { run.org = true; save(run); return screen(); }
    if (k === 'orgdone') { run.org = false; save(run); return screen(); }
    if (k === 'out') { delCard(run.deck, b.dataset.r); run.bench = run.bench || {}; addCard({ cards: run.bench }, b.dataset.r); save(run); return screen(); }
    if (k === 'in') { delCard({ cards: run.bench }, b.dataset.r); addCard(run.deck, b.dataset.r); save(run); return screen(); }
  });
  window.AltRogue = { screen, _enemyDeck: enemyDeck, _after: after };
})();
