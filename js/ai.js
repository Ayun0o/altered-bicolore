// Adversaire contrôlé par l'ordinateur (version 1, simple et lisible).
// Principes : dépenser un maximum de mana en priorité sur les cartes chères,
// les placer là où elles font gagner le plus de terrains, et choisir chaque cible
// en simulant le résultat sur une copie de la partie.
(function (root) {
  'use strict';
  const E = root.AlteredEngine;
  const clone = s => JSON.parse(JSON.stringify(s));

  // Valeur de la position pour le joueur p : terrains gagnés dans chaque expédition, avance, cartes en main
  const prog = P => P.pos.H + (7 - P.pos.C);   // avance totale des deux expéditions
  // Valeur de la position pour p. En avance : il pousse pour finir (aggro). En retard : il freine l'autre (contrôle).
  function score(s, p, db, mode) {
    const P = s.players[p], O = s.players[1 - p]; if (!P || !O) return 0;
    if (s.winner === p) return 1e6; if (s.winner === 1 - p) return -1e6;
    mode = mode || (prog(P) >= prog(O) ? 'aggro' : 'control');
    const wMe = mode === 'aggro' ? 6 : 3, wBlock = mode === 'aggro' ? 2.5 : 6;
    let v = 0;
    for (const e of ['H', 'C']) {
      const t = E.totals(s, p, e, db), o = E.totals(s, 1 - p, e, db);
      const mine = (s.adv[P.pos[e]] || {}).terr || [], theirs = (s.adv[O.pos[e]] || {}).terr || [];
      for (const k of ['F', 'M', 'W']) {
        if (mine.includes(k)) { v += 1.2 * Math.max(-4, Math.min(4, t[k] - o[k])); if (t[k] > o[k]) v += wMe; }
        if (theirs.includes(k)) { if (o[k] > t[k]) v -= wBlock; else v += 0.6 * wBlock; }
        if (!mine.includes(k) && !theirs.includes(k)) v += 0.3 * Math.max(-3, Math.min(3, t[k] - o[k]));
      }
    }
    v += 8 * prog(P) - 8 * prog(O);
    v += 0.8 * P.hand.length + 0.5 * P.reserve.length - 0.6 * O.hand.length - 0.4 * O.reserve.length + 0.3 * P.mana.length;
    return v;
  }
  // Meilleure dépense possible : la plus grande somme de coûts ≤ mana (cartes de la main et de la réserve)
  function bestSum(costs, m) { let reach = new Set([0]); for (const c of costs) { if (c <= 0) continue; const n = new Set(reach); for (const r of reach) if (r + c <= m) n.add(r + c); reach = n; } return Math.max(...reach); }
  function bestSet(items, m) { // items: [{id,c}] → sous-ensemble dont la somme est maximale
    let best = { sum: 0, ids: [] }; const n = Math.min(items.length, 14);
    const rec = (i, sum, ids) => { if (sum > m) return; if (sum > best.sum || (sum === best.sum && ids.length < best.ids.length)) best = { sum, ids: ids.slice() }; if (i >= n) return; ids.push(items[i].id); rec(i + 1, sum + items[i].c, ids); ids.pop(); rec(i + 1, sum, ids); };
    rec(0, 0, []); return best;
  }
  const costOf = (s, id, db) => { const c = s.cards[id], d = db[c.ref] || {}; return E.num(d.c); };

  // Mise en place (3 cartes en mana) : avec au moins une carte à 3 ou moins en main, il met ses cartes à 5+ ;
  // s'il n'a rien de jouable au premier tour, il met aussi les cartes à 4+ ; sinon les plus chères.
  function setupPick(s, p, db) {
    const P = s.players[p], byCost = P.hand.slice().sort((a, b) => costOf(s, b, db) - costOf(s, a, db));
    const hasEarly = P.hand.some(id => costOf(s, id, db) <= 3);
    const big = byCost.filter(id => costOf(s, id, db) >= (hasEarly ? 5 : 4));
    const pick = big.slice(0, 3); for (const id of byCost) { if (pick.length >= 3) break; if (!pick.includes(id)) pick.push(id); }
    return pick;
  }
  // Matin : à partir du jour 2 il met plutôt une petite carte (1-2), sauf si elle sert à dépenser tout son mana au prochain tour
  function morningPick(s, p, db) {
    const P = s.players[p], m = P.mana.length + 1;
    let best = null, bv = -Infinity;
    for (const id of P.hand) {
      const rest = P.hand.filter(x => x !== id).map(x => costOf(s, x, db)).concat(P.reserve.map(x => E.num((db[s.cards[x].ref] || {}).rc)));
      const c = costOf(s, id, db);
      const v = bestSum(rest, m) * 10 + (s.day >= 2 ? -c : c);   // garder la courbe, puis jeter petit (ou gros au jour 1)
      if (v > bv) { bv = v; best = id; }
    }
    return best;
  }
  function bestChoice(s, p, db) {
    const ch = s.choices[0]; const cand = [];
    if (ch.kind === 'option') ch.opts.forEach((o, i) => cand.push(i));
    else if (ch.kind === 'exp') cand.push('H', 'C');
    else if (ch.kind === 'anyexp') cand.push('0H', '0C', '1H', '1C');
    else if (ch.kind === 'yesno') cand.push('yes');
    else { for (const X of s.players) cand.push(...X.exp.H, ...X.exp.C, ...X.lm, ...X.reserve); cand.push(...s.players[p].hand); }
    cand.push(null);
    let best = null, bv = -Infinity;
    for (const pass of [0, 1]) { if (best) break; for (const t of cand) {
      if (pass === 0 && t != null && typeof t === 'string' && s.cards[t] && s.cards[t].owner !== p && ch.act && /boost/i.test(ch.act.k || '') && !/rmCtr|clearBoost/.test(ch.act.k)) continue; // jamais de boost à l'adversaire
      const c = clone(s); const err = E.act(c, p, { type: 'choose', target: t }, db); if (err) continue;
      const v = score(c, p, db); if (v > bv) { bv = v; best = { type: 'choose', target: t }; }
    } }
    return best;
  }

  // Règle n°1 : dépenser tout son mana. Il cherche la combinaison de cartes qui utilise le plus de mana
  // (main + réserve), et ne joue que des cartes de cette combinaison, la plus chère d'abord, au meilleur endroit.
  function bestPlay(s, p, db) {
    const P = s.players[p], mana = E.readyMana(P);
    const ids = P.hand.concat(P.reserve.filter(id => !s.cards[id].ex));
    const base = score(s, p, db);
    const opts = [];
    for (const id of ids) for (const e of ['H', 'C']) {
      const c = clone(s); const before = E.readyMana(c.players[p]);
      const err = E.act(c, p, { type: 'play', id, e }, db); if (err) continue;
      opts.push({ id, e, spent: before - E.readyMana(c.players[p]), gain: score(c, p, db) - base });
    }
    if (!opts.length) return null;
    // Ne pas dépenser son mana pour rien : une carte qui ne change rien au plateau (sort sans cible, effet manuel) n'est pas jouée
    { const useful = opts.filter(o => o.gain > 0.01); if (!useful.length) return null; opts.length = 0; opts.push(...useful); }
    const per = {}; for (const o of opts) per[o.id] = Math.min(per[o.id] ?? 99, o.spent);
    const set = bestSet(Object.entries(per).map(([id, c]) => ({ id, c })).sort((a, b) => b.c - a.c), mana);
    const pool = opts.filter(o => set.ids.includes(o.id) || (set.ids.length === 0 && o.spent === 0));
    const L = pool.length ? pool : opts;
    L.sort((a, b) => (b.spent - a.spent) || (b.gain - a.gain) || ((P.hand.includes(b.id) ? 1 : 0) - (P.hand.includes(a.id) ? 1 : 0)));
    const top = L.filter(o => o.spent === L[0].spent).sort((a, b) => b.gain - a.gain)[0];
    return { type: 'play', id: top.id, e: top.e };
  }

  // Renvoie la prochaine action de l'IA (joueur p), ou null s'il n'a rien à faire
  function next(s, p, db) {
    if (s.winner != null) return null;
    if (s.choices.length) return s.choices[0].p === p ? (bestChoice(s, p, db) || { type: 'choose', target: null }) : null;
    const P = s.players[p]; if (!P) return null;
    switch (s.step) {
      case 'SETUP_MANA': return s.ready[p] ? null : { type: 'toManaMany', ids: setupPick(s, p, db) };
      case 'EXPAND': {
        if (s.ready[p]) return null;
        const maxCost = Math.max(0, ...P.hand.map(id => costOf(s, id, db)));
        if (P.hand.length > 1 && P.mana.length < Math.max(4, Math.min(9, maxCost))) return { type: 'toMana', id: morningPick(s, p, db) };
        return { type: 'ready' };
      }
      case 'AFTERNOON': {
        if (s.turn !== p) return null;
        const play = bestPlay(s, p, db); if (play) return play;
        return s.inRush === p ? { type: 'skipRush' } : { type: 'pass' };
      }
      case 'CLEANUP': {
        if (s.ready[p]) return null;
        const keep = (arr, n) => arr.slice().sort((a, b) => costOf(s, b, db) - costOf(s, a, db)).slice(0, n);
        return { type: 'cleanup', keepR: keep(P.reserve, P.rl), keepL: keep(P.lm, P.ll) };
      }
      default: return s.pending && !s.ready[p] ? { type: 'ready' } : null;
    }
  }

  root.AlteredAI = { next, score };
})(typeof window !== 'undefined' ? window : globalThis);
