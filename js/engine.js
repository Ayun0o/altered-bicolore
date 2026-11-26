// Moteur de règles Altered (sans DOM). Toutes les fonctions prennent l'état et le modifient.
// L'hôte est l'autorité : il applique les actions des deux joueurs et diffuse l'état.
(function (root) {
  'use strict';
  const TERR = ['F', 'M', 'W'];
  const LAST = 7; // 8 régions : 0 = région Héros, 7 = région Compagnon

  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const num = v => parseInt(String(v ?? '').replace(/#/g, ''), 10) || 0;

  // Capacités lues dans le texte anglais de la carte
  function kw(card) {
    const raw = ((card && card.xe) || '').replace(/\u00a0/g, ' ').trim();
    const pr = w => new RegExp('^#?\\[+' + w + '\\]+', 'i').test(raw);
    const t = (raw + ' ' + ((card && card.ee) || '')).toLowerCase();
    return {
      fleeting: pr('Fleeting'), cooldown: pr('Cooldown'), defender: pr('Defender'), eternal: pr('Eternal'),
      gigantic: pr('Gigantic'), seasoned: pr('Seasoned'),
      noon: /at noon/.test(t), dusk: /at dusk/.test(t), night: /at night/.test(t)
    };
  }

  function newGame(opts) {
    const rnd = opts.rnd || Math.random;
    const tum = shuffle([[['F'], ['M', 'W']], [['M'], ['F', 'W']], [['W'], ['F', 'M']]], rnd).map(p => rnd() < 0.5 ? p : p.slice().reverse());
    const adv = [{ terr: TERR.slice(), up: true, kind: 'H' }];
    tum.forEach((p, i) => { adv.push({ terr: p[0].slice(), up: false, kind: 'T', card: i }); adv.push({ terr: p[1].slice(), up: false, kind: 'T', card: i }); });
    adv.push({ terr: TERR.slice(), up: true, kind: 'C' });
    const s = { v: 1, day: 1, phase: 'SETUP', step: 'SETUP_MANA', first: rnd() < 0.5 ? 0 : 1, turn: null, passed: [false, false],
      ready: [false, false], adv, cards: {}, nid: 1, players: [], log: [], winner: null, tie: false, pending: null, choices: [], noonDay: 0 };
    s.turn = s.first;
    return s;
  }

  function addPlayer(s, idx, name, deck, db, rnd) {
    rnd = rnd || Math.random;
    const P = { name: name || ('Joueur ' + (idx + 1)), hero: null, deck: [], hand: [], reserve: [], lm: [], discard: [], mana: [], exp: { H: [], C: [] }, pos: { H: 0, C: LAST }, rl: 2, ll: 2 };
    const h = db[deck.hero];
    if (h) { P.hero = mk(s, deck.hero, idx); P.rl = h.rl ?? 2; P.ll = h.ll ?? 2; }
    for (const [ref, n] of Object.entries(deck.cards || {})) for (let i = 0; i < n; i++) if (db[ref]) P.deck.push(mk(s, ref, idx));
    shuffle(P.deck, rnd);
    s.players[idx] = P;
    for (let i = 0; i < 6; i++) draw(s, idx);
    log(s, P.name + ' rejoint la partie (' + P.deck.length + ' cartes en deck).');
  }

  function mk(s, ref, owner) { const id = 'c' + (s.nid++); s.cards[id] = { id, ref, owner, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false }; return id; }
  function log(s, m) { s.log.push({ d: s.day, m }); if (s.log.length > 300) s.log.splice(0, s.log.length - 300); }

  function draw(s, p) {
    const P = s.players[p];
    if (!P.deck.length && P.discard.length) { P.deck = P.discard.splice(0); shuffle(P.deck, Math.random); log(s, P.name + ' remélange sa défausse dans son deck.'); }
    const id = P.deck.shift(); if (id) P.hand.push(id); return id;
  }

  // Trouve la zone qui contient une carte
  function where(s, id) {
    for (let p = 0; p < s.players.length; p++) {
      const P = s.players[p]; if (!P) continue;
      for (const z of ['deck', 'hand', 'reserve', 'lm', 'discard']) { const i = P[z].indexOf(id); if (i >= 0) return { p, z, i }; }
      for (const e of ['H', 'C']) { const i = P.exp[e].indexOf(id); if (i >= 0) return { p, z: 'exp', e, i }; }
      const mi = P.mana.findIndex(m => m.id === id); if (mi >= 0) return { p, z: 'mana', i: mi };
      if (P.hero === id) return { p, z: 'hero' };
    }
    return null;
  }
  function detach(s, id) {
    const w = where(s, id); if (!w || w.z === 'hero') return w;
    const P = s.players[w.p];
    if (w.z === 'exp') P.exp[w.e].splice(w.i, 1); else if (w.z === 'mana') P.mana.splice(w.i, 1); else P[w.z].splice(w.i, 1);
    return w;
  }
  // Déplace une carte vers une zone de son propriétaire
  function moveTo(s, id, z, e, top) {
    const c = s.cards[id]; const from = detach(s, id); if (!c || !from || from.z === 'hero') return;
    const P = s.players[c.owner];
    if (from.z === 'exp' && z !== 'exp' && !c.tok) ev(s, { k: 'leave', p: c.owner, id, e: from.e, to: z, fl: !!c.fleeting, b: c.boost });
    if (from.z === 'hand' && z === 'reserve') ev(s, { k: 'handRes', p: c.owner, id });
    if (c.tok && z !== 'exp') { delete s.cards[id]; return; }
    if (from.z === 'exp' && z !== 'exp') { c.boost = 0; c.anchored = false; c.asleep = false; }
    if (z === 'discard' || z === 'hand' || z === 'deck') { c.boost = 0; c.fleeting = false; c.ex = false; c.anchored = false; c.asleep = false; }
    if (z === 'exp') P.exp[e === 'C' ? 'C' : 'H'].push(id);
    else if (z === 'mana') { c.boost = 0; c.fleeting = false; P.mana.push({ id, ex: false }); }
    else if (z === 'deck') { if (top) P.deck.unshift(id); else P.deck.push(id); }
    else P[z].push(id);
  }

  function readyMana(P) { return P.mana.filter(m => !m.ex).length; }
  function payMana(P, n) { let k = 0; for (const m of P.mana) { if (k >= n) break; if (!m.ex) { m.ex = true; k++; } } return k; }

  function totals(s, p, e, db) {
    const P = s.players[p]; const t = { F: 0, M: 0, W: 0 };
    const ids = P.exp[e].slice();
    const other = e === 'H' ? 'C' : 'H';
    for (const id of P.exp[other]) { const c = s.cards[id]; if (c && kw(db[c.ref]).gigantic && !ids.includes(id)) ids.push(id); }
    for (const id of ids) {
      const c = s.cards[id]; if (!c || c.asleep) continue; const pw = c.tok ? c.tok.p : (db[c.ref] && db[c.ref].p); if (!pw) continue;
      t.F += num(pw[0]) + c.boost; t.M += num(pw[1]) + c.boost; t.W += num(pw[2]) + c.boost;
    }
    return t;
  }
  function hasDefender(s, p, e, db) { return s.players[p].exp[e].some(id => !s.cards[id].asleep && kw(db[s.cards[id].ref]).defender); }
  function distance(P) { return P.pos.H + (LAST - P.pos.C); }

  function triggerPresent(s, db, key) {
    for (const P of s.players) {
      const ids = [P.hero, ...P.lm, ...P.exp.H, ...P.exp.C, ...P.reserve];
      if (ids.some(id => id && s.cards[id] && kw(db[s.cards[id].ref])[key])) return true;
    }
    return false;
  }



  // ---------- Conditions (« si… », « sauf si… », « par… ») ----------
  const NW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const nw = x => NW[x] ?? (+x || 0);
  const SING = w => w.replace(/ies$/, 'y').replace(/s$/, '');
  function subtypesOf(s, id, db) { const c = s.cards[id]; if (!c) return []; if (c.tok) return [String(c.tok.type || '').toLowerCase(), 'token']; const d = db[c.ref] || {}; return (d.ste || []).map(x => x.toLowerCase()); }
  function typeOf(s, id, db) { const c = s.cards[id]; if (!c) return ''; if (c.tok) return c.tok.lm ? 'LANDMARK_PERMANENT' : 'CHARACTER'; return (db[c.ref] || {}).t || ''; }
  function controlled(s, p, noun, db, self) {
    const P = s.players[p]; const ids = [...P.exp.H, ...P.exp.C, ...P.lm];
    const n = SING(noun.toLowerCase().trim());
    return ids.filter(id => {
      if (n === 'landmark') return P.lm.includes(id);
      if (n === 'character') return /CHARACTER/.test(typeOf(s, id, db));
      if (n === 'permanent') return /PERMANENT/.test(typeOf(s, id, db));
      if (n === 'token') return !!s.cards[id].tok;
      if (n === 'completed feat' || n === '[[completed]] feat') return subtypesOf(s, id, db).includes('feat') && !!s.cards[id].completed;
      if (n === 'boosted character') return /CHARACTER/.test(typeOf(s, id, db)) && s.cards[id].boost > 0;
      if (n === 'fleeting character') return /CHARACTER/.test(typeOf(s, id, db)) && s.cards[id].fleeting;
      return subtypesOf(s, id, db).includes(n);
    }).filter(id => id !== self || !/^another /.test(noun));
  }
  const TER = { '{v}': 'F', '{m}': 'M', '{o}': 'W' };
  function regionOf(s, p, e) { return s.adv[s.players[p].pos[e]]; }
  function evalCond(s, p, self, c, db, ctx) {
    c = c.trim(); let m;
    const P = s.players[p], O = s.players[1 - p];
    const e = expOf(s, self) || ctx.e;
    if ((m = c.match(/^you control (a|an|one|two|three|four|five|\d+)(?: or more)? (another |other )?(.+)$/))) { const n = nw(m[1]); return controlled(s, p, (m[2] ? 'another ' : '') + m[3], db, self).filter(id => !m[2] || id !== self).length >= n; }
    if ((m = c.match(/^you don't control (?:a|an|any) (.+)$/))) return controlled(s, p, m[1], db, self).length === 0;
    if (/^your opponent is first player$/.test(c)) return s.first !== p;
    if (/^(?:one or more|at least one) of your expeditions (?:is|are) ascended$/.test(c)) return !!(P.asc && (P.asc.H || P.asc.C));
    if (/^(?:one or more of your expeditions (?:is|are)|any of your expeditions is) \[in contact\]$/.test(c)) return P.pos.H === O.pos.H || P.pos.C === O.pos.C;
    if (/^there's an exhausted card in your reserve$/.test(c)) return P.reserve.some(id => s.cards[id].ex);
    if ((m = c.match(/^there are (\w+) or more exhausted cards in reserve$/))) return s.players.reduce((a, X) => a + X.reserve.filter(id => s.cards[id].ex).length, 0) >= nw(m[1]);
    if (/^you control an exhausted permanent$/.test(c)) return [...P.exp.H, ...P.exp.C, ...P.lm].some(id => /PERMANENT/.test(typeOf(s, id, db)) && s.cards[id].ex);
    if (/^there are no tokens in your landmarks$/.test(c)) return !P.lm.some(id => s.cards[id].tok);
    if (/^there are no other cards in your hand$/.test(c)) return P.hand.filter(id => id !== self).length === 0;
    if (/^it's \[\[completed\]\]$/.test(c)) return controlled(s, p, 'completed feat', db, self).length > 0;
    if ((m = c.match(/^(\w+) cards or more are in your landmarks$/))) return P.lm.length >= nw(m[1]);
    if ((m = c.match(/^there are (\w+) or more mana orbs in your mana zone$/))) return P.mana.length >= nw(m[1]);
    if ((m = c.match(/^the total hand cost of cards in your landmarks is \{(\d+)\} or more$/))) return P.lm.reduce((a, id) => a + (s.cards[id].tok ? 0 : num((db[s.cards[id].ref] || {}).c)), 0) >= +m[1];
    if ((m = c.match(/^you control (\w+) or more \[\[fleeting\]\] characters$/))) return controlled(s, p, 'fleeting character', db, self).length >= nw(m[1]);
    if ((m = c.match(/^i have less than (\w+) boosts?$/))) { const k = s.cards[self]; return !k || k.boost < nw(m[1]); }
    if ((m = c.match(/^neither of my expeditions is in (\{[vmo]\})$/))) return !['H', 'C'].some(x => { const r = regionOf(s, p, x); return r && r.terr.includes(TER[m[1]]); });
    if (/^there's another card in your landmarks$/.test(c)) return P.lm.filter(id => id !== self).length > 0;
    if ((m = c.match(/^there are (\w+) or more cards in your (landmarks|reserve|hand)$/))) return P[{ landmarks: 'lm', reserve: 'reserve', hand: 'hand' }[m[2]]].length >= nw(m[1]);
    if ((m = c.match(/^you have (\w+) or more cards in (?:your )?(reserve|hand|landmarks)$/))) return P[{ landmarks: 'lm', reserve: 'reserve', hand: 'hand' }[m[2]]].length >= nw(m[1]);
    if (/^each of your expeditions is \[in contact\]$/.test(c)) return P.pos.H === O.pos.H && P.pos.C === O.pos.C;
    if (/^at least one of your expeditions is ascended$/.test(c)) return !!(P.asc && (P.asc.H || P.asc.C));
    if (/^both of your expeditions are \[\[ascended\]\]$/.test(c)) return !!(P.asc && P.asc.H && P.asc.C);
    if ((m = c.match(/^(\w+) or more cards are in your (reserve|hand|landmarks)$/))) return P[{ landmarks: 'lm', reserve: 'reserve', hand: 'hand' }[m[2]]].length >= nw(m[1]);
    if (/^you are (?:the )?first player$/.test(c)) return s.first === p;
    if ((m = c.match(/^i'm facing an expedition in (\{[vmo]\})$/))) { if (!e) return false; const r = regionOf(s, 1 - p, e); return !!r && r.terr.includes(TER[m[1]]); }
    if ((m = c.match(/^i'm in (\{[vmo]\})$/))) { if (!e) return false; const r = regionOf(s, p, e); return !!r && r.terr.includes(TER[m[1]]); }
    if ((m = c.match(/^(\w+) or more single-terrain regions are visible$/))) return (s.adv || []).filter(r => r.up && r.terr.length === 1).length >= nw(m[1]);
    if (/^i'm facing a character$/.test(c)) { if (!e) return false; return O.exp[e].some(id => /CHARACTER/.test(typeOf(s, id, db))); }
    if (/^i'm in an ascended expedition$/.test(c)) return !!e && !!(P.asc && P.asc[e]);
    if ((m = c.match(/^an opponent controls (\w+) or more characters$/))) return [...O.exp.H, ...O.exp.C].filter(id => /CHARACTER/.test(typeOf(s, id, db))).length >= nw(m[1]);
    if (/^your hand is empty$/.test(c)) return P.hand.length === 0;
    if (/^there are no other cards in your hand$/.test(c)) return P.hand.filter(id => id !== self).length === 0;
    if (/^you have (?:less|fewer) cards in reserve than target opponent$/.test(c)) return P.reserve.length < O.reserve.length;
    if (/^you have more cards in reserve than target opponent$/.test(c)) return P.reserve.length > O.reserve.length;
    if ((m = c.match(/^(\w+) or more cards are in your discard pile$/))) return P.discard.length >= nw(m[1]);
    if (/^there are no characters in the expedition facing me$/.test(c)) { if (!e) return false; return !O.exp[e].some(id => /CHARACTER/.test(typeOf(s, id, db))); }
    if (/^i'm \[in contact\]$/.test(c)) { if (!e) return false; return P.pos[e] === O.pos[e]; }
    if (/^my expedition is behind$/.test(c)) { if (!e) return false; const d = x => e === 'H' ? x.pos.H : LAST - x.pos.C; return d(P) < d(O); }
    if (/^my expedition is ahead$/.test(c)) { if (!e) return false; const d = x => e === 'H' ? x.pos.H : LAST - x.pos.C; return d(P) > d(O); }
    if ((m = c.match(/^i have (\w+) or more boosts?$/))) { const k = s.cards[self]; return !!k && k.boost >= nw(m[1]); }
    if (/^i'm boosted$/.test(c)) { const k = s.cards[self]; return !!k && k.boost > 0; }
    if (/^i have no boosts?$/.test(c)) { const k = s.cards[self]; return !k || k.boost === 0; }
    if (/^your hand is empty$/.test(c)) return P.hand.length === 0;
    if ((m = c.match(/^(?:there are )?(\w+) or more cards (?:are )?in your discard pile$/))) return P.discard.length >= nw(m[1]);
    if ((m = c.match(/^(?:there are )?(\w+) or more cards (?:are )?in your reserve$/))) return P.reserve.length >= nw(m[1]);
    if ((m = c.match(/^there are (\w+) or more exhausted cards in (?:your )?reserve$/))) return P.reserve.filter(id => s.cards[id].ex).length >= nw(m[1]);
    if ((m = c.match(/^(?:there are )?(\w+) or more mana orbs in your mana zone$/)) || (m = c.match(/^you have (\w+) or more mana orbs$/))) return P.mana.length >= nw(m[1]);
    if (/^there's another character in each of your expeditions$/.test(c)) return ['H', 'C'].every(x => P.exp[x].some(id => id !== self && /CHARACTER/.test(typeOf(s, id, db))));
    if ((m = c.match(/^i'm in (\{[vmo]\})$/))) { if (!e) return false; const r = regionOf(s, p, e); return !!r && r.terr.includes(TER[m[1]]); }
    if (/^your opponent's hand is empty$/.test(c)) return O.hand.length === 0;
    if (/^you have no cards in hand$/.test(c)) return P.hand.length === 0;
    if (/^my expedition is in a region with two or more terrains$/.test(c)) { if (!e) return false; const r = regionOf(s, p, e); return !!r && r.terr.length >= 2; }
    return null; // inconnue
  }
  function countPer(s, p, self, what, db, ctx) {
    const P = s.players[p], O = s.players[1 - p]; const e = expOf(s, self) || ctx.e; let m;
    what = what.trim();
    if (/^character in the expeditions? facing me$/.test(what)) return e ? O.exp[e].filter(id => /CHARACTER/.test(typeOf(s, id, db))).length : 0;
    if (/^mana orb in your mana zone$/.test(what)) return P.mana.length;
    if (/^character target opponent controls$/.test(what)) return [...O.exp.H, ...O.exp.C].filter(id => /CHARACTER/.test(typeOf(s, id, db))).length;
    if (/^other character in my expedition$/.test(what)) return e ? P.exp[e].filter(id => id !== self && /CHARACTER/.test(typeOf(s, id, db))).length : 0;
    if (/^card in your discard pile$/.test(what)) return P.discard.length;
    if (/^card in target opponent's reserve$/.test(what)) return O.reserve.length;
    if (/^card in your hand$/.test(what)) return P.hand.length;
    if (/^card in your reserve$/.test(what)) return P.reserve.length;
    if (/^card in your landmarks$/.test(what)) return P.lm.length;
    if (/^expedition \[in contact\] that you control$/.test(what)) return (P.pos.H === O.pos.H ? 1 : 0) + (P.pos.C === O.pos.C ? 1 : 0);
    if (/^exhausted card in reserve$/.test(what)) return s.players.reduce((a, X) => a + X.reserve.filter(id => s.cards[id].ex).length, 0);
    if ((m = what.match(/^expedition in (\{[vmo]\})$/))) return s.players.reduce((a, X, q) => a + ['H', 'C'].filter(x => { const r = regionOf(s, q, x); return r && r.terr.includes(TER[m[1]]); }).length, 0);
    if ((m = what.match(/^(other )?(.+?) you control$/))) return controlled(s, p, m[2], db, self).filter(id => !m[1] || id !== self).length;
    return null;
  }
  function condKnown(c) { const fake = { players: [{ exp: { H: [], C: [] }, lm: [], hand: [], discard: [], reserve: [], mana: [], deck: [], hero: null, pos: { H: 0, C: 7 } }, { exp: { H: [], C: [] }, lm: [], hand: [], discard: [], reserve: [], mana: [], deck: [], hero: null, pos: { H: 0, C: 7 } }], cards: {}, adv: [] }; try { return evalCond(fake, 0, 'x', c, {}, {}) !== null; } catch (e) { return false; } }
  function perKnown(w) { const fake = { players: [{ exp: { H: [], C: [] }, lm: [], hand: [], discard: [], reserve: [], mana: [], deck: [], hero: null, pos: { H: 0, C: 7 } }, { exp: { H: [], C: [] }, lm: [], hand: [], discard: [], reserve: [], mana: [], deck: [], hero: null, pos: { H: 0, C: 7 } }], cards: {}, adv: [{ terr: [] }, { terr: [] }, { terr: [] }, { terr: [] }, { terr: [] }, { terr: [] }, { terr: [] }, { terr: [] }] }; try { return countPer(fake, 0, 'x', w, {}, {}) !== null; } catch (e) { return false; } }

  // ---------- Effets automatiques ----------
  // Découpe le texte anglais en clauses ; chaque clause a ses déclencheurs ({J} joué, {H} depuis la main, {R} depuis la réserve).
  function clauses(card) {
    const t = ((card && card.xe) || '').replace(/\u00a0/g, ' ').replace(/#/g, '').replace(/\s*\([^)]*\)/g, '');
    const out = [];
    for (const x of t.split(/\s{2,}/).map(x => x.trim()).filter(Boolean)) {
      const L = out[out.length - 1];
      if (L && /on a:$/i.test(L.v) && /^•/.test(x)) { L.v = L.v.replace(/\s*on a:$/i, '') + ' On a ' + x.replace(/^•\s*/, '').replace(/\.$/, '') + '. On a:'; continue; }
      if (L && /on a:$/i.test(L.v)) L.v = L.v.replace(/\s*On a:$/, '');
      out.push({ v: x });
    }
    if (out.length) out[out.length - 1].v = out[out.length - 1].v.replace(/\s*On a:$/, '');
    return out.map(o => o.v.replace(/\.\s*$/, '.').replace(/\s+On a /g, ' On a '));
  }
  const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
  // Traduit une phrase d'effet en action. Renvoie null si on ne sait pas l'automatiser.
  function parseAction(b) {
    b = b.toLowerCase().replace(/\u00a0/g, ' ').replace(/\[\]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim().replace(/\.$/, '');
    if (/^(you may )?activate the \{j\} abilities of target (permanent|character) you control$/.test(b)) return { k: 'choose', kind: /permanent/.test(b) ? 'myperm' : 'mychar', opt: /^you may/.test(b), notSelf: true, act: { k: 'activateJ' }, label: 'Choisis la carte dont les effets {J} se déclenchent à nouveau' };
    if (/^the next character played from your hand this turn activates one of its \{r\} abilities$/.test(b)) return { k: 'nextR' };
    b = b.replace(/^have me (gain|lose)\b/, 'i $1').replace(/^have (another target character|target character)(?: you control)? (gain|lose|switch)\b/, (x, w, v) => w + ' ' + (v === 'switch' ? 'switches' : v + 's'));
    b = b.replace(/^crea una pedina illusione \[(.+?)\] in una spedizione bersaglio$/, 'create a [$1] illusion token in target expedition');
    b = b.replace(/^pesca una carta$/, 'draw a card').replace(/^ottengo (\d+) rinforz[io]$/, 'i gain $1 boosts');
    let m;
    if ((m = b.match(/^(?:you may )?(?:immediately )?pass(?:\. if you (do|don't), (.+))?$/))) { const t = m[2] ? parseBody(m[2]) : []; if (t) { const forced = !/^you may/.test(b); if (forced) return { k: 'forcePass' }; return { k: 'options', n: 1, opts: [{ label: 'Passer (fin de ton après-midi)', acts: [{ k: 'forcePass' }].concat(m[1] === 'do' ? t : []) }, { label: 'Ne pas passer', acts: m[1] === "don't" ? t : [] }] }; } }
    if ((m = b.match(/^target three expeditions and create an? \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) token in each one$/))) { const tok = { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]], type: m[5] }; const all = [[0, 'H'], [0, 'C'], [1, 'H'], [1, 'C']]; const lab = { '0H': 'mon Héros', '0C': 'mon Compagnon', '1H': 'Héros adverse', '1C': 'Compagnon adverse' }; return { k: 'options', n: 1, opts: all.map(([q, e]) => ({ label: 'Partout sauf ' + lab[q + e], acts: all.filter(([q2, e2]) => q2 !== q || e2 !== e).map(([q2, e2]) => ({ k: 'tokenAt', rel: q2, e: e2, tok })) })) }; }
    if ((m = b.match(/^it gains (\d+) boosts?$/))) return { k: 'itBoost', n: +m[1] };
    if ((m = b.match(/^it gains (\d+) boosts? and \[\[(fleeting|anchored|asleep)\]\]$/))) return { k: 'seq', list: [{ k: 'itBoost', n: +m[1] }, { k: 'itFlag', f: m[2] }] };
    if ((m = b.match(/^i gain (\d+) boosts? and \[\[(fleeting|anchored|asleep)\]\]$/))) return { k: 'seq', list: [{ k: 'selfBoostN', n: +m[1] }, { k: 'selfFlag', f: m[2], v: true }] };
    if (/^sacrifice it$/.test(b)) return { k: 'itDiscard' };
    if (/^complete me$/.test(b)) return { k: 'complete' };
    if (/^you win the game$/.test(b)) return { k: 'win' };
    if ((m = b.match(/^(you may )?discard target (character or permanent|character|permanent) with base cost \{(\d+)\} or less$/))) return { k: 'choose', kind: m[2] === 'character' ? 'char' : m[2] === 'permanent' ? 'perm' : 'any', opt: !!m[1], max: +m[3], act: { k: 'discard' }, label: 'Choisis une cible de coût ' + m[3] + ' ou moins à défausser' };
    if ((m = b.match(/^up to one target character (loses|gains) \[\[(fleeting|asleep|anchored)\]\]$/))) return { k: 'choose', kind: 'char', opt: true, act: { k: m[1] === 'loses' ? 'unflag' : 'flag', f: m[2] }, label: 'Choisis jusqu’à un personnage' };
    if ((m = b.match(/^target non-fleeting character gains (\d+) boosts? and \[\[fleeting\]\]$/))) return { k: 'choose', kind: 'char', nonFleet: true, act: { k: 'boost', n: +m[1], then: [{ k: 'itFlag', f: 'fleeting' }] }, label: 'Choisis un personnage non fugace' };
    if (/^return target character to the top of its owner's deck$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'toDeckTop' }, label: 'Choisis un personnage à remettre sur le deck de son propriétaire' };
    if ((m = b.match(/^(you may )?send to reserve up to (two|three) target characters with hand cost \{(\d+)\} or less$/))) return { k: 'seq', list: Array.from({ length: nw(m[2]) }, (x, i) => ({ k: 'choose', kind: 'char', opt: true, max: +m[3], act: { k: 'toReserve' }, label: 'Renvoie en réserve un personnage de coût ≤ ' + m[3] + ' (' + (i + 1) + '/' + nw(m[2]) + ')' })) };
    if (/^target opponent \[exhausted resupplies\]$/.test(b)) return { k: 'oppResupply', ex: true };
    if (/^target opponent \[resupplies\]$/.test(b)) return { k: 'oppResupply' };
    if (/^you may target an opponent, they draw a card$/.test(b)) return { k: 'options', n: 1, opts: [{ label: 'L’adversaire pioche une carte', acts: [{ k: 'oppDraw', n: 1 }] }, { label: 'Non', acts: [] }] };
    if (/^exhaust a permanent you control$/.test(b)) return { k: 'choose', kind: 'myperm', act: { k: 'flag', f: 'ex' }, label: 'Épuise un de tes permanents' };
    if ((m = b.match(/^each ([a-z]+) and ([a-z]+) in your reserve gains (\d+) boosts?$/))) return { k: 'resBoost', subs: [SING(m[1]), SING(m[2])], n: +m[3] };
    if (/^starting with you, each player discards their reserve, then \[resupplies\]$/.test(b)) return { k: 'resetRes' };
    if ((m = b.match(/^you may target (?:a|another) character with base cost \{(\d+)\} or less\. it (switches expeditions|gains \[\[(anchored|asleep|fleeting)\]\])$/))) return { k: 'choose', kind: 'char', opt: true, max: +m[1], act: m[3] ? { k: 'flag', f: m[3] } : { k: 'switch' }, label: 'Choisis un personnage de coût ' + m[1] + ' ou moins' };
    if (/^(you may )?return another target character from your reserve to your hand$/.test(b)) return { k: 'choose', kind: 'myres', tf: 'CHARACTER', notSelf: true, opt: /^you may/.test(b), act: { k: 'toHand' }, label: 'Reprends un autre personnage de ta réserve' };
    if (/^exchange another card from your reserve with a card from your hand$/.test(b)) return { k: 'choose', kind: 'myres', notSelf: true, act: { k: 'toHand', then: [{ k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Choisis la carte de ta main à mettre en réserve' }] }, label: 'Choisis une autre carte de ta réserve à échanger' };
    if ((m = b.match(/^(you may )?give (\d+) boosts? to target character in an ascended expedition$/))) return { k: 'choose', kind: 'char', opt: !!m[1], ascOnly: true, act: { k: 'boost', n: +m[2] }, label: 'Choisis un personnage dans une expédition élevée' };
    if ((m = b.match(/^(you may )?target character with base cost \{(\d+)\} or less (switches expeditions|gains \[\[(anchored|asleep|fleeting)\]\])(?:, then gains \[\[(anchored|asleep|fleeting)\]\])?$/))) { const act = m[4] ? { k: 'flag', f: m[4] } : { k: 'switch' }; if (m[5]) act.then = [{ k: 'itFlag', f: m[5] }]; return { k: 'choose', kind: 'char', opt: !!m[1], max: +m[2], act, label: 'Choisis un personnage de coût ' + m[2] + ' ou moins' }; }
    if (/^target \[\[fleeting\]\] or \[\[boosted\]\] character gains \[\[anchored\]\]$/.test(b)) return { k: 'choose', kind: 'char', fb: true, act: { k: 'flag', f: 'anchored' }, label: 'Choisis un personnage fugace ou boosté qui devient ancré' };
    if (/^discard target non-companion token$/.test(b)) return { k: 'choose', kind: 'char', tokOnly: true, act: { k: 'discard' }, label: 'Choisis un jeton (pas un Compagnon) à défausser' };
    if ((m = b.match(/^target up to two expeditions and create an? \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) token in each of them$/))) { const tok = { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]], type: m[5] }; return { k: 'seq', list: [1, 2].map(i => ({ k: 'choose', kind: 'exp', opt: true, act: { k: 'token', tok }, label: 'Jeton ' + tok.n + ' ' + i + '/2 : quelle expédition ?' })) }; }
    if ((m = b.match(/^create (an?|two) \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) tokens? in (your other expedition|your companion expedition|your hero expedition|each of your expeditions)$/))) { const tok = { n: m[2].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[3], +m[4], +m[5]], type: m[6] }; const n = m[1] === 'two' ? 2 : 1; const where = /other/.test(m[7]) ? 'other' : /companion/.test(m[7]) ? 'C' : /hero/.test(m[7]) ? 'H' : 'both'; return { k: 'seq', list: Array(n).fill({ k: 'token', tok, where }) }; }
    if ((m = b.match(/^the next character you play this turn gains (\d+) boosts? and \[\[(asleep|anchored)\]\]$/))) return { k: 'seq', list: [{ k: 'nextBoost', t: 'character', n: +m[1] }, { k: 'nextFlag', f: m[2], max: null }] };
    if (/^\[resupply\], then \[resupply\] again$/.test(b)) return { k: 'seq', list: [{ k: 'resupply' }, { k: 'resupply' }] };
    if (/^each player \[resupplies\]$/.test(b)) return { k: 'seq', list: [{ k: 'resupply' }, { k: 'oppResupply' }] };
    if (/^target opponent may \[exhausted resupply\]$/.test(b)) return { k: 'oppResupply', ex: true };
    if (/^each player discards their hand, then draws three cards$/.test(b)) return { k: 'wheel', n: 3 };
    if (/^all characters you control switch expeditions$/.test(b)) return { k: 'allSwitch' };
    if ((m = b.match(/^(each other characters? you control gains?|characters you control gain|([a-z]+)s you control gain) (\d+) boosts?$/))) return { k: 'allBoost', n: +m[3], other: /other/.test(m[1]), sub: m[2] && !/^character/.test(m[2]) ? m[2] : null };
    if (/^expeditions can't move forward this day$/.test(b)) return { k: 'noMoveAll' };
    if (/^sacrifice two characters$/.test(b)) return { k: 'seq', list: [1, 2].map(() => ({ k: 'choose', kind: 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes personnages' })) };
    if (/^return target character to its owner's hand$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'toHand' }, label: 'Choisis un personnage à renvoyer dans la main' };
    if (/^return target character or permanent to its owner's hand, then put me in your mana zone$/.test(b)) return { k: 'choose', kind: 'any', act: { k: 'toHand', then: [{ k: 'selfMana' }] }, label: 'Choisis une carte à renvoyer dans la main' };
    if (/^(you may )?put me in my owner's mana zone$/.test(b)) return /^you may/.test(b) ? { k: 'options', n: 1, opts: [{ label: 'Me mettre en mana', acts: [{ k: 'selfMana' }] }, { label: 'Non', acts: [] }] } : { k: 'selfMana' };
    if ((m = b.match(/^(you may )?return an? (spell|character|permanent) from your reserve to your hand$/))) return { k: 'choose', kind: 'myres', tf: m[2].toUpperCase(), opt: !!m[1], act: { k: 'toHand' }, label: 'Reprends un ' + ({ spell: 'sort', character: 'personnage', permanent: 'permanent' })[m[2]] + ' de ta réserve' };
    if (/^discard target exhausted card from a reserve$/.test(b)) return { k: 'choose', kind: 'reserve', exOnly: true, act: { k: 'discard' }, label: 'Choisis une carte épuisée en réserve à défausser' };
    if ((m = b.match(/^another target character in your reserve gains (\d+) boosts?$/))) return { k: 'choose', kind: 'myres', notSelf: true, tf: 'CHARACTER', act: { k: 'boost', n: +m[1] }, label: 'Choisis un autre personnage de ta réserve' };
    if ((m = b.match(/^discard a card from your (reserve|hand)$/))) return { k: 'choose', kind: m[1] === 'hand' ? 'hand' : 'myres', act: { k: 'discard' }, label: 'Défausse une carte de ta ' + (m[1] === 'hand' ? 'main' : 'réserve') };
    if ((m = b.match(/^exhaust a card in your reserve$/))) return { k: 'choose', kind: 'myres', act: { k: 'flag', f: 'ex' }, label: 'Épuise une carte de ta réserve' };
    if ((m = b.match(/^(?:you may )?exhaust target card in reserve$/))) return { k: 'choose', kind: 'reserve', opt: /^you may/.test(b), act: { k: 'flag', f: 'ex' }, label: 'Épuise une carte en réserve' };
    if ((m = b.match(/^put a card from your hand in reserve$/))) return { k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Mets une carte de ta main en réserve' };
    if ((m = b.match(/^pay \{(\d+)\}$/))) return { k: 'payMana', n: +m[1] };
    if (/^exhaust me$/.test(b)) return { k: 'selfFlag', f: 'ex', v: true };
    if ((m = b.match(/^spend (\d+) counters? from a card you control or in your reserve$/))) return { k: 'chooseCtr', n: +m[1] };
    if ((m = b.match(/^you may give (\d+) boosts? to another target character in (\{[vmo]\})$/))) return { k: 'choose', kind: 'char', opt: true, notSelf: true, terr: m[2], act: { k: 'boost', n: +m[1] }, label: 'Choisis un autre personnage dans une région ' + m[2] };
    if ((m = b.match(/^target character gains (\d+) boosts?\. if it is \[\[asleep\]\], it gains \[\[anchored\]\] and loses \[\[asleep\]\]\.*$/))) return { k: 'choose', kind: 'char', act: { k: 'boost', n: +m[1], then: [{ k: 'wake' }] }, label: 'Choisis un personnage qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^up to (two|three) target characters gain (?:(\d+) boosts?|\[\[(fleeting|asleep|anchored)\]\])$/))) return { k: 'seq', list: Array.from({ length: nw(m[1]) }, (x, i) => ({ k: 'choose', kind: 'char', opt: true, act: m[2] ? { k: 'boost', n: +m[2] } : { k: 'flag', f: m[3] }, label: 'Choisis un personnage (' + (i + 1) + '/' + nw(m[1]) + ')' })) };
    if ((m = b.match(/^you may give target character (\d+) boosts?$/))) return { k: 'choose', kind: 'char', opt: true, act: { k: 'boost', n: +m[1] }, label: 'Choisis un personnage qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^target character gains (\d+) boosts? per (.+)$/)) && perKnown(m[2])) return { k: 'choosePer', n: +m[1], per: m[2] };
    if ((m = b.match(/^(you may )?(?:have )?(me|target character) switch expeditions$/))) return m[2] === 'me' ? (m[1] ? { k: 'options', n: 1, opts: [{ label: 'Changer d’expédition', acts: [{ k: 'selfSwitch' }] }, { label: 'Non', acts: [] }] } : { k: 'selfSwitch' }) : { k: 'choose', kind: 'char', opt: !!m[1], act: { k: 'switch' }, label: 'Choisis un personnage qui change d’expédition' };
    if (/^that character switches expeditions$/.test(b)) return { k: 'itSwitch' };
    if (/^my expedition moves backwards one region$/.test(b)) return { k: 'myExpBack' };
    if (/^(both of your expeditions \[ascend\])$/.test(b)) return { k: 'seq', list: [{ k: 'ascend', e: 'H' }, { k: 'ascend', e: 'C' }] };
    if (/^target player becomes first player$/.test(b)) return { k: 'options', n: 1, opts: [{ label: 'Je reste premier joueur', acts: [{ k: 'setFirst', rel: 0 }] }, { label: 'L’adversaire devient premier joueur', acts: [{ k: 'setFirst', rel: 1 }] }] };
    if ((m = b.match(/^create (two|three) \[(aerolith|manaseed)\] tokens in your landmarks$/))) return { k: 'seq', list: Array(nw(m[1])).fill({ k: 'lmToken', n: m[2] === 'aerolith' ? 'Aerolith' : 'Manaseed' }) };
    if (/^discard your hand$/.test(b)) return { k: 'discardHand' };
    if (/^target player puts a card from their hand in reserve$/.test(b)) return { k: 'options', n: 1, opts: [{ label: 'L’adversaire met une carte en réserve', acts: [{ k: 'chooseOpp', kind: 'hand', act: { k: 'toReserve' }, label: 'Mets une carte de ta main en réserve (effet adverse)' }] }, { label: 'Moi', acts: [{ k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Mets une carte de ta main en réserve' }] }] };
    if (/^target character in expedition or in reserve loses all its boosts$/.test(b)) return { k: 'choose', kind: 'charres', act: { k: 'clearBoost' }, label: 'Choisis un personnage qui perd tous ses boosts' };
    if (/^(you may )?return target character( or permanent)? controlled by another player to its owner's hand$/.test(b)) return { k: 'choose', kind: 'oppany', opt: /^you may/.test(b), act: { k: 'toHand' }, label: 'Choisis une carte adverse à renvoyer dans la main' };
    if ((m = b.match(/^(you may )?return target character(?: facing me)? with (hand|base) cost \{(\d+)\} or less to its owner's hand$/))) return { k: 'choose', kind: 'char', opt: !!m[1], max: +m[3], act: { k: 'toHand' }, label: 'Choisis un personnage de coût ' + m[3] + ' ou moins à renvoyer dans la main' };
    if ((m = b.match(/^(you may )?send to reserve target character with base cost \{(\d+)\} or less, then exhaust it$/))) return { k: 'choose', kind: 'char', opt: !!m[1], max: +m[2], act: { k: 'toReserve', then: [{ k: 'itFlagEx' }] }, label: 'Choisis un personnage de coût ' + m[2] + ' ou moins à renvoyer (épuisé) en réserve' };
    if (/^return another character from your reserve to your hand$/.test(b)) return { k: 'choose', kind: 'myres', notSelf: true, act: { k: 'toHand' }, label: 'Reprends un autre personnage de ta réserve en main' };
    if ((m = b.match(/^you may target another character with base cost \{(\d+)\} or less, it gains \[\[(anchored|asleep|fleeting)\]\]$/))) return { k: 'choose', kind: 'char', opt: true, notSelf: true, max: +m[1], act: { k: 'flag', f: m[2] }, label: 'Choisis un autre personnage (coût ≤ ' + m[1] + ')' };
    if ((m = b.match(/^create an? \[(.+?) (\d+)\/(\d+)\/(\d+)\](?: (.+?) token)? in a companion expedition$/))) return { k: 'token', tok: { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]], type: m[5] || '' }, where: 'C' };
    if ((m = b.match(/^you may ready target permanent in play or target card in reserve$/))) return { k: 'choose', kind: 'readyable', opt: true, act: { k: 'flag', f: 'ex', v: false, ready: true }, label: 'Choisis une carte à redresser' };
    if ((m = b.match(/^you may pay \{(\d+)\} to draw a card$/))) return { k: 'options', n: 1, opts: [{ label: 'Payer ' + m[1] + ' pour piocher', acts: [{ k: 'payMana', n: +m[1], then: [{ k: 'draw', n: 1 }] }] }, { label: 'Non', acts: [] }] };
    if ((m = b.match(/^each (other )?character gains \[\[(fleeting|asleep|anchored)\]\]$/))) return { k: 'eachFlag', other: !!m[1], f: m[2] };
    if (/^(you may )?\[augment\] target card in play or in reserve$/.test(b)) return { k: 'choose', kind: 'augm', opt: /^you may/.test(b), act: { k: 'augment' }, label: 'Augmente une carte (+1 de chaque type de compteur)' };
    if (/^\[augment\] any number of target cards in play or in reserve$/.test(b)) return { k: 'seq', list: [1, 2, 3, 4, 5, 6].map(i => ({ k: 'choose', kind: 'augm', opt: true, act: { k: 'augment' }, label: 'Augmente une carte (' + i + ') — « Rien » pour arrêter' })) };
    if ((m = b.match(/^you may target another character, it loses \[\[fleeting\]\] and gains (\d+) boosts?$/))) return { k: 'choose', kind: 'char', opt: true, notSelf: true, act: { k: 'noop', then: [{ k: 'itUnflag', f: 'fleeting' }, { k: 'itBoost', n: +m[1] }] }, label: 'Choisis un autre personnage : il perd fugace et gagne ' + m[1] + ' boost(s)' };
    if (/^exchange target card from your reserve with a card from your hand$/.test(b)) return { k: 'choose', kind: 'myres', act: { k: 'toHand', then: [{ k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Choisis la carte de ta main à mettre en réserve' }] }, label: 'Choisis la carte de ta réserve à échanger' };
    if ((m = b.match(/^send to reserve target character with no statistic over (\d+)$/))) return { k: 'choose', kind: 'char', maxStat: +m[1], act: { k: 'toReserve' }, label: 'Choisis un personnage sans statistique supérieure à ' + m[1] };
    if (/^send to reserve target character with hand cost \{x\} or less, where x is the number of characters you control$/.test(b)) return { k: 'chooseDyn', per: 'character you control', kind: 'char', act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve (coût ≤ nombre de tes personnages)' };
    if ((m = b.match(/^i gain (\d+) boosts? per character target opponent controls$/))) return { k: 'boostPer', n: +m[1], per: 'character target opponent controls' };
    if ((m = b.match(/^remove (up to )?(\d+) counters? from target card in play or in reserve$/))) return { k: 'choose', kind: 'anyres', act: { k: 'rmCtr', n: +m[2] }, label: 'Choisis une carte dont retirer ' + m[2] + ' compteur(s)' };
    if (/^discard all other cards in play and in reserve$/.test(b)) return { k: 'wipe' };
    if ((m = b.match(/^create (two|three) \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) tokens, distributed as you choose among any number of target expeditions$/))) { const tok = { n: m[2].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[3], +m[4], +m[5]], type: m[6] }; const n = nw(m[1]); return { k: 'seq', list: Array.from({ length: n }, (x, i) => ({ k: 'choose', kind: 'exp', act: { k: 'token', tok }, label: 'Jeton ' + tok.n + ' ' + (i + 1) + '/' + n + ' : dans quelle expédition ?' })) }; }
    if ((m = b.match(/^i gain (\d+) boosts? per other character in my expedition, then send them all to reserve$/))) return { k: 'seq', list: [{ k: 'boostPer', n: +m[1], per: 'other character in my expedition' }, { k: 'othersToReserve' }] };
    if (/^you may target an opponent, they draw a card\. if you do, i gain \[\[anchored\]\]$/.test(b)) return { k: 'options', n: 1, opts: [{ label: 'L’adversaire pioche, je deviens ancré', acts: [{ k: 'oppDraw', n: 1 }, { k: 'selfFlag', f: 'anchored', v: true }] }, { label: 'Non', acts: [] }] };
    if ((m = b.match(/^we both gain (\d+) boosts?$/))) return { k: 'seq', list: [{ k: 'itBoost', n: +m[1] }, { k: 'selfBoostN', n: +m[1] }] };
    if ((m = b.match(/^i lose (\d+) boosts?$/))) return { k: 'selfBoostN', n: -m[1] };
    b = b.replace(/, otherwise /, '. otherwise, ').replace(/^you may discard one card/, 'you may discard a card').replace(/^you may give me (\d+) boosts?/, 'you may have me gain $1 boost');
    if ((m = b.match(/^if (.+?), (.+?)(?:\. otherwise, (.+))?$/)) && condKnown(m[1])) { const t = parseBody(m[2]); const o = m[3] ? parseBody(m[3]) : []; if (t && o) return { k: 'if', c: m[1], t, o }; }
    if ((m = b.match(/^unless (.+?), (.+)$/)) && condKnown(m[1])) { const t = parseBody(m[2]); if (t) return { k: 'if', c: m[1], t: [], o: t }; }
    if ((m = b.match(/^(.+?) unless (.+)$/)) && condKnown(m[2])) { const t = parseBody(m[1]); if (t) return { k: 'if', c: m[2], t: [], o: t }; }
    if ((m = b.match(/^i gain (\d+) boosts? per (.+?)(?:, up to a max of (\d+))?$/)) && perKnown(m[2])) return { k: 'boostPer', n: +m[1], per: m[2], max: m[3] ? +m[3] : null };
    if (/^\[resupply\]$/.test(b)) return { k: 'resupply' };
    if ((m = b.match(/^i gain (\w+) ([a-z]+) counters?$/)) && !/boost/.test(m[2])) return { k: 'ctr', n: nw(m[1]), name: m[2] };
    if ((m = b.match(/^i gain (\w+) ([a-z]+) counters? per (.+)$/)) && perKnown(m[3])) return { k: 'ctr', n: nw(m[1]), name: m[2], per: m[3] };
    if (/^(put me in|send me to) reserve$/.test(b)) return { k: 'selfReserve' };
    if (/^sacrifice me$/.test(b)) return { k: 'selfDiscard' };
    if ((m = b.match(/^(?:you may )?discard target (character or permanent|character)(?: in play or in reserve)?$/))) return { k: 'choose', kind: /in play or in reserve/.test(b) ? 'charres' : (m[1] === 'character' ? 'char' : 'any'), opt: /^you may/.test(b), act: { k: 'discard' }, label: 'Choisis une cible à défausser' };
    if (/^discard up to two targets, characters or permanents$/.test(b)) return { k: 'seq', list: [1, 2].map(i => ({ k: 'choose', kind: 'any', opt: true, act: { k: 'discard' }, label: 'Choisis une cible à défausser (' + i + '/2)' })) };
    if ((m = b.match(/^(you may )?send to reserve target character with hand cost \{(\d+)\} or more$/))) return { k: 'choose', kind: 'char', opt: !!m[1], min: +m[2], act: { k: 'toReserve' }, label: 'Choisis un personnage de coût ' + m[2] + ' ou plus à renvoyer en réserve' };
    if ((m = b.match(/^(you may )?discard target permanent with hand cost \{(\d+)\} or more$/))) return { k: 'choose', kind: 'perm', opt: !!m[1], min: +m[2], act: { k: 'discard' }, label: 'Choisis un permanent de coût ' + m[2] + ' ou plus à défausser' };
    if ((m = b.match(/^(another )?target character( in my expedition)? loses \[\[(fleeting|anchored|asleep)\]\]$/))) return { k: 'choose', kind: m[2] ? 'ownchar' : 'char', act: { k: 'unflag', f: m[3] }, label: 'Choisis un personnage qui perd ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[m[3]] };
    if ((m = b.match(/^target character in reserve gains (\d+) boosts?$/))) return { k: 'choose', kind: 'reschar', act: { k: 'boost', n: +m[1] }, label: 'Choisis un personnage en réserve qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^create (two|three|four) \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) tokens in (target expedition|my expedition)$/))) { const tok = { n: m[2].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[3], +m[4], +m[5]], type: m[6] }; const n = nw(m[1]); if (m[7] === 'my expedition') return { k: 'seq', list: Array.from({ length: n }, () => ({ k: 'token', tok, where: 'mine' })) }; return { k: 'choose', kind: 'exp', act: { k: 'token', tok, count: n }, label: 'Dans quelle expédition créer ' + n + ' jetons ' + tok.n + ' ?' }; }
    if ((m = b.match(/^exhaust up to (two|three) (?:target )?cards in reserve$/))) return { k: 'seq', list: Array.from({ length: nw(m[1]) }, (x, i) => ({ k: 'choose', kind: 'reserve', opt: true, act: { k: 'flag', f: 'ex' }, label: 'Choisis une carte en réserve à épuiser (' + (i + 1) + '/' + nw(m[1]) + ')' })) };
    if (/^each player sacrifices a character$/.test(b)) return { k: 'seq', list: [{ k: 'choose', kind: 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes personnages' }, { k: 'chooseOpp', kind: 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes personnages (effet adverse)' }] };
    if (/^target player sacrifices a character$/.test(b)) return { k: 'options', n: 1, opts: [{ label: 'L’adversaire sacrifie un personnage', acts: [{ k: 'chooseOpp', kind: 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes personnages (effet adverse)' }] }, { label: 'Je sacrifie un personnage', acts: [{ k: 'choose', kind: 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes personnages' }] }] };
    if (/^put target character or permanent in its owner's mana zone$/.test(b)) return { k: 'choose', kind: 'any', act: { k: 'toMana' }, label: 'Choisis une carte en jeu à mettre dans le mana de son propriétaire' };
    if (/^send to reserve each character from target expedition, then exhaust them$/.test(b)) return { k: 'choose', kind: 'anyexp', act: { k: 'expToReserve', ex: true }, label: 'Quelle expédition renvoyer en réserve ?' };
    if (/^target expedition can't move forward this day$/.test(b)) return { k: 'choose', kind: 'anyexp', act: { k: 'noMove' }, label: 'Quelle expédition ne pourra pas avancer aujourd’hui ?' };
    if ((m = b.match(/^sacrifice a (permanent|character)$/))) return { k: 'choose', kind: m[1] === 'permanent' ? 'myperm' : 'mychar', act: { k: 'discard', sac: true }, label: 'Sacrifie un de tes ' + (m[1] === 'permanent' ? 'permanents' : 'personnages') };
    if ((m = b.match(/^discard another card from your reserve$/))) return { k: 'choose', kind: 'myres', notSelf: true, act: { k: 'discard' }, label: 'Défausse une autre carte de ta réserve' };
    if ((m = b.match(/^you may spend (\w+) of my boosts to ready (\w+) mana orbs?$/))) return { k: 'choose', kind: 'yesno', act: { k: 'spendBoostMana', n: nw(m[1]), r: nw(m[2]) }, label: 'Dépenser ' + nw(m[1]) + ' boost(s) pour redresser ' + nw(m[2]) + ' mana ?' };
    if (/^ready all cards in your reserve$/.test(b)) return { k: 'readyRes' };
    if ((m = b.match(/^all characters you control gain (\d+) boosts?$/))) return { k: 'allBoost', n: +m[1] };
    if (/^return a card from your reserve to your hand$/.test(b)) return { k: 'choose', kind: 'myres', act: { k: 'toHand' }, label: 'Reprends une carte de ta réserve en main' };
    if ((m = b.match(/^it gains \[\[(anchored|asleep|fleeting)\]\]$/))) return { k: 'itFlag', f: m[1] };
    if (/^exhaust me$/.test(b)) return { k: 'selfFlag', f: 'ex', v: true };
    if (/^\[after you\]$/.test(b)) return { k: 'afterYou' };
    if ((m = b.match(/^create an? \[(aerolith|manaseed)\] token in target player's landmarks$/))) { const n = m[1] === 'aerolith' ? 'Aerolith' : 'Manaseed'; return { k: 'options', n: 1, opts: [{ label: 'Dans tes repères', acts: [{ k: 'lmToken', n }] }, { label: 'Dans les repères adverses', acts: [{ k: 'lmTokenOpp', n }] }] }; }
    if ((m = b.match(/^create an? \[(aerolith|manaseed)\] token in each player's landmarks$/))) { const n = m[1] === 'aerolith' ? 'Aerolith' : 'Manaseed'; return { k: 'seq', list: [{ k: 'lmToken', n }, { k: 'lmTokenOpp', n }] }; }
    if ((m = b.match(/^target character you control(?: with hand cost \{(\d+)\} or less)? gains \[\[?(anchored|asleep|fleeting)\]?\]$/))) return { k: 'choose', kind: 'mychar', max: m[1] ? +m[1] : null, act: { k: 'flag', f: m[2] }, label: 'Choisis un de tes personnages qui devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[m[2]] };
    if ((m = b.match(/^target character you control gains (\d+) boosts?$/))) return { k: 'choose', kind: 'mychar', act: { k: 'boost', n: +m[1] }, label: 'Choisis un de tes personnages qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^distribute (\w+) boosts? among (?:any|up to \w+) target characters?(?: in play or in reserve)?$/))) { const n = nw(m[1]); return { k: 'seq', list: Array.from({ length: n }, (x, i) => ({ k: 'choose', kind: 'charres', act: { k: 'boost', n: 1 }, label: 'Répartis tes boosts : choisis un personnage (' + (i + 1) + '/' + n + ')' })) }; }
    if ((m = b.match(/^target character in play or in reserve gains (\d+) boosts?$/))) return { k: 'choose', kind: 'charres', act: { k: 'boost', n: +m[1] }, label: 'Choisis un personnage (en jeu ou en réserve) qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^each character in target expedition gains (\d+) boosts?$/))) return { k: 'choose', kind: 'exp', act: { k: 'expBoost', n: +m[1] }, label: 'Quelle expédition reçoit ' + m[1] + ' boost(s) par personnage ?' };
    if ((m = b.match(/^each character in my expedition gains (\d+) boosts?$/))) return { k: 'expBoostMine', n: +m[1] };
    if ((m = b.match(/^up to (two|three) target characters each gain (\d+) boosts?$/))) return { k: 'seq', list: Array.from({ length: nw(m[1]) }, (x, i) => ({ k: 'choose', kind: 'char', opt: true, act: { k: 'boost', n: +m[2] }, label: 'Choisis un personnage qui gagne ' + m[2] + ' boost(s) (' + (i + 1) + '/' + nw(m[1]) + ')' })) };
    if (/^(you may )?put a card from your reserve in your mana zone$/.test(b)) return { k: 'choose', kind: 'myres', opt: /^you may/.test(b), act: { k: 'toMana' }, label: 'Choisis une carte de ta réserve à mettre en mana' };
    if ((m = b.match(/^create an? \[(.+?) (\d+)\/(\d+)\/(\d+)\](?: (.+?) token)? in a hero expedition$/))) return { k: 'token', tok: { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]], type: m[5] || '' }, where: 'H' };
    if (/^draw a card, then put a card from your hand in reserve$/.test(b)) return { k: 'seq', list: [{ k: 'draw', n: 1 }, { k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Mets une carte de ta main en réserve' }] };
    if (/^each of your expeditions \[ascends\]$/.test(b)) return { k: 'seq', list: [{ k: 'ascend', e: 'H' }, { k: 'ascend', e: 'C' }] };
    if (/^(you may )?return another card from your reserve to your hand$/.test(b)) return { k: 'choose', kind: 'myres', opt: /^you may/.test(b), notSelf: true, act: { k: 'toHand' }, label: 'Choisis une autre carte de ta réserve à reprendre en main' };
    if (/^discard target \[\[fleeting\]\], \[\[anchored\]\] or \[\[asleep\]\] character$/.test(b)) return { k: 'choose', kind: 'char', status: true, act: { k: 'discard' }, label: 'Choisis un personnage fugace, ancré ou endormi à défausser' };
    if (/^the next spell you play this turn loses \[\[fleeting\]\]$/.test(b)) return { k: 'noFleet' };
    if ((m = b.match(/^the next character(?: with base cost \{(\d+)\} or less)? you play this turn gains \[\[(anchored|asleep)\]\]$/))) return { k: 'nextFlag', f: m[2], max: m[1] ? +m[1] : null };
    if ((m = b.match(/^\[sabotage\] after rest$/))) return { k: 'afterRest', act: { k: 'choose', kind: 'reserve', opt: true, act: { k: 'discard' }, label: 'Sabotage (après le repos) : choisis une carte dans une réserve' } };
    if (/^\[exhausted resupply\]$/.test(b)) return { k: 'resupply', ex: true };
    if ((m = b.match(/^i gain \[\[?(anchored|asleep|fleeting)\]?\]$/))) return { k: 'selfFlag', f: m[1], v: true };
    if ((m = b.match(/^i lose \[\[?(anchored|asleep|fleeting)\]?\]$/))) return { k: 'selfFlag', f: m[1], v: false };
    if ((m = b.match(/^i gain (\d+) boosts?(?:, up to a max of (\d+))?$/))) return { k: 'selfBoost', n: +m[1], max: m[2] ? +m[2] : null };
    if ((m = b.match(/^it gains (\d+) boosts?$/))) return { k: 'itBoost', n: +m[1] };
    if (/^my expedition moves forward one region$/.test(b)) return { k: 'myExpFwd' };
    if ((m = b.match(/^draw (a|an|one|two|three|four|\d+) cards?$/))) return { k: 'draw', n: NUMW[m[1]] || +m[1] };
    if (/^\[sabotage\]$/.test(b)) return { k: 'choose', kind: 'reserve', opt: true, act: { k: 'discard' }, label: 'Sabotage : choisis une carte dans une réserve à défausser' };
    if ((m = b.match(/^target character (?:with hand cost \{(\d+)\} or less )?gains (\d+) boosts?$/))) return { k: 'choose', kind: 'char', max: m[1] ? +m[1] : null, act: { k: 'boost', n: +m[2] }, label: 'Choisis un personnage qui gagne ' + m[2] + ' boost(s)' + (m[1] ? ' (coût de main ' + m[1] + ' ou moins)' : '') };
    if ((m = b.match(/^target character (?:with hand cost \{(\d+)\} or less )?gains \[\[?(anchored|asleep|fleeting)\]?\]$/))) return { k: 'choose', kind: 'char', max: m[1] ? +m[1] : null, act: { k: 'flag', f: m[2] }, label: 'Choisis un personnage qui devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[m[2]] + (m[1] ? ' (coût de main ' + m[1] + ' ou moins)' : '') };
    if ((m = b.match(/^pay \{(\d+)\} less for the next (character|spell|permanent|card) you play this (?:turn|afternoon), down to a minimum of \{(\d+)\}$/))) return { k: 'disc', t: m[2], n: +m[1], min: +m[3] };
    if (/^exhaust target card in reserve$/.test(b)) return { k: 'choose', kind: 'reserve', act: { k: 'flag', f: 'ex' }, label: 'Choisis une carte en réserve à épuiser' };
    if (/^send target character to reserve$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve' };
    if ((m = b.match(/^create (?:a|an) \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) token in (target expedition|my expedition|each of your expeditions)$/))) {
      const tok = { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]], type: m[5] };
      if (m[6] === 'target expedition') return { k: 'choose', kind: 'exp', act: { k: 'token', tok }, label: 'Dans quelle expédition créer le jeton ' + tok.n + ' ?' };
      return { k: 'token', tok, where: m[6] === 'my expedition' ? 'mine' : 'both' };
    }
    if ((m = b.match(/^(you may )?send (?:to reserve )?target character(?: with hand cost \{(\d+)\} or less)?(?: to reserve)?$/))) return { k: 'choose', kind: 'char', opt: !!m[1], max: m[2] ? +m[2] : null, act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve' + (m[2] ? ' (coût de main ' + m[2] + ' ou moins)' : '') };
    if (/^each player draws a card$/.test(b)) return { k: 'drawAll', n: 1 };
    if (/^target opponent draws a card$/.test(b)) return { k: 'drawOpp', n: 1 };
    if (/^put a card from your hand in reserve$/.test(b)) return { k: 'choose', kind: 'hand', act: { k: 'toReserve' }, label: 'Mets une carte de ta main en réserve' };
    if (/^draw a card, then discard a card from your hand$/.test(b)) return { k: 'seq', list: [{ k: 'draw', n: 1 }, { k: 'choose', kind: 'hand', act: { k: 'discard' }, label: 'Défausse une carte de ta main' }] };
    if (/^target opponent discards a card from their hand$/.test(b)) return { k: 'chooseOpp', kind: 'hand', act: { k: 'discard' }, label: 'Défausse une carte de ta main (effet adverse)' };
    if (/^send me to reserve$/.test(b)) return { k: 'selfReserve' };
    if ((m = b.match(/^target character in my expedition gains (\d+) boosts?$/))) return { k: 'choose', kind: 'char', act: { k: 'boost', n: +m[1] }, label: 'Choisis un personnage de cette expédition qui gagne ' + m[1] + ' boost(s)' };
    if ((m = b.match(/^you may have me gain \[\[?(asleep|fleeting|anchored)\]?\]$/))) return { k: 'choose', kind: 'yesno', act: { k: 'selfFlag', f: m[1], v: true }, label: 'Veux-tu que cette carte devienne ' + ({ anchored: 'ancrée', asleep: 'endormie', fleeting: 'fugace' })[m[1]] + ' ?' };
    if (/^each player puts the top card of their deck in their mana zone$/.test(b)) return { k: 'manaAll' };
    if (/^put the top card of your deck in your mana zone$/.test(b)) return { k: 'manaTop' };
    if ((m = b.match(/^the next (card|character|spell|permanent) you play this (?:turn|afternoon) costs \{(\d+)\} less$/))) return { k: 'disc', t: m[1], n: +m[2] };
    if ((m = b.match(/^the next (card|character|spell|permanent) you play this (?:turn|afternoon) gains (\d+) boosts?$/))) return { k: 'nextBoost', t: m[1], n: +m[2] };
    if ((m = b.match(/^(?:you may )?discard target permanent(?: with hand cost \{(\d+)\} or less)?$/))) return { k: 'choose', kind: 'perm', opt: /^you may/.test(b), max: m[1] ? +m[1] : null, act: { k: 'discard' }, label: 'Choisis un permanent à défausser' + (m[1] ? ' (coût de main ' + m[1] + ' ou moins)' : '') };
    if (/^send target character to reserve, then exhaust it$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'toReserve', ex: true }, label: 'Choisis un personnage à renvoyer en réserve (il sera épuisé)' };
    if (/^return target character or permanent to the top of its owner's deck$/.test(b)) return { k: 'choose', kind: 'any', act: { k: 'toDeck' }, label: 'Choisis un personnage ou un permanent à remettre sur le dessus du deck de son propriétaire' };
    if (/^sacrifice a character in my expedition$/.test(b)) return { k: 'choose', kind: 'ownchar', act: { k: 'discard', sac: true }, label: 'Sacrifie un personnage de ton expédition' };
    if (/^your opponent's expedition facing me moves backwards one region$/.test(b)) return { k: 'oppBack' };
    if (/^target expedition \[ascends\]$/.test(b)) return { k: 'choose', kind: 'exp', act: { k: 'ascend' }, label: 'Quelle expédition s’élève (elle avance aussi en cas d’égalité ce soir) ?' };
    if (/^my expedition \[ascends\]$/.test(b)) return { k: 'ascendMine' };
    if ((m = b.match(/^create an? \[(aerolith|manaseed)\] token in your landmarks$/))) return { k: 'lmToken', n: m[1] === 'aerolith' ? 'Aerolith' : 'Manaseed' };
    if (/^(you may )?exhaust target card in reserve$/.test(b)) return { k: 'choose', kind: 'reserve', opt: /^you may/.test(b), act: { k: 'flag', f: 'ex' }, label: 'Choisis une carte en réserve à épuiser' };
    if ((m = b.match(/^you may have target character gain \[\[?(anchored|asleep|fleeting)\]?\]$/))) return { k: 'choose', kind: 'char', opt: true, act: { k: 'flag', f: m[1] }, label: 'Tu peux choisir un personnage qui devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[m[1]] };
    if (/^target expedition moves forward one region$/.test(b)) return { k: 'choose', kind: 'exp', act: { k: 'expFwd' }, label: 'Quelle expédition avance d’une région ?' };
    if (/^target opponent \[resupplies\]$/.test(b)) return { k: 'oppResupply' };
    if (/^discard target character$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'discard' }, label: 'Choisis un personnage à défausser' };
    if ((m = b.match(/^(you may )?send to reserve target character with base cost \{(\d+)\} or less$/))) return { k: 'choose', kind: 'char', opt: !!m[1], max: +m[2], act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve (coût ' + m[2] + ' ou moins)' };
    if (/^target character switches expeditions$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'switch' }, label: 'Choisis un personnage qui change d’expédition' };
    if ((m = b.match(/^return target character or permanent(?: with hand cost \{(\d+)\} or less)? to its owner's hand$/))) return { k: 'choose', kind: 'any', max: m[1] ? +m[1] : null, act: { k: 'toHand' }, label: 'Choisis une carte en jeu à renvoyer dans la main de son propriétaire' + (m[1] ? ' (coût ' + m[1] + ' ou moins)' : '') };
    if ((m = b.match(/^create an? \[(aerolith|manaseed)\] token in target opponent's landmarks$/))) return { k: 'lmTokenOpp', n: m[1] === 'aerolith' ? 'Aerolith' : 'Manaseed' };
    if (/^you may put a card from your hand in reserve$/.test(b)) return { k: 'choose', kind: 'hand', opt: true, act: { k: 'toReserve' }, label: 'Tu peux mettre une carte de ta main en réserve' };
    if (/^you may put a card from your hand in reserve to draw a card$/.test(b)) return { k: 'choose', kind: 'hand', opt: true, act: { k: 'toReserve', then: { k: 'draw', n: 1 } }, label: 'Tu peux mettre une carte de ta main en réserve pour piocher une carte' };
    return null;
  }
  function parseBody(body) {
    const rb = body.toLowerCase().replace(/\u00a0/g, ' ').replace(/\s*\([^)]*\)/g, '').trim();
    let rv = rb.match(/^(?:if i'm \[\[boosted\]\], )?reveal the top card of your deck\.((?:\s*if it's an? [^.]+?, (?:draw it|put it in reserve)\.)+)(?:\s*otherwise, discard it\.?)?$/);
    if (rv) { const rules = []; const re = /if it's an? ([^.]+?), (draw it|put it in reserve)/g; let q; while ((q = re.exec(rv[1]))) rules.push({ t: q[1], d: q[2] === 'draw it' ? 'hand' : 'reserve' }); const act = { k: 'revealTop', rules, other: /otherwise, discard it/.test(rb) ? 'discard' : 'deck' }; if (/^if i'm \[\[boosted\]\]/.test(rb)) return [{ k: 'if', c: "i'm boosted", t: [act], o: [] }]; return [act]; }
    let tm = rb.match(/^(?:you may )?(?:roll a die, then )?target (?:a |another )?character( you control| in reserve| in play or in reserve)?(?:, then roll a die)?\.\s*(on a [^]*)$/);
    if (tm) { const d = parseBody('roll a die. ' + tm[2]); if (d) { const kind = tm[1] === ' you control' ? 'mychar' : tm[1] === ' in reserve' ? 'reschar' : tm[1] ? 'charres' : 'char'; return [{ k: 'choose', kind, notSelf: /another/.test(rb), act: { k: 'noop', then: d }, label: 'Choisis le personnage visé par le dé' }]; } }
    if (/^roll a die\. target character gains x boosts?, where x is the (?:final )?result\.?$/.test(rb)) return [{ k: 'diceX' }];
    if (/^roll a die\./.test(rb)) {
      const outs = []; const re = /on a (\d)(\+|-(\d))?, ([^]*?)(?=\.\s*on a \d|\.?$)/g; let mm;
      while ((mm = re.exec(rb.replace(/^roll a die\.\s*/, '')))) { const lo = +mm[1], hi = mm[2] === '+' ? 6 : mm[3] ? +mm[3] : lo; const acts = parseBody(mm[4]); if (!acts) return null; outs.push({ lo, hi, acts }); }
      if (outs.length) return [{ k: 'dice', outs }];
    }
    if (/^if .+\. otherwise, /i.test(body.trim())) { const one = parseAction(body); if (one) return [one]; }
    const lb = body.replace(/\u00a0/g, ' ').replace(/\s*\([^)]*\)/g, '').trim();
    let my = lb.match(/^you may (.+?)(?:\.\s+if you do,\s+| to )(.+)$/i);
    if (my && !/^(target|choose|send|discard target|return target|have)/i.test(my[1]) || (my && /^have me /i.test(my[1]))) {
      const x = parseBody(my[1].replace(/^have me (gain|lose)/i, 'i $1')), y = parseBody(my[2]);
      if (x && y) {
        let acts;
        if (x.length === 1 && (x[0].k === 'choose' || x[0].k === 'payMana' || x[0].k === 'chooseCtr')) { const f = Object.assign({}, x[0]); if (f.k === 'choose') { f.opt = false; f.act = Object.assign({}, f.act, { then: (f.act.then ? [].concat(f.act.then) : []).concat(y) }); } else f.then = (f.then || []).concat(y); acts = [f]; }
        else if (!x.some(a => a.k === 'choose')) acts = x.concat(y);
        if (acts) return [{ k: 'options', n: 1, opts: [{ label: 'Oui : ' + my[1].slice(0, 48), acts }, { label: 'Non', acts: [] }] }];
      }
    }
    let mi = lb.match(/^(.*?)\.\s+if you do,\s+(.*)$/i);
    if (mi) { const first = parseBody(mi[1]); const rest = parseBody(mi[2]); if (first && rest && first.length === 1) { const f = first[0]; if (f.k === 'choose') { f.act = Object.assign({}, f.act, { then: rest }); f.opt = f.opt; return [f]; } if (f.k === 'yesnoWrap') return [f]; return [f].concat(rest); } }
    const one = parseAction(lb); if (one) return [one];
    const parts = lb.split(/\.\s+|,\s+then\s+/i).map(x => x.trim()).filter(Boolean);
    const acts = parts.map(parseAction);
    return acts.every(Boolean) ? acts : null;
  }
  function expOf(s, id) { const w = where(s, id); return w && w.z === 'exp' ? w.e : null; }
  function doAction(s, p, self, a, db, ctx) {
    ctx = ctx || {};
    const P = s.players[p], c = s.cards[self];
    const nm = () => c ? cname(s, self, db) : '';
    switch (a.k) {
      case 'resupply': { if (!P.deck.length && P.discard.length) { P.deck = P.discard.splice(0); shuffle(P.deck, Math.random); } const id = P.deck.shift(); if (id) { P.reserve.push(id); if (a.ex) s.cards[id].ex = true; log(s, '→ ' + P.name + ' se ravitaille' + (a.ex ? ' (carte épuisée)' : '') + ' : ' + cname(s, id, db) + '.'); } break; }
      case 'selfFlag': if (c && expOf(s, self)) { c[a.f] = a.v; log(s, '→ ' + nm() + (a.v ? ' devient ' : ' perd ') + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[a.f] + '.'); } break;
      case 'selfBoost': { const w = c && where(s, self); if (c && w && (w.z === 'exp' || w.z === 'reserve')) { const before = c.boost; c.boost = a.max != null ? Math.min(a.max, c.boost + a.n) : c.boost + a.n; if (c.boost !== before) log(s, '→ ' + nm() + ' gagne ' + (c.boost - before) + ' boost(s).'); } break; }
      case 'itBoost': { const t = ctx.target && s.cards[ctx.target]; if (t && expOf(s, ctx.target)) { t.boost += a.n; log(s, '→ ' + cname(s, ctx.target, db) + ' gagne ' + a.n + ' boost(s).'); } break; }
      case 'myExpFwd': { const e = ctx.e || expOf(s, self); if (e) { const np = P.pos[e] + (e === 'H' ? 1 : -1); if (np >= 0 && np <= LAST) { const r = s.adv[np]; if (!r.up) s.adv.forEach(x => { if (x.card === r.card) x.up = true; }); P.pos[e] = np; log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' avance.'); } } break; }
      case 'draw': for (let i = 0; i < a.n; i++) draw(s, p); log(s, '→ ' + P.name + ' pioche ' + a.n + ' carte(s).'); break;
      case 'token': {
        let es = a.where === 'both' ? ['H', 'C'] : a.where === 'H' ? ['H'] : a.where === 'C' ? ['C'] : a.where === 'other' ? [(expOf(s, self) || 'C') === 'H' ? 'C' : 'H'] : [a.e || ctx.e || expOf(s, self) || 'H'];
        if (a.count > 1) es = Array(a.count).fill(es[0]);
        for (const e of es) { const id = 't' + (s.nid++); s.cards[id] = { id, ref: '__token', owner: p, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: a.tok.n, p: a.tok.p.slice(), type: a.tok.type || '' } }; P.exp[e].push(id); ev(s, { k: 'join', p, id, e }); }
        log(s, '→ ' + P.name + ' crée ' + (es.length > 1 ? 'des jetons ' : 'un jeton ') + a.tok.n + ' ' + a.tok.p.join('/') + '.'); break;
      }
      case 'choose': { const ch = { p, kind: a.kind, opt: !!a.opt || a.kind === 'yesno', max: a.max ?? null, status: !!a.status, notSelf: !!a.notSelf, min: a.min ?? null, maxStat: a.maxStat ?? null, fb: !!a.fb, nonFleet: !!a.nonFleet, ascOnly: !!a.ascOnly, tokOnly: !!a.tokOnly, exOnly: !!a.exOnly, tf: a.tf || null, terr: a.terr || null, act: a.act, label: a.label, src: self }; if (hasTargets(s, ch, db)) s.choices.push(ch); else log(s, '→ aucune cible possible, effet ignoré.'); break; }
      case 'chooseOpp': { const ch = { p: 1 - p, kind: a.kind, opt: false, act: a.act, label: a.label, src: self }; if (hasTargets(s, ch, db)) s.choices.push(ch); break; }
      case 'seq': a.list.forEach(x => doAction(s, p, self, x, db, ctx)); break;
      case 'ctr': { const k = s.cards[self]; if (k) { const n = a.per ? (countPer(s, p, self, a.per, db, ctx) || 0) * a.n : a.n; k.ctr = k.ctr || {}; const before = k.ctr[a.name] || 0; k.ctr[a.name] = before + n; if (a.name === 'trial' && before < 3 && k.ctr[a.name] >= 3) ev(s, { k: 'trial3', p, id: self }); log(s, '→ ' + nm() + ' gagne ' + n + ' compteur(s) ' + a.name + ' (' + k.ctr[a.name] + ').'); } break; }
      case 'selfDiscard': if (c && where(s, self)) { ev(s, { k: 'sac', p, id: self, fl: !!c.fleeting }); moveTo(s, self, 'discard'); log(s, '→ ' + nm() + ' est sacrifiée.'); } break;
      case 'readyRes': P.reserve.forEach(id => s.cards[id].ex = false); log(s, '→ toutes les cartes de la réserve de ' + P.name + ' se redressent.'); break;
      case 'allBoost': ['H', 'C'].forEach(e => P.exp[e].forEach(id => { if (/CHARACTER/.test(typeOf(s, id, db)) && !(a.other && id === self) && (!a.sub || subtypesOf(s, id, db).includes(a.sub))) s.cards[id].boost += a.n; })); log(s, '→ tous les personnages de ' + P.name + ' gagnent ' + a.n + ' boost(s).'); break;
      case 'itFlag': { const t = ctx.target && s.cards[ctx.target]; if (t) { t[a.f] = true; log(s, '→ ' + cname(s, ctx.target, db) + ' devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[a.f] + '.'); } break; }
      case 'spendBoostMana': { const k = s.cards[self]; if (k && k.boost >= a.n) { k.boost -= a.n; let r = 0; for (const mo of P.mana) { if (r >= a.r) break; if (mo.ex) { mo.ex = false; r++; } } log(s, '→ ' + nm() + ' dépense ' + a.n + ' boost(s) : ' + r + ' mana redressé(s).'); } else log(s, '→ pas assez de boosts.'); break; }
      case 'forcePass': if (s.step === 'AFTERNOON') { ev(s, { k: 'pass', p, first: !s.passed[1 - p] }); s.passed[p] = true; log(s, '→ ' + P.name + ' passe (fin de son après-midi).'); } break;
      case 'tokenAt': { const q = a.rel === 0 ? p : 1 - p, X = s.players[q]; const id = 't' + (s.nid++); s.cards[id] = { id, ref: '__token', owner: q, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: a.tok.n, p: a.tok.p.slice(), type: a.tok.type || '' } }; X.exp[a.e].push(id); ev(s, { k: 'join', p: q, id, e: a.e }); log(s, '→ jeton ' + a.tok.n + ' créé chez ' + X.name + ' (' + (a.e === 'H' ? 'Héros' : 'Compagnon') + ').'); break; }
      case 'itBoost': { const t = ctx.target && s.cards[ctx.target]; if (t) { t.boost = Math.max(0, t.boost + a.n); log(s, '→ ' + cname(s, ctx.target, db) + ' gagne ' + a.n + ' boost(s).'); } break; }
      case 'selfBoostN': if (c && where(s, self)) { c.boost = Math.max(0, c.boost + a.n); log(s, '→ ' + nm() + (a.n >= 0 ? ' gagne ' : ' perd ') + Math.abs(a.n) + ' boost(s).'); } break;
      case 'noop': break;
      case 'complete': if (c && !c.completed) { c.completed = true; log(s, '🏅 ' + nm() + ' est accomplie.'); } break;
      case 'win': s.winner = p; s.phase = 'END'; s.step = 'END'; log(s, '🏆 ' + P.name + ' remporte la partie (effet de ' + nm() + ') !'); break;
      case 'resBoost': P.reserve.forEach(id => { if (subtypesOf(s, id, db).some(x => a.subs.includes(x))) s.cards[id].boost += a.n; }); log(s, '→ des cartes de la réserve de ' + P.name + ' gagnent ' + a.n + ' boost(s).'); break;
      case 'resetRes': for (const q of [p, 1 - p]) { const X = s.players[q]; X.reserve.slice().forEach(id => moveTo(s, id, 'discard')); doAction(s, q, self, { k: 'resupply' }, db, ctx); } break;
      case 'itDiscard': { const t = ctx.target; if (t && where(s, t)) { ev(s, { k: 'sac', p: where(s, t).p, id: t }); moveTo(s, t, 'discard'); log(s, '→ ' + cname(s, t, db) + ' est sacrifiée.'); } break; }
      case 'oppResupply': doAction(s, 1 - p, self, { k: 'resupply', ex: a.ex }, db, ctx); break;
      case 'wheel': for (let q = 0; q < 2; q++) { const X = s.players[q]; X.hand.slice().forEach(id => moveTo(s, id, 'discard')); for (let i = 0; i < a.n; i++) draw(s, q); } log(s, '→ chaque joueur défausse sa main et pioche ' + a.n + ' cartes.'); break;
      case 'allSwitch': { const H = P.exp.H.filter(id => /CHARACTER/.test(typeOf(s, id, db))), Cc = P.exp.C.filter(id => /CHARACTER/.test(typeOf(s, id, db))); P.exp.H = P.exp.H.filter(id => !H.includes(id)).concat(Cc); P.exp.C = P.exp.C.filter(id => !Cc.includes(id)).concat(H); log(s, '→ les personnages de ' + P.name + ' changent d’expédition.'); break; }
      case 'noMoveAll': for (const X of s.players) X.noMove = { H: true, C: true }; log(s, '→ aucune expédition ne peut avancer aujourd’hui.'); break;
      case 'selfMana': if (c && where(s, self)) { moveTo(s, self, 'mana'); log(s, '→ ' + nm() + ' va dans la zone de mana.'); } break;
      case 'wake': { const t = ctx.target && s.cards[ctx.target]; if (t && t.asleep) { t.asleep = false; t.anchored = true; log(s, '→ ' + cname(s, ctx.target, db) + ' se réveille et devient ancré.'); } break; }
      case 'chooseCtr': doAction(s, p, self, { k: 'choose', kind: 'myctr', act: { k: 'rmCtr', n: a.n, then: a.then }, label: 'Choisis la carte (à toi, en jeu ou en réserve) dont dépenser ' + a.n + ' compteur(s)' }, db, ctx); break;
      case 'itFlagEx': { const t = ctx.target && s.cards[ctx.target]; if (t) t.ex = true; break; }
      case 'choosePer': { const n = (countPer(s, p, self, a.per, db, ctx) || 0) * a.n; doAction(s, p, self, { k: 'choose', kind: 'char', act: { k: 'boost', n }, label: 'Choisis un personnage qui gagne ' + n + ' boost(s)' }, db, ctx); break; }
      case 'selfSwitch': { const w = where(s, self); if (w && w.z === 'exp') { const ne = w.e === 'H' ? 'C' : 'H'; P.exp[w.e].splice(P.exp[w.e].indexOf(self), 1); P.exp[ne].push(self); log(s, '→ ' + nm() + ' change d’expédition.'); } break; }
      case 'itSwitch': { const t = ctx.target, w = t && where(s, t); if (w && w.z === 'exp') { const X = s.players[w.p], ne = w.e === 'H' ? 'C' : 'H'; X.exp[w.e].splice(X.exp[w.e].indexOf(t), 1); X.exp[ne].push(t); log(s, '→ ' + cname(s, t, db) + ' change d’expédition.'); } break; }
      case 'myExpBack': { const e = ctx.e || expOf(s, self); if (e) { const np = P.pos[e] + (e === 'H' ? -1 : 1); if (np >= 0 && np <= LAST) { P.pos[e] = np; log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' recule.'); } } break; }
      case 'setFirst': s.first = a.rel === 0 ? p : 1 - p; log(s, '→ ' + s.players[s.first].name + ' est premier joueur.'); break;
      case 'discardHand': P.hand.slice().forEach(id => moveTo(s, id, 'discard')); log(s, '→ ' + P.name + ' défausse sa main.'); break;
      case 'payMana': { const k = payMana(P, a.n); if (k >= a.n) { log(s, '→ ' + P.name + ' paie ' + a.n + '.'); (a.then || []).forEach(x => doAction(s, p, self, x, db, ctx)); } else { P.mana.forEach((m, i) => { if (i < k) m.ex = false; }); log(s, '→ pas assez de mana.'); } break; }
      case 'revealTop': { const id = P.deck[0]; if (!id) break; const d = db[s.cards[id].ref] || {}; const T = (d.t || '').toLowerCase(), subs = subtypesOf(s, id, db);
        const fits = t => t.split(/ or /).some(w => { w = w.trim(); let mm; if ((mm = w.match(/^character with a base statistic of (\d+)$/))) return T === 'character' && (d.p || []).some(x => num(x) === +mm[1]); const sw = SING(w); return T === sw || subs.includes(sw); });
        const r = a.rules.find(x => fits(x.t)); const dest = r ? r.d : a.other;
        log(s, '→ ' + P.name + ' révèle ' + cname(s, id, db) + (dest === 'hand' ? ' et la pioche.' : dest === 'reserve' ? ' et la met en réserve.' : dest === 'discard' ? ' et la défausse.' : ' (elle reste sur le deck).'));
        if (dest !== 'deck') { P.deck.shift(); if (dest === 'hand') P.hand.push(id); else moveTo(s, id, dest); } break; }
      case 'eachFlag': for (const X of s.players) for (const id of [...X.exp.H, ...X.exp.C]) if ((!a.other || id !== self) && /CHARACTER/.test(typeOf(s, id, db))) s.cards[id][a.f] = true; log(s, '→ chaque ' + (a.other ? 'autre ' : '') + 'personnage devient fugace.'); break;
      case 'oppDraw': { const O = s.players[1 - p]; for (let i = 0; i < a.n && O.deck.length; i++) O.hand.push(O.deck.shift()); log(s, '→ ' + O.name + ' pioche ' + a.n + ' carte(s).'); break; }
      case 'itUnflag': { const t = ctx.target && s.cards[ctx.target]; if (t) t[a.f] = false; break; }
      case 'chooseDyn': { const mx = countPer(s, p, self, a.per, db, ctx) || 0; doAction(s, p, self, { k: 'choose', kind: a.kind, max: mx, act: a.act, label: a.label + ' — max ' + mx }, db, ctx); break; }
      case 'wipe': { for (const X of s.players) for (const id of [...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve]) if (id !== self && s.cards[id]) moveTo(s, id, 'discard'); log(s, '→ toutes les autres cartes en jeu et en réserve sont défaussées.'); break; }
      case 'othersToReserve': { const e = expOf(s, self); if (e) P.exp[e].slice().forEach(id => { if (id !== self && /CHARACTER/.test(typeOf(s, id, db))) moveTo(s, id, 'reserve'); }); log(s, '→ les autres personnages de l’expédition retournent en réserve.'); break; }
      case 'nextR': P.nextR = true; log(s, '→ le prochain personnage joué de la main par ' + P.name + ' déclenchera aussi ses effets {R}.'); break;
      case 'diceX': { const r = 1 + Math.floor(Math.random() * 6); log(s, '🎲 ' + P.name + ' lance un dé : ' + r + '.'); doAction(s, p, self, { k: 'choose', kind: 'char', act: { k: 'boost', n: r }, label: 'Choisis le personnage qui gagne ' + r + ' boost(s)' }, db, ctx); break; }
      case 'afterYou': { if (s.step === 'AFTERNOON' && s.turn === p && !s.passed[1 - p]) { s.turn = 1 - p; log(s, '→ « Après vous » : ' + P.name + ' termine son tour sans passer.'); } break; }
      case 'expBoost': case 'expBoostMine': { const e = a.k === 'expBoostMine' ? (expOf(s, self) || ctx.e) : (a.e === 'C' ? 'C' : 'H'); if (e) { const tp = a.k === 'expBoost' && a.opp ? 1 - p : p; s.players[tp].exp[e].forEach(id => { if (/CHARACTER/.test(typeOf(s, id, db))) s.cards[id].boost += a.n; }); log(s, '→ chaque personnage de l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' gagne ' + a.n + ' boost(s).'); } break; }
      case 'noFleet': P.noFleet = true; log(s, '→ le prochain sort de ' + P.name + ' ne sera pas fugace.'); break;
      case 'nextFlag': (P.nf = P.nf || []).push({ f: a.f, max: a.max }); log(s, '→ le prochain personnage de ' + P.name + ' sera ' + (a.f === 'anchored' ? 'ancré' : 'endormi') + '.'); break;
      case 'afterRest': (s.afterRest = s.afterRest || []).push({ p, self, act: a.act }); log(s, '→ effet prévu après le repos de cette nuit.'); break;
      case 'dice': { const r = 1 + Math.floor(Math.random() * 6); log(s, '🎲 ' + P.name + ' lance un dé : ' + r + '.'); const o = a.outs.find(x => r >= x.lo && r <= x.hi); if (o) o.acts.forEach(x => doAction(s, p, self, x, db, ctx)); break; }
      case 'if': { const r = evalCond(s, p, self, a.c, db, ctx); log(s, '→ condition « ' + a.c + ' » : ' + (r ? 'remplie' : 'non remplie') + '.'); (r ? a.t : a.o).forEach(x => doAction(s, p, self, x, db, ctx)); break; }
      case 'boostPer': { const n = (countPer(s, p, self, a.per, db, ctx) || 0) * a.n; const k = s.cards[self]; if (k && n > 0) { const before = k.boost; k.boost = a.max != null ? Math.min(a.max, k.boost + n) : k.boost + n; log(s, '→ ' + nm() + ' gagne ' + (k.boost - before) + ' boost(s).'); } break; }
      case 'oppBack': { const e = expOf(s, self); if (e) { const O = s.players[1 - p]; const np = O.pos[e] - (e === 'H' ? 1 : -1); O.pos[e] = Math.max(0, Math.min(LAST, np)); log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + O.name + ' recule.'); } break; }
      case 'ascendMine': { const e = expOf(s, self); if (e) { (P.asc = P.asc || {})[e] = true; log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' s’élève.'); } break; }
      case 'oppResupply': { const O = s.players[1 - p]; if (!O.deck.length && O.discard.length) { O.deck = O.discard.splice(0); shuffle(O.deck, Math.random); } const id = O.deck.shift(); if (id) { O.reserve.push(id); log(s, '→ ' + O.name + ' se ravitaille : ' + cname(s, id, db) + '.'); } break; }
      case 'lmTokenOpp': { const O = s.players[1 - p]; const id = 't' + (s.nid++); s.cards[id] = { id, ref: '__token', owner: 1 - p, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: a.n, p: null, lm: true } }; O.lm.push(id); log(s, '→ un jeton ' + a.n + ' est créé dans les repères de ' + O.name + '.'); break; }
      case 'expFwd': { const e = a.e === 'C' ? 'C' : 'H'; const np = P.pos[e] + (e === 'H' ? 1 : -1); if (np >= 0 && np <= LAST) { const r = s.adv[np]; if (!r.up) s.adv.forEach(x => { if (x.card === r.card) x.up = true; }); P.pos[e] = np; log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' avance.'); } break; }
      case 'ascend': { const e = a.e === 'C' ? 'C' : 'H'; (P.asc = P.asc || {})[e] = true; log(s, '→ l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' s’élève.'); break; }
      case 'lmToken': { const id = 't' + (s.nid++); s.cards[id] = { id, ref: '__token', owner: p, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: a.n, p: null, lm: true } }; P.lm.push(id); log(s, '→ ' + P.name + ' crée un jeton ' + a.n + ' dans ses repères.'); break; }
      case 'options': s.choices.push({ p, kind: 'option', opt: false, opts: a.opts, left: a.n, label: a.n > 1 ? 'Choisis ' + a.n + ' options (une à la fois)' : 'Choisis une option', src: self }); break;
      case 'drawAll': for (let q = 0; q < 2; q++) draw(s, q); log(s, '→ chaque joueur pioche une carte.'); break;
      case 'drawOpp': draw(s, 1 - p); log(s, '→ ' + s.players[1 - p].name + ' pioche une carte.'); break;
      case 'selfReserve': if (c && where(s, self)) { moveTo(s, self, 'reserve'); log(s, '→ ' + nm() + ' va en réserve.'); } break;
      case 'manaTop': { const id = P.deck.shift(); if (id) { P.mana.push({ id, ex: false }); log(s, '→ ' + P.name + ' met la carte du dessus de son deck en mana.'); } break; }
      case 'manaAll': for (const X of s.players) { const id = X.deck.shift(); if (id) X.mana.push({ id, ex: false }); } log(s, '→ chaque joueur met la carte du dessus de son deck en mana.'); break;
      case 'disc': (P.disc = P.disc || []).push({ t: a.t, n: a.n, min: a.min || 0 }); log(s, '→ la prochaine carte (' + ({ card: 'toute', character: 'personnage', spell: 'sort', permanent: 'permanent' })[a.t] + ') de ' + P.name + ' coûtera ' + a.n + ' de moins.'); break;
      case 'nextBoost': (P.nb = P.nb || []).push({ t: a.t, n: a.n }); log(s, '→ le prochain personnage de ' + P.name + ' gagnera ' + a.n + ' boost(s).'); break;
    }
  }
  function hasTargets(s, ch, db) {
    if (ch.kind === 'exp' || ch.kind === 'yesno' || ch.kind === 'option') return true;
    const isPerm = c => !c.tok && /PERMANENT/.test((db[c.ref] || {}).t || '');
    if (ch.kind === 'perm') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.lm].some(id => { const c = s.cards[id]; return isPerm(c) && (ch.max == null || num(db[c.ref].c) <= ch.max); }));
    if (ch.kind === 'any') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.lm].length);
    if (ch.kind === 'ownchar') { const e = expOf(s, ch.src); return !!e && s.players[ch.p].exp[e].length > 0; }
    if (ch.kind === 'mychar') return ['H', 'C'].some(e => s.players[ch.p].exp[e].some(id => /CHARACTER/.test(typeOf(s, id, db)) && (ch.max == null || s.cards[id].tok || num(db[s.cards[id].ref].c) <= ch.max)));
    if (ch.kind === 'charres') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.reserve].some(id => /CHARACTER/.test(typeOf(s, id, db))));
    if (ch.kind === 'myres') return s.players[ch.p].reserve.some(id => !ch.notSelf || id !== ch.src);
    if (ch.kind === 'augm') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve].some(id => s.cards[id].boost > 0 || (s.cards[id].ctr && Object.values(s.cards[id].ctr).some(v => v > 0))));
    if (ch.kind === 'anyres') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve].some(id => s.cards[id].ctr && Object.values(s.cards[id].ctr).some(v => v > 0)));
    if (ch.kind === 'reschar') return s.players.some(X => X.reserve.some(id => /CHARACTER/.test(typeOf(s, id, db))));
    if (ch.kind === 'myperm') return [...s.players[ch.p].exp.H, ...s.players[ch.p].exp.C, ...s.players[ch.p].lm].some(id => /PERMANENT/.test(typeOf(s, id, db)));
    if (ch.kind === 'anyexp') return true;
    if (ch.kind === 'myctr') { const X = s.players[ch.p]; return [...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve, X.hero].some(id => id && s.cards[id] && s.cards[id].ctr && Object.values(s.cards[id].ctr).some(v => v >= (ch.act.n || 1))); }
    if (ch.kind === 'oppany') return [...s.players[1 - ch.p].exp.H, ...s.players[1 - ch.p].exp.C, ...s.players[1 - ch.p].lm].length > 0;
    if (ch.kind === 'readyable') return s.players.some(X => [...X.exp.H, ...X.exp.C, ...X.lm].some(id => /PERMANENT/.test(typeOf(s, id, db)) && s.cards[id].ex) || X.reserve.some(id => s.cards[id].ex));
    if (ch.kind === 'hand') return s.players[ch.p].hand.length > 0;
    if (ch.kind === 'reserve') return s.players.some(X => X.reserve.length);
    if (ch.kind === 'char') return s.players.some(X => ['H', 'C'].some(e => X.exp[e].some(id => { const c = s.cards[id]; return c.tok || ((db[c.ref] || {}).t === 'CHARACTER' && (ch.max == null || num(db[c.ref].c) <= ch.max)); })));
    return true;
  }
  function applyChoice(s, ch, target, db) {
    const P = s.players[ch.p], a = ch.act;
    if ((target === null || target === undefined) && ch.kind !== 'yesno') { log(s, '→ ' + P.name + ' ne choisit rien.'); return null; }
    if (ch.kind === 'option') {
      const i = +target; const o = ch.opts[i]; if (!o) return 'Option invalide';
      log(s, '→ ' + P.name + ' choisit : ' + o.label);
      const rest = ch.opts.filter((x, k) => k !== i);
      if (ch.left > 1 && rest.length) s.choices.splice(1, 0, { p: ch.p, kind: 'option', opt: false, opts: rest, left: ch.left - 1, label: 'Choisis encore une option', src: ch.src });
      const before = s.choices.length; o.acts.forEach(x => doAction(s, ch.p, ch.src, x, db));
      // les choix créés par l'option passent avant l'option suivante
      if (s.choices.length > before && ch.left > 1 && rest.length) { const added = s.choices.splice(before); s.choices.splice(1, 0, ...added); }
      return null;
    }
    if (ch.kind === 'yesno') { if (target === 'yes') doAction(s, ch.p, ch.src, a, db); else log(s, '→ ' + P.name + ' refuse.'); return null; }
    if (ch.kind === 'anyexp') {
      const mm = String(target).match(/^([01])([HC])$/); if (!mm) return 'Choisis une expédition.';
      const tp = +mm[1], te = mm[2], X = s.players[tp];
      if (a.k === 'expToReserve') { X.exp[te].slice().forEach(id => { if (/CHARACTER/.test(typeOf(s, id, db))) { moveTo(s, id, 'reserve'); if (s.cards[id] && a.ex) s.cards[id].ex = true; } }); log(s, '→ les personnages de l’expédition ' + (te === 'H' ? 'Héros' : 'Compagnon') + ' de ' + X.name + ' retournent en réserve.'); }
      if (a.k === 'noMove') { (X.noMove = X.noMove || {})[te] = true; log(s, '→ l’expédition ' + (te === 'H' ? 'Héros' : 'Compagnon') + ' de ' + X.name + ' ne pourra pas avancer aujourd’hui.'); }
      if (a.k === 'expBoost') { X.exp[te].forEach(id => { if (/CHARACTER/.test(typeOf(s, id, db))) s.cards[id].boost += a.n; }); log(s, '→ chaque personnage de cette expédition gagne ' + a.n + ' boost(s).'); }
      if (a.then) a.then.forEach(x => doAction(s, ch.p, ch.src, x, db));
      return null;
    }
    if (ch.kind === 'exp') { if (target !== 'H' && target !== 'C') return 'Choisis une expédition.'; doAction(s, ch.p, ch.src, Object.assign({}, a, { e: target, where: 'one' }), db); return null; }
    const c = s.cards[target]; const w = c && where(s, target); if (!w) return 'Cible invalide';
    if (ch.kind === 'reserve' && w.z !== 'reserve') return 'Choisis une carte dans une réserve.';
    if (ch.kind === 'char' && !(w.z === 'exp' && (c.tok || (db[c.ref] || {}).t === 'CHARACTER'))) return 'Choisis un personnage en expédition.';
    if (ch.kind === 'myctr' && !(w.p === ch.p && c.ctr && Object.values(c.ctr).some(v => v >= (a.n || 1)))) return 'Choisis une de tes cartes avec assez de compteurs.';
    if (ch.fb && !(c.fleeting || c.boost > 0)) return 'Ce personnage n’est ni fugace ni boosté.';
    if (ch.nonFleet && c.fleeting) return 'Ce personnage est déjà fugace.';
    if (ch.ascOnly && !(w.z === 'exp' && s.players[w.p].asc && s.players[w.p].asc[w.e])) return 'Ce personnage n’est pas dans une expédition élevée.';
    if (ch.tokOnly && !(c.tok && !c.tok.lm)) return 'Choisis un jeton.';
    if (ch.exOnly && !c.ex) return 'Cette carte n’est pas épuisée.';
    if (ch.tf && !c.tok && (db[c.ref] || {}).t !== ch.tf) return 'Type de carte incorrect.';
    if (ch.terr && !(w.z === 'exp' && (regionOf(s, w.p, w.e) || { terr: [] }).terr.includes(TER[ch.terr]))) return 'Ce personnage n’est pas dans le bon terrain.';
    if (ch.kind === 'oppany' && !(w.p !== ch.p && ['exp', 'lm'].includes(w.z))) return 'Choisis une carte adverse en jeu.';
    if (ch.kind === 'readyable' && !(w.z === 'reserve' || (['exp', 'lm'].includes(w.z) && /PERMANENT/.test(typeOf(s, target, db))))) return 'Choisis un permanent en jeu ou une carte en réserve.';
    if (ch.kind === 'augm' && !['exp', 'reserve', 'lm'].includes(w.z)) return 'Choisis une carte en jeu ou en réserve.';
    if (ch.kind === 'anyres' && !['exp', 'reserve', 'lm'].includes(w.z)) return 'Choisis une carte en jeu ou en réserve.';
    if (ch.maxStat != null) { const pw = c.tok ? c.tok.p : (db[c.ref] || {}).p || [0, 0, 0]; if (pw.some(x => num(x) + c.boost > ch.maxStat)) return 'Ce personnage a une statistique trop élevée.'; }
    if (ch.status && !(c.fleeting || c.anchored || c.asleep)) return 'Ce personnage n’est ni fugace, ni ancré, ni endormi.';
    if (ch.kind === 'mychar' && !(w.z === 'exp' && w.p === ch.p && /CHARACTER/.test(typeOf(s, target, db)))) return 'Choisis un de tes personnages en expédition.';
    if (ch.kind === 'charres' && !((w.z === 'exp' || w.z === 'reserve') && /CHARACTER/.test(typeOf(s, target, db)))) return 'Choisis un personnage en jeu ou en réserve.';
    if (ch.kind === 'myres' && !(w.z === 'reserve' && w.p === ch.p && (!ch.notSelf || target !== ch.src))) return 'Choisis une carte de ta réserve.';
    if (ch.kind === 'reschar' && !(w.z === 'reserve' && /CHARACTER/.test(typeOf(s, target, db)))) return 'Choisis un personnage en réserve.';
    if (ch.kind === 'myperm' && !(w.p === ch.p && (w.z === 'exp' || w.z === 'lm') && /PERMANENT/.test(typeOf(s, target, db)))) return 'Choisis un de tes permanents.';
    if (ch.min != null && !c.tok && num((db[c.ref] || {}).c) < ch.min) return 'Coût de main trop faible (min ' + ch.min + ').';
    if (ch.kind === 'hand' && !(w.z === 'hand' && w.p === ch.p)) return 'Choisis une carte de ta main.';
    if (ch.kind === 'perm' && !(!c.tok && /PERMANENT/.test((db[c.ref] || {}).t || '') && (w.z === 'exp' || w.z === 'lm'))) return 'Choisis un permanent en jeu.';
    if (ch.kind === 'any' && !(w.z === 'exp' || w.z === 'lm')) return 'Choisis un personnage ou un permanent en jeu.';
    if (ch.kind === 'ownchar') { const e = expOf(s, ch.src); if (!(w.z === 'exp' && w.p === ch.p && w.e === e)) return 'Choisis un personnage de cette expédition.'; }
    if (ch.max !== null && ch.max !== undefined && !c.tok && num((db[c.ref] || {}).c) > ch.max) return 'Coût de main trop élevé (max ' + ch.max + ').';
    const nm = cname(s, target, db);
    if (a.k === 'switch') { const ne = w.e === 'H' ? 'C' : 'H'; s.players[w.p].exp[w.e].splice(w.i, 1); s.players[w.p].exp[ne].push(target); log(s, '→ ' + nm + ' change d’expédition.'); return null; }
    if (a.k === 'toDeckTop') { moveTo(s, target, 'deck', null, true); log(s, '→ ' + nm + ' retourne sur le dessus du deck de son propriétaire.'); return null; }
    if (a.k === 'clearBoost') { c.boost = 0; log(s, '→ ' + nm + ' perd tous ses boosts.'); return null; }
    if (a.k === 'augment') { if (c.boost > 0) c.boost++; if (c.ctr) for (const k of Object.keys(c.ctr)) if (c.ctr[k] > 0) c.ctr[k]++; log(s, '→ ' + nm + ' est augmentée.'); return null; }
    if (a.k === 'rmCtr') { if (c.ctr) { let n = a.n; for (const k of Object.keys(c.ctr)) { const r = Math.min(n, c.ctr[k]); c.ctr[k] -= r; n -= r; } } log(s, '→ compteurs retirés de ' + nm + '.'); if (a.then) a.then.forEach(x => doAction(s, ch.p, ch.src, x, db, { target })); return null; }
    if (a.k === 'activateJ') { const d = db[c.ref]; if (d) { log(s, '→ les effets {J} de ' + nm + ' se déclenchent.'); for (const cl of clauses(d)) { const mm = cl.match(/^((?:\{[jhr]\}\s*)+)(.*)$/i); if (mm && /\{j\}/i.test(mm[1])) { const acts = parseBody(mm[2]); if (acts) acts.forEach(x => doAction(s, ch.p, target, x, db)); else log(s, '  (effet à appliquer à la main : ' + mm[2] + ')'); } } } return null; }
    if (a.k === 'unflag') { c[a.f] = false; log(s, '→ ' + nm + ' perd ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace' })[a.f] + '.'); }
    else if (a.k === 'toMana') { moveTo(s, target, 'mana'); log(s, '→ une carte va dans le mana de son propriétaire.'); }
    else if (false) { }
    if (a.k === 'toHand') { moveTo(s, target, 'hand'); log(s, '→ ' + nm + ' retourne dans la main de son propriétaire.'); return null; }
    if (a.k === 'discard') { if (a.sac) ev(s, { k: 'sac', p: w.p, id: target, fl: !!c.fleeting, perm: /PERMANENT/.test(typeOf(s, target, db)) }); moveTo(s, target, 'discard'); log(s, '→ ' + (ch.kind === 'hand' ? 'une carte de la main de ' + s.players[w.p].name : nm) + ' est défaussée.'); }
    else if (a.k === 'boost') { c.boost += a.n; log(s, '→ ' + nm + ' gagne ' + a.n + ' boost(s).'); }
    else if (a.k === 'flag' && a.ready) { c.ex = false; log(s, '→ ' + nm + ' se redresse.'); }
    else if (a.k === 'flag') { c[a.f] = true; log(s, '→ ' + nm + ' devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace', ex: 'épuisée' })[a.f] + '.'); }
    else if (a.k === 'toDeck') { moveTo(s, target, 'deck', null, true); log(s, '→ ' + nm + ' est remise sur le dessus du deck de son propriétaire.'); }
    else if (a.k === 'toReserve') { if (c.tok) { moveTo(s, target, 'reserve'); log(s, '→ le jeton ' + nm + ' quitte le jeu.'); } else { moveTo(s, target, 'reserve'); if (a.ex && s.cards[target]) s.cards[target].ex = true; log(s, '→ ' + (ch.kind === 'hand' ? 'une carte' : nm) + ' va en réserve' + (a.ex ? ' et est épuisée' : '') + '.'); } if (a.then) (Array.isArray(a.then) ? a.then : [a.then]).forEach(x => doAction(s, ch.p, ch.src, x, db, { target })); }
    if (a.then && a.k !== 'toReserve') a.then.forEach(x => doAction(s, ch.p, ch.src, x, db, { target }));
    return null;
  }
  function cname(s, id, db) { const c = s.cards[id]; return c ? (c.tok ? c.tok.n : ((db[c.ref] || {}).n || '?')) : '?'; }
  // ---------- Capacités déclenchées (« Quand… ») ----------
  function ev(s, e) { (s.ev = s.ev || []).push(e); }
  const TRIG = [
    { k: 'join', re: /^when another character joins your expeditions$/, who: (s, e, P, id, w) => w.p === e.p && id !== e.id },
    { k: 'join', re: /^when another character joins my expedition$/, who: (s, e, P, id, w) => w.p === e.p && w.z === 'exp' && w.e === e.e && id !== e.id },
    { k: 'join', re: /^when a character joins the expedition facing me$/, who: (s, e, P, id, w) => w.p !== e.p && w.z === 'exp' && w.e === e.e },
    { k: 'spell', re: /^when you play a spell$/, who: (s, e, P, id, w) => w.p === e.p },
    { k: 'spell', re: /^when you play another spell$/, who: (s, e, P, id, w) => w.p === e.p && id !== e.id },
    { k: 'char', re: /^when you play another character$/, who: (s, e, P, id, w) => w.p === e.p && id !== e.id },
    { k: 'leave', re: /^when i leave the expedition zone$/, who: (s, e, P, id) => id === e.id },
    { k: 'leave', re: /^when i leave the expedition zone, if i was \[\[fleeting\]\]$/, who: (s, e, P, id) => id === e.id && e.fl },
    { k: 'leave', re: /^when i go to reserve from (the expedition zone|anywhere)$/, who: (s, e, P, id) => id === e.id && e.to === 'reserve' },
    { k: 'handRes', re: /^when i go to reserve from (your hand|anywhere)$/, who: (s, e, P, id) => id === e.id },
    { k: 'sac', re: /^when i'm sacrificed$/, who: (s, e, P, id) => id === e.id },
    { k: 'sac', re: /^when i'm sacrificed, if i was not \[\[fleeting\]\]$/, who: (s, e, P, id) => id === e.id && !e.fl },
    { k: 'sac', re: /^when you sacrifice a permanent$/, who: (s, e, P, id, w) => w.p === e.p && e.perm },
    { k: 'pass', re: /^when you pass$/, who: (s, e, P, id, w) => w.p === e.p },
    { k: 'pass', re: /^when you pass first$/, who: (s, e, P, id, w) => w.p === e.p && e.first },
    { k: 'pass', re: /^when an opponent passes$/, who: (s, e, P, id, w) => w.p !== e.p },
    { k: 'char', re: /^when you play a character$/, who: (s, e, P, id, w) => w.p === e.p && id !== e.id },
    { k: 'char', re: /^when an opponent plays a character$/, who: (s, e, P, id, w) => w.p !== e.p },
    { k: 'char', re: /^when you play another character with a base statistic of (\d+)$/, who: (s, e, P, id, w, db, head) => { const n = +head.match(/(\d+)$/)[1]; const pw = (db[s.cards[e.id].ref] || {}).p || []; return w.p === e.p && id !== e.id && pw.some(x => num(x) === n); } },
    { k: 'spell', re: /^when you play a spell with base cost \{(\d+)\} or more$/, who: (s, e, P, id, w, db, head) => { const n = +head.match(/\{(\d+)\}/)[1]; return w.p === e.p && num((db[s.cards[e.id].ref] || {}).c) >= n; } },
    { k: 'join', re: /^when (?:a|another) character joins my expedition$/, who: (s, e, P, id, w, db, head) => w.p === e.p && w.z === 'exp' && w.e === e.e && id !== e.id },
    { k: 'trial3', re: /^when i gain my third trial counter$/, who: (s, e, P, id) => id === e.id },
    { k: 'fwd', re: /^when my expedition moves forward$/, who: (s, e, P, id, w) => w.p === e.p && w.z === 'exp' && w.e === e.e },
    { k: 'fail', re: /^when my expedition fails to move forward during dusk$/, who: (s, e, P, id, w) => w.p === e.p && w.z === 'exp' && w.e === e.e }
  ];
  function processEvents(s, db) {
    let guard = 0;
    while (s.ev && s.ev.length && guard++ < 60) {
      const e = s.ev.shift();
      const ids = [];
      for (const X of s.players) ids.push(...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve);
      if (['leave', 'sac', 'handRes'].includes(e.k) && !ids.includes(e.id)) ids.push(e.id);
      for (const id of ids) {
        const c = s.cards[id]; if (!c || c.tok) continue;
        const d = db[c.ref]; if (!d) continue;
        const w = where(s, id) || { p: c.owner, z: 'gone' };
        const src = ['leave', 'sac', 'handRes'].includes(e.k) && id === e.id ? (d.xe || '') : (w.z === 'reserve' ? (c.ex ? '' : (d.ee || '')) : (d.xe || ''));
        for (const cl of clauses({ xe: src })) {
          const m = cl.replace(/^\{i\}\s*/i, '').match(/^(when[^—-]+?)\s*[—-]\s*(.*)$/i); if (!m) continue;
          const head = m[1].toLowerCase().trim();
          const t = TRIG.find(x => x.k === e.k && x.re.test(head)); if (!t || !t.who(s, e, s.players[w.p], id, w, db, head)) continue;
          const acts = parseBody(m[2]);
          if (!acts) { log(s, '⚠ ' + cname(s, id, db) + ' : capacité déclenchée à appliquer à la main.'); continue; }
          acts.forEach(a => doAction(s, c.owner, id, a, db, { target: e.id, e: e.e }));
        }
      }
    }
  }

  // Effets à l'arrivée en jeu. Renvoie le nombre de clauses non automatisées.
  const KWONLY = /^\[+[a-z][a-z ]*(?: \d+)?\]+(?:,\s*\[+[a-z][a-z ]*(?: \d+)?\]+)*\.?$/i;
  function optionsFrom(list, frList) {
    const opts = [];
    for (let i = 0; i < list.length; i++) { const acts = parseBody(list[i].replace(/^•\s*/, '')); if (!acts) return null; opts.push({ label: (frList && frList[i] ? frList[i] : list[i]).replace(/^•\s*/, '').replace(/[\[\]#]/g, ''), acts }); }
    return opts;
  }
  function onPlay(s, p, id, fromRes, db) {
    const c = s.cards[id], d = db[c.ref]; let manual = 0, auto = 0;
    const P0 = s.players[p]; const extraR = !fromRes && d.t === 'CHARACTER' && P0.nextR; if (extraR) P0.nextR = false;
    const cls = clauses(d), fr = clauses({ xe: d.x || '' });
    for (let i = 0; i < cls.length; i++) {
      const cl = cls[i];
      if (/^•/.test(cl)) continue;
      const co = cl.match(/^(?:((?:\{[jhr]\}\s*)+))?choose (one|two|up to one):?$/i);
      if (co) {
        const tr = (co[1] || '').toLowerCase();
        const ok = d.t === 'SPELL' ? !tr || tr.includes('{j}') || (tr.includes('{h}') && !fromRes) || (tr.includes('{r}') && fromRes) : tr && (tr.includes('{j}') || (tr.includes('{h}') && !fromRes) || (tr.includes('{r}') && fromRes));
        if (!ok) continue;
        const bl = [], bf = []; let j = i + 1; while (j < cls.length && /^•/.test(cls[j])) { bl.push(cls[j]); bf.push(fr.length === cls.length ? fr[j] : null); j++; }
        const opts = optionsFrom(bl, bf);
        if (!opts) { manual++; continue; }
        if (co[2].toLowerCase() === 'up to one') opts.push({ label: 'Aucune', acts: [] });
        doAction(s, p, id, { k: 'options', opts, n: co[2].toLowerCase() === 'two' ? 2 : 1 }, db); auto++; continue;
      }
      if (d.t === 'SPELL' && !/^\{/.test(cl) && !/^(at noon|at dusk|at night|when|after|each time|whenever|as long as)/i.test(cl)) {
        if (KWONLY.test(cl.replace(/\u00a0/g, ' '))) continue;
        const acts = parseBody(cl); if (!acts) { manual++; continue; }
        acts.forEach(a => doAction(s, p, id, a, db)); auto++; continue;
      }
      const m = cl.match(/^((?:\{[jhr]\}\s*)+)(.*)$/i); if (!m) continue;
      const tr = m[1].toLowerCase();
      const ok = tr.includes('{j}') || (tr.includes('{h}') && !fromRes) || (tr.includes('{r}') && (fromRes || extraR));
      if (!ok) continue;
      const acts = parseBody(m[2]);
      if (!acts) { manual++; continue; }
      acts.forEach(a => doAction(s, p, id, a, db)); auto++;
    }
    return { manual, auto };
  }
  // Effets « À Midi » simples des cartes en jeu. Renvoie true s'il reste des effets à faire à la main.
  // Réductions de coût inscrites sur la carte elle-même (« I cost {N} less if… », « Play me for {N} less per… »)
  function selfDiscount(s, p, id, db, e) {
    const c = s.cards[id], d = db[c.ref]; let red = 0; const P = s.players[p];
    for (const cl of clauses(d)) {
      const l = cl.toLowerCase().replace(/\.$/, ''); let m;
      if (!(m = l.match(/^(?:i cost|play me for) \{(\d+)\} less (.*)$/))) continue;
      const n = +m[1], rest = m[2]; let k;
      if (/^to play in an expedition with no characters$/.test(rest)) { if (!P.exp[e].some(x => /CHARACTER/.test(typeOf(s, x, db)))) red += n; continue; }
      if (/^for each of your ascended expeditions$/.test(rest)) { red += n * ((P.asc && P.asc.H ? 1 : 0) + (P.asc && P.asc.C ? 1 : 0)); continue; }
      if (/^per other card you played this turn$/.test(rest)) { red += n * (P.playedTurn || 0); continue; }
      if ((k = rest.match(/^per (.+)$/))) { const v = countPer(s, p, id, k[1], db, { e }); if (v != null) red += n * v; continue; }
      if ((k = rest.match(/^if (.+)$/))) { try { if (evalCond(s, p, id, k[1], db, { e }) === true) red += n; } catch (x) { } continue; }
    }
    return red;
  }
  function noonAuto(s, db, ph) {
    ph = ph || 'noon'; const PH = { noon: 'Midi', dusk: 'Crépuscule', night: 'Nuit' }[ph]; const RE = new RegExp('^at ' + ph + '\\s*[—-]\\s*(.*)$', 'i');
    let manual = false;
    const order = [s.first, 1 - s.first];
    for (const p of order) {
      const P = s.players[p];
      for (const id of [P.hero, ...P.lm, ...P.exp.H, ...P.exp.C]) {
        const c = id && s.cards[id]; if (!c || c.tok) continue;
        for (const cl of clauses(db[c.ref])) {
          const m = cl.match(RE); if (!m) continue;
          const acts = parseBody(m[1]);
          if (!acts) { manual = true; continue; }
          log(s, PH + ' : effet de ' + cname(s, id, db) + '.'); acts.forEach(a => doAction(s, p, id, a, db));
        }
      }
    }
    return manual;
  }

  // Fait avancer la partie jusqu'à la prochaine décision des joueurs
  function advance(s, db) {
    for (let guard = 0; guard < 40; guard++) {
      if (s.winner !== null) return;
      if (s.choices && s.choices.length) return;
      if (s.players.length < 2 || !s.players[0] || !s.players[1]) return;
      switch (s.step) {
        case 'SETUP_MANA': if (s.ready[0] && s.ready[1]) { s.ready = [false, false]; s.phase = 'NOON'; s.step = 'NOON'; log(s, 'Jour 1 — la première matinée est sautée.'); continue; } return;
        case 'MORNING': {
          s.first = 1 - s.first;
          for (const P of s.players) { P.mana.forEach(m => m.ex = false); [P.hero, ...P.lm, ...P.exp.H, ...P.exp.C, ...P.reserve].forEach(id => { if (id && s.cards[id]) s.cards[id].ex = false; }); }
          for (let p = 0; p < 2; p++) { draw(s, p); draw(s, p); }
          log(s, 'Jour ' + s.day + ' — Matin : ' + s.players[s.first].name + ' devient premier joueur, tout se redresse, chacun pioche 2 cartes.');
          s.step = 'EXPAND'; s.ready = [false, false]; continue;
        }
        case 'EXPAND': if (s.ready[0] && s.ready[1]) { s.ready = [false, false]; s.phase = 'NOON'; s.step = 'NOON'; continue; } return;
        case 'NOON':
          s.phase = 'NOON';
          if (s.noonDay !== s.day) { s.noonDay = s.day; s.noonManual = noonAuto(s, db); if (s.choices.length) return; }
          if (s.noonManual && !(s.ready[0] && s.ready[1])) { if (!s.pending) { s.pending = 'noon'; log(s, 'Midi : appliquez les effets « À Midi », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false]; s.phase = 'AFTERNOON'; s.step = 'AFTERNOON'; s.turn = s.first; s.passed = [false, false]; s.played = 0;
          log(s, 'Après-midi : ' + s.players[s.first].name + ' commence.'); continue;
        case 'AFTERNOON':
          if (s.passed[0] && s.passed[1]) { s.phase = 'DUSK'; s.step = 'DUSK'; continue; }
          if (s.passed[s.turn]) s.turn = 1 - s.turn;
          return;
        case 'DUSK':
          if (s.duskDay !== s.day) { s.duskDay = s.day; s.duskManual = noonAuto(s, db, 'dusk'); if (s.choices.length) return; }
          if (s.duskManual && !(s.ready[0] && s.ready[1])) { if (s.pending !== 'dusk') { s.pending = 'dusk'; log(s, 'Crépuscule : appliquez les effets « Au Crépuscule », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false];
          for (const X of s.players) { X.disc = []; X.nb = []; X.nf = []; X.noFleet = false; X.nextR = false; }
          progress(s, db); s.phase = 'NIGHT'; s.step = 'NIGHT'; continue;
        case 'NIGHT':
          if (s.nightDay !== s.day) { s.nightDay = s.day; s.nightManual = noonAuto(s, db, 'night'); if (s.choices.length) return; }
          if (s.nightManual && !(s.ready[0] && s.ready[1]) && s.pending !== 'night-done') { if (s.pending !== 'night') { s.pending = 'night'; log(s, 'Nuit : appliquez les effets « À la Nuit », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false];
          rest(s, db);
          if (s.afterRest && s.afterRest.length) { const L = s.afterRest; s.afterRest = []; L.forEach(x => doAction(s, x.p, x.self, x.act, db)); }
          s.step = 'CLEANUP'; if (s.choices.length) return; continue;
        case 'CLEANUP': {
          const need = s.players.map(P => P.reserve.length > P.rl || P.lm.length > P.ll);
          for (let p = 0; p < 2; p++) if (!need[p]) s.ready[p] = true;
          if (!(s.ready[0] && s.ready[1])) return;
          s.ready = [false, false];
          checkVictory(s); if (s.winner !== null) return;
          s.day++; s.phase = 'MORNING'; s.step = 'MORNING'; continue;
        }
        default: return;
      }
    }
  }

  function progress(s, db) {
    if (s.tie) { tieDusk(s, db); return; }
    const moves = [];
    for (let p = 0; p < 2; p++) for (const e of ['H', 'C']) {
      const P = s.players[p], O = s.players[1 - p];
      const reg = s.adv[P.pos[e]]; if (!reg) continue;
      const mine = totals(s, p, e, db), theirs = totals(s, 1 - p, e, db);
      const asc = P.asc && P.asc[e];
      const win = reg.terr.filter(t => (mine[t] > theirs[t] || (asc && mine[t] === theirs[t])) && mine[t] > 0);
      const label = (e === 'H' ? 'Héros' : 'Compagnon');
      if (win.length && !hasDefender(s, p, e, db) && !(P.noMove && P.noMove[e])) moves.push([p, e, win]);
      else if (win.length) log(s, P.name + ' (' + label + ') gagnerait, mais un Défenseur bloque l’avancée.');
    }
    for (const [p, e, win] of moves) {
      const P = s.players[p]; const dir = e === 'H' ? 1 : -1; const np = P.pos[e] + dir;
      if (np < 0 || np > LAST) continue;
      const reg = s.adv[np];
      if (!reg.up) { s.adv.forEach(r => { if (r.card === reg.card) r.up = true; }); log(s, 'Une carte Tumulte est révélée.'); }
      P.pos[e] = np; ev(s, { k: 'fwd', p, e });
      log(s, 'Crépuscule : l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' avance (' + win.map(tl).join(', ') + ').');
    }
    for (let p = 0; p < 2; p++) for (const e of ['H', 'C']) if (!moves.some(m => m[0] === p && m[1] === e)) ev(s, { k: 'fail', p, e });
    processEvents(s, db);
    if (!moves.length) log(s, 'Crépuscule : aucune expédition n’avance.');
  }
  const tl = t => ({ F: 'forêt', M: 'montagne', W: 'eau' })[t];

  function rest(s, db) {
    for (const P of s.players) { P.asc = {}; P.noMove = {}; }
    for (const P of s.players) for (const e of ['H', 'C']) {
      for (const id of P.exp[e].slice()) {
        const c = s.cards[id], d = c.tok ? { t: 'CHARACTER' } : (db[c.ref] || {}), k = kw(d);
        if (d.t !== 'CHARACTER') continue;
        if (c.anchored || c.asleep) { c.anchored = false; c.asleep = false; continue; }
        if (k.eternal) continue;
        if (c.fleeting) { moveTo(s, id, 'discard'); continue; }
        const b = k.seasoned ? c.boost : 0; moveTo(s, id, 'reserve'); c.boost = b;
      }
    }
    processEvents(s, db);
    log(s, 'Nuit : les personnages retournent en Réserve (sauf ancrés, endormis ou éternels ; les fugaces sont défaussés).');
  }

  function checkVictory(s) {
    if (s.tie) return;
    const d = s.players.map(distance);
    if (d[0] <= 6 && d[1] <= 6) return;
    if (d[0] >= 7 && d[0] > d[1]) { s.winner = 0; } else if (d[1] >= 7 && d[1] > d[0]) { s.winner = 1; }
    else { s.tie = true; log(s, 'Égalité : départage dans l’Arène (forêt, montagne, eau ; les expéditions ne bougent plus).'); return; }
    s.phase = 'END'; s.step = 'END'; log(s, s.players[s.winner].name + ' remporte la partie !');
  }
  function tieDusk(s, db) {
    const sum = p => { const a = totals(s, p, 'H', db), b = totals(s, p, 'C', db); return { F: a.F + b.F, M: a.M + b.M, W: a.W + b.W }; };
    const A = sum(0), B = sum(1); let a = 0, b = 0;
    for (const t of ['F', 'M', 'W']) { if (A[t] > B[t]) a++; else if (B[t] > A[t]) b++; }
    if (a !== b) { s.winner = a > b ? 0 : 1; s.phase = 'END'; s.step = 'END'; log(s, 'Arène : ' + s.players[s.winner].name + ' gagne ' + Math.max(a, b) + ' terrain(s) et remporte la partie !'); }
    else log(s, 'Arène : toujours à égalité, la partie continue.');
  }

  // Actions des joueurs. Renvoie un message d'erreur (texte) ou null.
  function act(s, p, a, db) {
    const P = s.players[p]; if (!P) return 'Joueur inconnu';
    const c = a.id ? s.cards[a.id] : null;
    if (!s.choices) s.choices = [];
    if (s.choices.length && ['play', 'pass', 'ready', 'toManaMany', 'toMana', 'cleanup'].includes(a.type)) return 'Termine d’abord le choix en cours (' + s.choices[0].label + ').';
    const name = id => { const c = s.cards[id]; return c && c.tok ? c.tok.n : ((db[c && c.ref] || {}).n || '?'); };
    switch (a.type) {
      case 'ready': {
        if (s.step === 'SETUP_MANA') { if (P.mana.length < 3) return 'Choisis 3 cartes à mettre en mana.'; }
        s.ready[p] = true; break;
      }
      case 'toMana': {
        if (!c || c.owner !== p) return 'Carte invalide';
        const w = where(s, a.id); if (!w || w.z !== 'hand') return 'La carte doit être en main.';
        if (s.step === 'SETUP_MANA') { if (P.mana.length >= 3) return 'Tu as déjà 3 mana.'; }
        else if (s.step === 'EXPAND') { if (s.ready[p]) return 'Tu as déjà fait ton choix ce matin.'; s.ready[p] = true; }
        else if (!a.free) return 'Pas maintenant (seulement au matin).';
        moveTo(s, a.id, 'mana'); log(s, P.name + ' met une carte en mana.'); break;
      }
      case 'choose': {
        const ch = s.choices[0]; if (!ch) return 'Aucun choix en cours.';
        if (ch.p !== p) return 'C’est à l’adversaire de choisir.';
        if ((a.target === null || a.target === undefined) && !ch.opt && ch.kind !== 'exp' && hasTargets(s, ch, db)) return 'Ce choix est obligatoire.';
        const err = applyChoice(s, ch, a.target, db); if (err) return err;
        s.choices.shift(); break;
      }
      case 'support': {
        if (!c || c.owner !== p || !P.reserve.includes(a.id)) return 'La carte doit être dans ta réserve.';
        const sd = db[c.ref] || {}; const cl = clauses({ xe: (sd.ee || '') + '  ' + (sd.xe || '') }).find(x => /^\{d\}\s*:/i.test(x)); if (!cl) return 'Pas de capacité « défaussez-moi » sur cette carte.';
        const acts = parseBody(cl.replace(/^\{d\}\s*:\s*/i, ''));
        moveTo(s, a.id, 'discard'); log(s, P.name + ' défausse ' + name(a.id) + ' de sa réserve pour utiliser sa capacité.');
        if (acts) acts.forEach(x => doAction(s, p, a.id, x, db)); else log(s, '⚠ Effet à appliquer à la main.');
        break;
      }
      case 'toManaMany': {
        const ids = Array.isArray(a.ids) ? a.ids.filter((id, i, arr) => arr.indexOf(id) === i) : [];
        if (!ids.every(id => s.cards[id] && s.cards[id].owner === p && P.hand.includes(id))) return 'Choisis des cartes de ta main.';
        if (s.step === 'SETUP_MANA') { if (ids.length !== 3 - P.mana.length) return 'Choisis exactement ' + (3 - P.mana.length) + ' carte(s).'; }
        else if (s.step === 'EXPAND') { if (s.ready[p]) return 'Tu as déjà fait ton choix ce matin.'; if (ids.length > 1) return 'Une seule carte au matin.'; }
        else return 'Pas maintenant.';
        for (const id of ids) moveTo(s, id, 'mana');
        if (ids.length) log(s, P.name + ' met ' + ids.length + ' carte(s) en mana.');
        s.ready[p] = true; break;
      }
      case 'play': {
        if (s.step !== 'AFTERNOON') return 'On ne joue des cartes que l’après-midi.';
        if (s.turn !== p) return 'Ce n’est pas ton tour.';
        if (!c || c.owner !== p) return 'Carte invalide';
        const w = where(s, a.id); if (!w || (w.z !== 'hand' && w.z !== 'reserve')) return 'Joue depuis ta main ou ta réserve.';
        const d = db[c.ref]; if (!d) return 'Carte inconnue';
        const fromRes = w.z === 'reserve';
        if (fromRes && c.ex) return 'Cette carte est épuisée en réserve.';
        const tmatch = t => t === 'card' || (t === 'character' && d.t === 'CHARACTER') || (t === 'spell' && d.t === 'SPELL') || (t === 'permanent' && /PERMANENT/.test(d.t));
        const di = (P.disc || []).findIndex(x => tmatch(x.t));
        const base = Math.max(0, num(fromRes ? d.rc : d.c) - selfDiscount(s, p, a.id, db, a.e === 'C' ? 'C' : 'H'));
        const cost = Number.isFinite(a.cost) ? Math.max(0, a.cost) : (di >= 0 ? Math.max(Math.min(base, P.disc[di].min || 0), base - P.disc[di].n) : base);
        const usedDisc = !Number.isFinite(a.cost) && di >= 0;
        if (readyMana(P) < cost) return 'Pas assez de mana (' + readyMana(P) + ' / ' + cost + ').';
        payMana(P, cost);
        if (usedDisc) P.disc.splice(di, 1);
        const k = kw(d);
        if (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT') { moveTo(s, a.id, 'exp', a.e); c.fleeting = fromRes || k.fleeting; }
        else if (d.t === 'LANDMARK_PERMANENT' || d.t === 'PERMANENT') moveTo(s, a.id, 'lm');
        else if (d.t === 'SPELL') { const nf = P.noFleet; P.noFleet = false; if ((fromRes || k.fleeting) && !nf) moveTo(s, a.id, 'discard'); else { moveTo(s, a.id, 'reserve'); if (k.cooldown) c.ex = true; } }
        log(s, P.name + ' joue ' + name(a.id) + (fromRes ? ' depuis la réserve' : '') + ' (' + cost + ' mana)' + (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT' ? ' dans l’expédition ' + (a.e === 'C' ? 'Compagnon' : 'Héros') : '') + '.');
        if (d.t === 'CHARACTER') { const fi = (P.nf || []).findIndex(x => x.max == null || num(d.c) <= x.max); if (fi >= 0) { c[P.nf[fi].f] = true; P.nf.splice(fi, 1); } }
        if (d.t === 'CHARACTER') { const bi = (P.nb || []).findIndex(x => x.t === 'character' || x.t === 'card'); if (bi >= 0) { c.boost += P.nb[bi].n; log(s, '→ ' + name(a.id) + ' gagne ' + P.nb[bi].n + ' boost(s).'); P.nb.splice(bi, 1); } }
        if (d.t === 'CHARACTER') { ev(s, { k: 'join', p, id: a.id, e: a.e === 'C' ? 'C' : 'H' }); ev(s, { k: 'char', p, id: a.id }); }
        if (d.t === 'SPELL') ev(s, { k: 'spell', p, id: a.id });
        s.played = (s.played || 0) + 1;
        const fx = onPlay(s, p, a.id, fromRes, db);
        if (fx.manual) log(s, '⚠ ' + name(a.id) + ' : une partie de l’effet est à appliquer à la main.');
        s.lastPlayed = { id: a.id, by: p };
        if (!s.passed[1 - p]) s.turn = 1 - p;
        break;
      }
      case 'pass': {
        if (s.step !== 'AFTERNOON' || s.turn !== p) return 'Ce n’est pas ton tour.';
        ev(s, { k: 'pass', p, first: !s.passed[1 - p] }); s.passed[p] = true; log(s, P.name + ' passe.'); s.turn = 1 - p; break;
      }
      case 'cleanup': {
        if (s.step !== 'CLEANUP') return 'Pas maintenant';
        const keepR = (a.keepR || []).filter(id => P.reserve.includes(id)).slice(0, P.rl);
        const keepL = (a.keepL || []).filter(id => P.lm.includes(id)).slice(0, P.ll);
        if (P.reserve.length > P.rl) for (const id of P.reserve.slice()) if (!keepR.includes(id)) moveTo(s, id, 'discard');
        if (P.lm.length > P.ll) for (const id of P.lm.slice()) if (!keepL.includes(id)) moveTo(s, id, 'discard');
        s.ready[p] = true; log(s, P.name + ' fait le ménage de fin de journée.'); break;
      }
      // Outils manuels pour appliquer les effets des cartes
      case 'move': {
        if (!c) return 'Carte invalide';
        const w = where(s, a.id); if (!w || w.z === 'hero') return 'Impossible';
        if (w.z === 'hand' && c.owner !== p) return 'Main adverse cachée';
        if (a.to === 'mana' && c.owner !== p) return 'Impossible';
        const nm = (w.z === 'deck' || (w.z === 'hand' && c.owner !== p)) ? 'une carte' : name(a.id);
        moveTo(s, a.id, a.to, a.e, a.top);
        if (a.to === 'exp' && a.fl) c.fleeting = true;
        log(s, P.name + ' déplace ' + nm + ' vers ' + zl(a.to, a.e) + (c.owner !== p ? ' (carte adverse)' : '') + '.'); break;
      }
      case 'boost': if (!c) return 'Carte invalide'; c.boost = Math.max(0, c.boost + (a.n || 1)); log(s, P.name + ' : ' + name(a.id) + ' ' + (a.n > 0 ? '+' : '') + a.n + ' boost (' + c.boost + ').'); break;
      case 'flag': if (!c || !['fleeting', 'anchored', 'asleep', 'ex'].includes(a.f)) return 'Invalide'; c[a.f] = !c[a.f]; log(s, P.name + ' : ' + name(a.id) + ' ' + fl(a.f) + (c[a.f] ? ' activé' : ' retiré') + '.'); break;
      case 'manaEx': { const m = P.mana[a.i]; if (!m) return 'Invalide'; m.ex = !m.ex; break; }
      case 'draw': { const n = Math.max(1, Math.min(10, a.n || 1)); for (let i = 0; i < n; i++) draw(s, p); log(s, P.name + ' pioche ' + n + ' carte(s).'); break; }
      case 'resupply': { if (!P.deck.length && P.discard.length) { P.deck = P.discard.splice(0); shuffle(P.deck, Math.random); } const id = P.deck.shift(); if (id) { P.reserve.push(id); log(s, P.name + ' se ravitaille : ' + name(id) + ' va en réserve.'); } break; }
      case 'shuffle': shuffle(P.deck, Math.random); log(s, P.name + ' mélange son deck.'); break;
      case 'pos': { const t = s.players[a.p ?? p]; const e = a.e === 'C' ? 'C' : 'H'; const dir = (e === 'H' ? 1 : -1) * (a.n || 1); t.pos[e] = Math.max(0, Math.min(LAST, t.pos[e] + dir)); const r = s.adv[t.pos[e]]; if (!r.up) s.adv.forEach(x => { if (x.card === r.card) x.up = true; }); log(s, P.name + ' déplace l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + t.name + ' (' + (a.n > 0 ? 'avance' : 'recule') + ').'); break; }
      case 'token': {
        const id = 't' + (s.nid++);
        s.cards[id] = { id, ref: '__token', owner: p, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: String(a.n || 'Jeton').slice(0, 40), p: [a.f | 0, a.m | 0, a.w | 0] } };
        P.exp[a.e === 'C' ? 'C' : 'H'].push(id); log(s, P.name + ' crée un jeton ' + s.cards[id].tok.n + '.'); break;
      }
      case 'note': log(s, P.name + ' : ' + String(a.m || '').slice(0, 200)); break;
      default: return 'Action inconnue';
    }
    processEvents(s, db);
    advance(s, db);
    processEvents(s, db);
    return null;
  }
  const zl = (z, e) => ({ hand: 'la main', reserve: 'la réserve', discard: 'la défausse', lm: 'les repères', mana: 'le mana', deck: 'le deck', exp: 'l’expédition ' + (e === 'C' ? 'Compagnon' : 'Héros') })[z] || z;
  const fl = f => ({ fleeting: 'fugace', anchored: 'ancré', asleep: 'endormi', ex: 'épuisé' })[f];

  // Vue d'un joueur : on cache la main et le deck de l'adversaire
  function view(s, p) {
    const v = JSON.parse(JSON.stringify(s));
    v.me = p;
    const O = v.players[1 - p];
    if (O) {
      O.handCount = O.hand.length; O.deckCount = O.deck.length;
      for (const id of O.hand.concat(O.deck)) delete v.cards[id];
      O.hand = []; O.deck = [];
      O.mana = O.mana.map(m => ({ ex: m.ex }));
    }
    const M = v.players[p]; if (M) { M.deckCount = M.deck.length; for (const id of M.deck) delete v.cards[id]; M.deck = []; }
    return v;
  }

  function supportBody(d) { const cl = clauses({ xe: ((d && d.ee) || '') + '  ' + ((d && d.xe) || '') }).find(x => /^\{d\}\s*:/i.test(x)); return cl ? { text: cl, auto: !!parseBody(cl.replace(/^\{d\}\s*:\s*/i, '')) } : null; }
  root.AlteredEngine = { supportBody, parseBody, clauses, newGame, addPlayer, advance, act, view, totals, kw, num, distance, readyMana, LAST };
})(typeof window !== 'undefined' ? window : globalThis);
