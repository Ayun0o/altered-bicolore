// Uniques : récupérées à la demande dans la base communautaire Altered-Community/databases (GitHub)
(function (root) {
  'use strict';
  const RAW = 'https://raw.githubusercontent.com/Altered-Community/databases/main/';
  const FAC = ['AX', 'BR', 'LY', 'MU', 'OR', 'YZ'];
  // Nombre de cartes par faction dans le set de base (pour lire « BTG-069-U-5171 »)
  const CORE_COUNTS = { AX: 31, BR: 31, LY: 30, MU: 30, OR: 32, YZ: 31 };
  const clean = t => String(t || '').replace(/\[\]/g, '').replace(/ /g, ' ').trim();

  // Base d'une famille de cartes : ALT_CORE_B_LY_07_C → ALT_CORE_B_LY_07
  const familyOf = r => String(r).replace(/_(C|R1|R2|U_\d+)$/, '');
  const imageRef = r => familyOf(r) + '_R1';   // illustration de la rare (plus travaillée)

  // « BTG-069-U-5171 » → ALT_CORE_B_LY_07_U_5171 (set de base uniquement)
  function parseCode(code) {
    const m = String(code).toUpperCase().replace(/\s/g, '').match(/^(?:BTG-?)?(\d{1,3})-?U-?(\d{1,6})$/);
    if (!m) return null;
    let n = +m[1], f = null;
    for (const k of FAC) { if (n <= CORE_COUNTS[k]) { f = k; break; } n -= CORE_COUNTS[k]; }
    if (!f || n < 1) return null;
    return 'ALT_CORE_B_' + f + '_' + String(n).padStart(2, '0') + '_U_' + (+m[2]);
  }

  function toCard(j) {
    const fr = (j.translations && j.translations['fr-fr']) || j;
    const el = j.elements || {}, efr = fr.elements || el;
    return {
      r: j.reference, u: true, base: imageRef(j.reference),
      n: fr.name || j.name, en: j.name,
      f: j.mainFaction && j.mainFaction.reference, h: j.mainFaction && j.mainFaction.reference,
      s: j.cardSet && j.cardSet.reference, y: 'U', v: 'U',
      t: j.cardType && j.cardType.reference,
      st: (fr.cardSubTypes || []).map(x => x.name), ste: (j.cardSubTypes || []).map(x => x.name),
      c: String(el.MAIN_COST ?? ''), rc: String(el.RECALL_COST ?? ''),
      p: [String(el.FOREST_POWER ?? '0'), String(el.MOUNTAIN_POWER ?? '0'), String(el.OCEAN_POWER ?? '0')],
      x: clean(efr.MAIN_EFFECT), e: clean(efr.ECHO_EFFECT), xe: clean(el.MAIN_EFFECT), ee: clean(el.ECHO_EFFECT)
    };
  }

  const cache = {};
  async function fetchRef(ref) {
    if (cache[ref]) return cache[ref];
    const p = ref.split('_'); // ALT SET B FA NN U n
    const sets = p[1] === 'CORE' ? ['CORE', 'COREKS'] : [p[1]];
    for (const set of sets) {
      const r2 = ref.replace('_' + p[1] + '_', '_' + set + '_');
      const url = RAW + set + '/' + p[3] + '/' + p[4] + '/' + r2 + '.json';
      try { const res = await fetch(url); if (res.ok) { const c = toCard(await res.json()); cache[ref] = c; return c; } } catch (e) { }
    }
    return null;
  }

  // Valide une carte unique reçue (deck d'un adversaire, compte…)
  function sanitize(c) {
    if (!c || typeof c !== 'object' || !/^ALT_[A-Z0-9]+_B_[A-Z]{2}_\d+_U_\d+$/.test(c.r || '')) return null;
    const s = v => String(v ?? '').slice(0, 600);
    return { r: c.r, u: true, base: imageRef(c.r), n: s(c.n).slice(0, 80), en: s(c.en).slice(0, 80), f: FAC.includes(c.f) ? c.f : null, h: FAC.includes(c.f) ? c.f : null, s: s(c.s).slice(0, 12), y: 'U', v: 'U', t: ['CHARACTER', 'SPELL', 'PERMANENT', 'LANDMARK_PERMANENT', 'EXPEDITION_PERMANENT'].includes(c.t) ? c.t : 'CHARACTER', st: (c.st || []).slice(0, 4).map(s), ste: (c.ste || []).slice(0, 4).map(s), c: s(c.c).slice(0, 3), rc: s(c.rc).slice(0, 3), p: (c.p || []).slice(0, 3).map(v => s(v).slice(0, 2)), x: s(c.x), e: s(c.e), xe: s(c.xe), ee: s(c.ee) };
  }

  root.AltUniques = { parseCode, fetchRef, familyOf, imageRef, sanitize };
})(typeof window !== 'undefined' ? window : globalThis);
