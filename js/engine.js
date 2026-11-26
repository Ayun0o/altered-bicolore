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
    if (from.z === 'exp' && z !== 'exp' && !c.tok) ev(s, { k: 'leave', p: c.owner, id, e: from.e });
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


  // ---------- Effets automatiques ----------
  // Découpe le texte anglais en clauses ; chaque clause a ses déclencheurs ({J} joué, {H} depuis la main, {R} depuis la réserve).
  function clauses(card) {
    const t = ((card && card.xe) || '').replace(/\u00a0/g, ' ').replace(/#/g, '').replace(/\s*\([^)]*\)/g, '');
    return t.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
  }
  const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
  // Traduit une phrase d'effet en action. Renvoie null si on ne sait pas l'automatiser.
  function parseAction(b) {
    b = b.toLowerCase().replace(/\u00a0/g, ' ').replace(/\[\]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim().replace(/\.$/, '');
    let m;
    if (/^\[resupply\]$/.test(b)) return { k: 'resupply' };
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
    if ((m = b.match(/^pay \{(\d+)\} less for the next character you play this turn, down to a minimum of \{(\d+)\}$/))) return { k: 'disc', t: 'character', n: +m[1], min: +m[2] };
    if (/^exhaust target card in reserve$/.test(b)) return { k: 'choose', kind: 'reserve', act: { k: 'flag', f: 'ex' }, label: 'Choisis une carte en réserve à épuiser' };
    if (/^send target character to reserve$/.test(b)) return { k: 'choose', kind: 'char', act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve' };
    if ((m = b.match(/^create (?:a|an) \[(.+?) (\d+)\/(\d+)\/(\d+)\] (.+?) token in (target expedition|my expedition|each of your expeditions)$/))) {
      const tok = { n: m[1].replace(/\b\w/g, c => c.toUpperCase()), p: [+m[2], +m[3], +m[4]] };
      if (m[6] === 'target expedition') return { k: 'choose', kind: 'exp', act: { k: 'token', tok }, label: 'Dans quelle expédition créer le jeton ' + tok.n + ' ?' };
      return { k: 'token', tok, where: m[6] === 'my expedition' ? 'mine' : 'both' };
    }
    if ((m = b.match(/^(you may )?send (?:to reserve )?target character (?:with hand cost \{(\d+)\} or less )?(?:to reserve)?$/))) return { k: 'choose', kind: 'char', opt: !!m[1], max: m[2] ? +m[2] : null, act: { k: 'toReserve' }, label: 'Choisis un personnage à renvoyer en réserve' + (m[2] ? ' (coût de main ' + m[2] + ' ou moins)' : '') };
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
    if (/^sacrifice a character in my expedition$/.test(b)) return { k: 'choose', kind: 'ownchar', act: { k: 'discard' }, label: 'Sacrifie un personnage de ton expédition' };
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
    const parts = body.split(/\.\s+/).map(x => x.trim()).filter(Boolean);
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
        const es = a.where === 'both' ? ['H', 'C'] : [a.e || ctx.e || expOf(s, self) || 'H'];
        for (const e of es) { const id = 't' + (s.nid++); s.cards[id] = { id, ref: '__token', owner: p, boost: 0, ex: false, fleeting: false, anchored: false, asleep: false, tok: { n: a.tok.n, p: a.tok.p.slice() } }; P.exp[e].push(id); ev(s, { k: 'join', p, id, e }); }
        log(s, '→ ' + P.name + ' crée ' + (es.length > 1 ? 'des jetons ' : 'un jeton ') + a.tok.n + ' ' + a.tok.p.join('/') + '.'); break;
      }
      case 'choose': { const ch = { p, kind: a.kind, opt: !!a.opt || a.kind === 'yesno', max: a.max ?? null, act: a.act, label: a.label, src: self }; if (hasTargets(s, ch, db)) s.choices.push(ch); else log(s, '→ aucune cible possible, effet ignoré.'); break; }
      case 'chooseOpp': if (s.players[1 - p].hand.length) s.choices.push({ p: 1 - p, kind: a.kind, opt: false, act: a.act, label: a.label, src: self }); break;
      case 'seq': a.list.forEach(x => doAction(s, p, self, x, db)); break;
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
    if (ch.kind === 'exp') { if (target !== 'H' && target !== 'C') return 'Choisis une expédition.'; doAction(s, ch.p, ch.src, Object.assign({}, a, { e: target, where: 'one' }), db); return null; }
    const c = s.cards[target]; const w = c && where(s, target); if (!w) return 'Cible invalide';
    if (ch.kind === 'reserve' && w.z !== 'reserve') return 'Choisis une carte dans une réserve.';
    if (ch.kind === 'char' && !(w.z === 'exp' && (c.tok || (db[c.ref] || {}).t === 'CHARACTER'))) return 'Choisis un personnage en expédition.';
    if (ch.kind === 'hand' && !(w.z === 'hand' && w.p === ch.p)) return 'Choisis une carte de ta main.';
    if (ch.kind === 'perm' && !(!c.tok && /PERMANENT/.test((db[c.ref] || {}).t || '') && (w.z === 'exp' || w.z === 'lm'))) return 'Choisis un permanent en jeu.';
    if (ch.kind === 'any' && !(w.z === 'exp' || w.z === 'lm')) return 'Choisis un personnage ou un permanent en jeu.';
    if (ch.kind === 'ownchar') { const e = expOf(s, ch.src); if (!(w.z === 'exp' && w.p === ch.p && w.e === e)) return 'Choisis un personnage de cette expédition.'; }
    if (ch.max !== null && ch.max !== undefined && !c.tok && num((db[c.ref] || {}).c) > ch.max) return 'Coût de main trop élevé (max ' + ch.max + ').';
    const nm = cname(s, target, db);
    if (a.k === 'switch') { const ne = w.e === 'H' ? 'C' : 'H'; s.players[w.p].exp[w.e].splice(w.i, 1); s.players[w.p].exp[ne].push(target); log(s, '→ ' + nm + ' change d’expédition.'); return null; }
    if (a.k === 'toHand') { moveTo(s, target, 'hand'); log(s, '→ ' + nm + ' retourne dans la main de son propriétaire.'); return null; }
    if (a.k === 'discard') { moveTo(s, target, 'discard'); log(s, '→ ' + (ch.kind === 'hand' ? 'une carte de la main de ' + s.players[w.p].name : nm) + ' est défaussée.'); }
    else if (a.k === 'boost') { c.boost += a.n; log(s, '→ ' + nm + ' gagne ' + a.n + ' boost(s).'); }
    else if (a.k === 'flag') { c[a.f] = true; log(s, '→ ' + nm + ' devient ' + ({ anchored: 'ancré', asleep: 'endormi', fleeting: 'fugace', ex: 'épuisée' })[a.f] + '.'); }
    else if (a.k === 'toDeck') { moveTo(s, target, 'deck', null, true); log(s, '→ ' + nm + ' est remise sur le dessus du deck de son propriétaire.'); }
    else if (a.k === 'toReserve') { if (c.tok) { moveTo(s, target, 'reserve'); log(s, '→ le jeton ' + nm + ' quitte le jeu.'); } else { moveTo(s, target, 'reserve'); if (a.ex && s.cards[target]) s.cards[target].ex = true; log(s, '→ ' + (ch.kind === 'hand' ? 'une carte' : nm) + ' va en réserve' + (a.ex ? ' et est épuisée' : '') + '.'); } if (a.then) doAction(s, ch.p, ch.src, a.then, db); }
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
    { k: 'fwd', re: /^when my expedition moves forward$/, who: (s, e, P, id, w) => w.p === e.p && w.z === 'exp' && w.e === e.e },
    { k: 'fail', re: /^when my expedition fails to move forward during dusk$/, who: (s, e, P, id, w) => w.p === e.p && w.z === 'exp' && w.e === e.e }
  ];
  function processEvents(s, db) {
    let guard = 0;
    while (s.ev && s.ev.length && guard++ < 60) {
      const e = s.ev.shift();
      const ids = [];
      for (const X of s.players) ids.push(...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve);
      if (e.k === 'leave' && !ids.includes(e.id)) ids.push(e.id);
      for (const id of ids) {
        const c = s.cards[id]; if (!c || c.tok) continue;
        const d = db[c.ref]; if (!d) continue;
        const w = where(s, id) || { p: c.owner, z: 'gone' };
        const src = e.k === 'leave' ? (d.xe || '') : (w.z === 'reserve' ? (c.ex ? '' : (d.ee || '')) : (d.xe || ''));
        for (const cl of clauses({ xe: src })) {
          const m = cl.replace(/^\{i\}\s*/i, '').match(/^(when[^—-]+?)\s*[—-]\s*(.*)$/i); if (!m) continue;
          const head = m[1].toLowerCase().trim();
          const t = TRIG.find(x => x.k === e.k && x.re.test(head)); if (!t || !t.who(s, e, s.players[w.p], id, w)) continue;
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
      const ok = tr.includes('{j}') || (tr.includes('{h}') && !fromRes) || (tr.includes('{r}') && fromRes);
      if (!ok) continue;
      const acts = parseBody(m[2]);
      if (!acts) { manual++; continue; }
      acts.forEach(a => doAction(s, p, id, a, db)); auto++;
    }
    return { manual, auto };
  }
  // Effets « À Midi » simples des cartes en jeu. Renvoie true s'il reste des effets à faire à la main.
  function noonAuto(s, db) {
    let manual = false;
    const order = [s.first, 1 - s.first];
    for (const p of order) {
      const P = s.players[p];
      for (const id of [P.hero, ...P.lm, ...P.exp.H, ...P.exp.C]) {
        const c = id && s.cards[id]; if (!c || c.tok) continue;
        for (const cl of clauses(db[c.ref])) {
          const m = cl.match(/^at noon\s*[—-]\s*(.*)$/i); if (!m) continue;
          const acts = parseBody(m[1]);
          if (!acts) { manual = true; continue; }
          log(s, 'Midi : effet de ' + cname(s, id, db) + '.'); acts.forEach(a => doAction(s, p, id, a, db));
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
          if (triggerPresent(s, db, 'dusk') && !(s.ready[0] && s.ready[1])) { if (s.pending !== 'dusk') { s.pending = 'dusk'; log(s, 'Crépuscule : appliquez les effets « Au Crépuscule », puis validez.'); } return; }
          s.pending = null; s.ready = [false, false];
          for (const X of s.players) { X.disc = []; X.nb = []; }
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
      const asc = P.asc && P.asc[e];
      const win = reg.terr.filter(t => (mine[t] > theirs[t] || (asc && mine[t] === theirs[t])) && mine[t] > 0);
      const label = (e === 'H' ? 'Héros' : 'Compagnon');
      if (win.length && !hasDefender(s, p, e, db)) moves.push([p, e, win]);
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
    for (const P of s.players) P.asc = {};
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
        const base = num(fromRes ? d.rc : d.c);
        const cost = Number.isFinite(a.cost) ? Math.max(0, a.cost) : (di >= 0 ? Math.max(Math.min(base, P.disc[di].min || 0), base - P.disc[di].n) : base);
        const usedDisc = !Number.isFinite(a.cost) && di >= 0;
        if (readyMana(P) < cost) return 'Pas assez de mana (' + readyMana(P) + ' / ' + cost + ').';
        payMana(P, cost);
        if (usedDisc) P.disc.splice(di, 1);
        const k = kw(d);
        if (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT') { moveTo(s, a.id, 'exp', a.e); c.fleeting = fromRes || k.fleeting; }
        else if (d.t === 'LANDMARK_PERMANENT' || d.t === 'PERMANENT') moveTo(s, a.id, 'lm');
        else if (d.t === 'SPELL') { if (fromRes || k.fleeting) moveTo(s, a.id, 'discard'); else { moveTo(s, a.id, 'reserve'); if (k.cooldown) c.ex = true; } }
        log(s, P.name + ' joue ' + name(a.id) + (fromRes ? ' depuis la réserve' : '') + ' (' + cost + ' mana)' + (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT' ? ' dans l’expédition ' + (a.e === 'C' ? 'Compagnon' : 'Héros') : '') + '.');
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
