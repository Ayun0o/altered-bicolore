/* Formats de construction (table de jeu) : Standard, Bicolore, Sans unique (NUC), Singleton.
   Même règles que le deckbuilder (index.html → analyse). Les limites réglables du deckbuilder (« alt-bi-fmt ») sont reprises si elles existent. */
(function (root) {
  'use strict';
  const DEF = { deck: 39, copies: 3, monoR: 15, monoU: 3, biR: 12, secMax: 12, secR: 3, uP: 1, uS: 1, wheel: ['AX', 'BR', 'MU', 'LY', 'YZ', 'OR'] };
  const LIST = [['std', 'Standard', 'Standard'], ['bi', 'Bicolore', 'Bicolore'], ['nuc', 'Sans unique', 'No Unique'], ['sgl', 'Singleton', 'Singleton']];
  const SHORT = { std: 'Std', bi: 'Bi', nuc: 'NUC', sgl: 'Single' };
  function conf() { let f = null; try { f = JSON.parse(localStorage.getItem('alt-bi-fmt') || 'null'); } catch (e) { } const o = Object.assign({}, DEF); if (f && typeof f === 'object') { for (const k of Object.keys(DEF)) if (k !== 'wheel' && Number.isFinite(+f[k])) o[k] = +f[k]; if (Array.isArray(f.wheel) && f.wheel.length === 6) o.wheel = f.wheel.slice(); } return o; }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const rcls = (r, c) => /_E$/.test(r) ? 'E' : c.u ? 'U' : c.y;
  // deck : { hero, sec, cards: { ref: n } } (les uniques sont des refs de cards marquées u dans db)
  function check(deck, db, fm, en) {
    const F = conf(), L = (fr, e) => en ? e : fr, errs = [];
    const hero = deck && db[deck.hero]; if (!hero) return { ok: false, errs: [L('Pas de héros.', 'No hero.')] };
    const P = hero.f, S = fm === 'bi' ? (deck.sec || '') : '';
    let total = 0, rares = 0, ex = 0, uq = 0, uqS = 0, sec = 0, secR = 0, bad = 0; const names = {}, per = {};
    for (const [r, n0] of Object.entries(deck.cards || {})) { const c = db[r], n = n0 | 0; if (!c || !n || c.t === 'HERO') continue; total += n;
      if (c.u) { uq += n; if (S && c.f === S) uqS += n; } else if (/_E$/.test(r)) ex += n; else if (c.y === 'R') rares += n;
      if (c.f !== P && c.f !== S) bad += n; if (S && c.f === S) { sec += n; if (c.y === 'R' && !c.u && !/_E$/.test(r)) secR += n; }
      const k = norm(c.n); names[k] = (names[k] || 0) + n; const kr = k + '|' + rcls(r, c); per[kr] = (per[kr] || 0) + n; }
    const need = fm === 'sgl' ? 59 : F.deck;
    if (fm === 'sgl' ? (total < 59 || total > 79) : total < need) errs.push(fm === 'sgl' ? L('59 à 79 cartes (' + total + ').', '59 to 79 cards (' + total + ').') : L(need + ' cartes minimum (' + total + ').', 'At least ' + need + ' cards (' + total + ').'));
    if (Object.values(names).some(v => v > F.copies)) errs.push(L(F.copies + ' exemplaires max par nom.', F.copies + ' copies max per name.'));
    if (ex > 3) errs.push(L('3 Exaltées max.', '3 Exalted max.'));
    if (bad) errs.push(L(bad + ' carte(s) hors des factions du deck.', bad + ' card(s) outside the deck’s factions.'));
    if (fm === 'std') { if (rares > F.monoR) errs.push(L(F.monoR + ' rares max.', F.monoR + ' rares max.')); if (uq > F.monoU) errs.push(L(F.monoU + ' uniques max.', F.monoU + ' uniques max.')); }
    if (fm === 'nuc') { if (rares > F.monoR) errs.push(L(F.monoR + ' rares max.', F.monoR + ' rares max.')); if (uq) errs.push(L('Aucune unique.', 'No uniques.')); }
    if (fm === 'sgl') { if (uq) errs.push(L('Aucune unique.', 'No uniques.')); if (Object.values(per).some(v => v > 1)) errs.push(L('1 exemplaire par nom et par rareté.', '1 copy per name and rarity.')); }
    if (fm === 'bi') { const w = F.wheel, i = w.indexOf(P), nb = i < 0 ? [] : [w[(i + 5) % 6], w[(i + 1) % 6]];
      if (!S || !nb.includes(S)) errs.push(L('Faction secondaire voisine sur la roue à choisir.', 'Pick a neighbouring secondary faction on the wheel.'));
      if (rares > F.biR) errs.push(L(F.biR + ' rares max au total.', F.biR + ' rares max in total.'));
      if (sec > F.secMax) errs.push(L(F.secMax + ' cartes secondaires max.', F.secMax + ' secondary cards max.'));
      if (secR > F.secR) errs.push(L(F.secR + ' rares secondaires max.', F.secR + ' secondary rares max.'));
      if (uq > F.uP + F.uS || uqS > F.uS) errs.push(L((F.uP + F.uS) + ' uniques max (' + F.uS + ' secondaire max).', (F.uP + F.uS) + ' uniques max (' + F.uS + ' secondary max).')); }
    return { ok: !errs.length, errs };
  }
  const valid = (deck, db) => LIST.map(x => x[0]).filter(f => check(deck, db, f).ok);
  const name = (k, en) => { const f = LIST.find(x => x[0] === k); return f ? (en ? f[2] : f[1]) : (en ? 'Free' : 'Libre'); };
  root.AltFormats = { LIST, SHORT, check, valid, name };
})(typeof window !== 'undefined' ? window : globalThis);
