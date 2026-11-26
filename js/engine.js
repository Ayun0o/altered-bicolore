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
    const tum = shuffle([['F', 'M'], ['M', 'W'], ['W', 'F']], rnd).map(p => rnd() < 0.5 ? p : p.slice().reverse());
    const adv = [{ terr: TERR.slice(), up: true, kind: 'H' }];
    tum.forEach((p, i) => { adv.push({ terr: [p[0]], up: false, kind: 'T', card: i }); adv.push({ terr: [p[1]], up: false, kind: 'T', card: i }); });
    adv.push({ terr: TERR.slice(), up: true, kind: 'C' });
    const s = { v: 1, day: 1, phase: 'SETUP', step: 'SETUP_MANA', first: rnd() < 0.5 ? 0 : 1, turn: null, passed: [false, false],
      ready: [false, false], adv, cards: {}, nid: 1, players: [], log: [], winner: null, tie: false, pending: null };
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

  // Fait avancer la partie jusqu'à la prochaine décision des joueurs
  function advance(s, db) {
    for (let guard = 0; guard < 40; guard++) {
      if (s.winner !== null) return;
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
          if (triggerPresent(s, db, 'noon') && !(s.ready[0] && s.ready[1])) { if (!s.pending) { s.pending = 'noon'; log(s, 'Midi : appliquez les effets « À Midi », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false]; s.phase = 'AFTERNOON'; s.step = 'AFTERNOON'; s.turn = s.first; s.passed = [false, false];
          log(s, 'Après-midi : ' + s.players[s.first].name + ' commence.'); continue;
        case 'AFTERNOON':
          if (s.passed[0] && s.passed[1]) { s.phase = 'DUSK'; s.step = 'DUSK'; continue; }
          if (s.passed[s.turn]) s.turn = 1 - s.turn;
          return;
        case 'DUSK':
          if (triggerPresent(s, db, 'dusk') && !(s.ready[0] && s.ready[1])) { if (s.pending !== 'dusk') { s.pending = 'dusk'; log(s, 'Crépuscule : appliquez les effets « Au Crépuscule », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false];
          progress(s, db); s.phase = 'NIGHT'; s.step = 'NIGHT'; continue;
        case 'NIGHT':
          if (triggerPresent(s, db, 'night') && !(s.ready[0] && s.ready[1]) && s.pending !== 'night-done') { if (s.pending !== 'night') { s.pending = 'night'; log(s, 'Nuit : appliquez les effets « À la Nuit », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false];
          rest(s, db); s.step = 'CLEANUP'; continue;
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
      const win = reg.terr.filter(t => mine[t] > theirs[t] && mine[t] > 0);
      const label = (e === 'H' ? 'Héros' : 'Compagnon');
      if (win.length && !hasDefender(s, p, e, db)) moves.push([p, e, win]);
      else if (win.length) log(s, P.name + ' (' + label + ') gagnerait, mais un Défenseur bloque l’avancée.');
    }
    for (const [p, e, win] of moves) {
      const P = s.players[p]; const dir = e === 'H' ? 1 : -1; const np = P.pos[e] + dir;
      if (np < 0 || np > LAST) continue;
      const reg = s.adv[np];
      if (!reg.up) { s.adv.forEach(r => { if (r.card === reg.card) r.up = true; }); log(s, 'Une carte Tumulte est révélée.'); }
      P.pos[e] = np;
      log(s, 'Crépuscule : l’expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + ' de ' + P.name + ' avance (' + win.map(tl).join(', ') + ').');
    }
    if (!moves.length) log(s, 'Crépuscule : aucune expédition n’avance.');
  }
  const tl = t => ({ F: 'forêt', M: 'montagne', W: 'eau' })[t];

  function rest(s, db) {
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
      case 'play': {
        if (s.step !== 'AFTERNOON') return 'On ne joue des cartes que l’après-midi.';
        if (s.turn !== p) return 'Ce n’est pas ton tour.';
        if (!c || c.owner !== p) return 'Carte invalide';
        const w = where(s, a.id); if (!w || (w.z !== 'hand' && w.z !== 'reserve')) return 'Joue depuis ta main ou ta réserve.';
        const d = db[c.ref]; if (!d) return 'Carte inconnue';
        const fromRes = w.z === 'reserve';
        if (fromRes && c.ex) return 'Cette carte est épuisée en réserve.';
        const cost = Number.isFinite(a.cost) ? Math.max(0, a.cost) : num(fromRes ? d.rc : d.c);
        if (readyMana(P) < cost) return 'Pas assez de mana (' + readyMana(P) + ' / ' + cost + ').';
        payMana(P, cost);
        const k = kw(d);
        if (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT') { moveTo(s, a.id, 'exp', a.e); c.fleeting = fromRes || k.fleeting; }
        else if (d.t === 'LANDMARK_PERMANENT' || d.t === 'PERMANENT') moveTo(s, a.id, 'lm');
        else if (d.t === 'SPELL') { if (fromRes || k.fleeting) moveTo(s, a.id, 'discard'); else { moveTo(s, a.id, 'reserve'); if (k.cooldown) c.ex = true; } }
        log(s, P.name + ' joue ' + name(a.id) + (fromRes ? ' depuis la réserve' : '') + ' (' + cost + ' mana)' + (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT' ? ' dans l’expédition ' + (a.e === 'C' ? 'Compagnon' : 'Héros') : '') + '. Appliquez son effet.');
        s.lastPlayed = { id: a.id, by: p };
        if (!s.passed[1 - p]) s.turn = 1 - p;
        break;
      }
      case 'pass': {
        if (s.step !== 'AFTERNOON' || s.turn !== p) return 'Ce n’est pas ton tour.';
        s.passed[p] = true; log(s, P.name + ' passe.'); s.turn = 1 - p; break;
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
    advance(s, db);
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

  root.AlteredEngine = { newGame, addPlayer, advance, act, view, totals, kw, num, distance, readyMana, LAST };
})(typeof window !== 'undefined' ? window : globalThis);
