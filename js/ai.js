// Adversaire contrôlé par l'ordinateur (version 1, simple et lisible).
// Principes : dépenser un maximum de mana en priorité sur les cartes chères,
// les placer là où elles font gagner le plus de terrains, et choisir chaque cible
// en simulant le résultat sur une copie de la partie.
(function (root) {
  'use strict';
  const E = root.AlteredEngine;
  const clone = s => JSON.parse(JSON.stringify(s));

  // Valeur de la position pour le joueur p : terrains gagnés dans chaque expédition, avance, cartes en main
  function score(s, p, db) {
    const P = s.players[p], O = s.players[1 - p]; if (!P || !O) return 0;
    if (s.winner === p) return 1e6; if (s.winner === 1 - p) return -1e6;
    let v = 0;
    for (const e of ['H', 'C']) {
      const t = E.totals(s, p, e, db), o = E.totals(s, 1 - p, e, db);
      const r = s.adv[P.pos[e]], terr = r ? r.terr : [];
      for (const k of ['F', 'M', 'W']) {
        const w = terr.includes(k) ? 3 : 0.6;
        v += w * Math.max(-4, Math.min(4, t[k] - o[k]));
        if (terr.includes(k) && t[k] > o[k]) v += 4;
      }
    }
    v += 6 * (P.pos.H + (7 - P.pos.C)) - 6 * (O.pos.H + (7 - O.pos.C));
    v += 0.8 * P.hand.length + 0.5 * P.reserve.length - 0.6 * O.hand.length - 0.4 * O.reserve.length;
    v += 0.3 * P.mana.length;
    return v;
  }
  const costOf = (s, id, db) => { const c = s.cards[id], d = db[c.ref] || {}; return E.num(d.c); };

  // Cartes que l'IA met en mana : les plus chères d'abord (elle garde les cartes jouables tôt)
  function manaPick(s, p, db, n) {
    const P = s.players[p];
    return P.hand.slice().sort((a, b) => costOf(s, b, db) - costOf(s, a, db)).slice(0, n);
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
    for (const t of cand) {
      const c = clone(s); const err = E.act(c, p, { type: 'choose', target: t }, db); if (err) continue;
      const v = score(c, p, db); if (v > bv) { bv = v; best = { type: 'choose', target: t }; }
    }
    return best;
  }

  function bestPlay(s, p, db) {
    const P = s.players[p];
    const ids = P.hand.concat(P.reserve.filter(id => !s.cards[id].ex));
    const base = score(s, p, db);
    let best = null, bv = -Infinity;
    for (const id of ids) for (const e of ['H', 'C']) {
      const c = clone(s); const before = E.readyMana(c.players[p]);
      const err = E.act(c, p, { type: 'play', id, e }, db); if (err) continue;
      const spent = before - E.readyMana(c.players[p]);
      // priorité aux cartes chères (dépenser son mana), puis au gain sur le plateau
      const v = spent * 6 + (score(c, p, db) - base) + (P.reserve.includes(id) ? -1 : 0);
      if (v > bv) { bv = v; best = { type: 'play', id, e }; }
    }
    return best;
  }

  // Renvoie la prochaine action de l'IA (joueur p), ou null s'il n'a rien à faire
  function next(s, p, db) {
    if (s.winner != null) return null;
    if (s.choices.length) return s.choices[0].p === p ? (bestChoice(s, p, db) || { type: 'choose', target: null }) : null;
    const P = s.players[p]; if (!P) return null;
    switch (s.step) {
      case 'SETUP_MANA': return s.ready[p] ? null : { type: 'toManaMany', ids: manaPick(s, p, db, 3) };
      case 'EXPAND': {
        if (s.ready[p]) return null;
        const maxCost = Math.max(0, ...P.hand.map(id => costOf(s, id, db)));
        if (P.hand.length > 1 && P.mana.length < Math.max(4, Math.min(9, maxCost))) return { type: 'toMana', id: manaPick(s, p, db, 1)[0] };
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
