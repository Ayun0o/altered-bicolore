// Interface de la table de jeu
(function () {
  'use strict';
  const E = window.AlteredEngine, NET = window.AlteredNet;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  let LANG = 'fr'; try { LANG = localStorage.getItem('alt-bi-lang') === 'en' ? 'en' : 'fr'; } catch (e) { }

  let DRAG = null, PREVZ = null, lastStep = null, STARTERS = [], DB = {}, mode = null, S = null, V = null, me = 0, net = null, sel = null, sideView = 'card', keep = { R: new Set(), L: new Set() }, pick = new Set(), decksUsed = [], names = [];
  const NM = d => d ? (LANG === 'en' ? d.en : d.n) : '?';
  const TX = d => d ? (LANG === 'en' ? d.xe : d.x) : '';
  const TL = { F: 'Forêt', M: 'Montagne', W: 'Eau' };

  // ---------- Lobby ----------
  function decks() { const d = store.get('alt-bi-decks', {}); return Object.entries(d).filter(([k, v]) => v && v.hero && DB[v.hero]); }
  function deckOpts(sel) {
    const L = decks();
    const mine = L.map(([k, v]) => { const n = Object.values(v.cards || {}).reduce((a, b) => a + b, 0); return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(v.name || 'Sans nom') + ' — ' + esc(NM(DB[v.hero])) + ' (' + n + ' cartes)</option>'; }).join('');
    const st = STARTERS.map(s => '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + ' — ' + esc(NM(DB[s.hero])) + '</option>').join('');
    return (mine ? '<optgroup label="Mes decks">' + mine + '</optgroup>' : '') + '<optgroup label="Decks de départ officiels">' + st + '</optgroup>';
  }
  const FC = { AX: '#a0661c', BR: '#c83a35', LY: '#c5487a', MU: '#4f8a1f', OR: '#2f74c0', YZ: '#6c5fcf' };
  const FN = { AX: 'Axiom', BR: 'Bravos', LY: 'Lyra', MU: 'Muna', OR: 'Ordis', YZ: 'Yzmir' };
  function deckList() {
    const all = store.get('alt-bi-decks', {});
    const mine = decks().map(([k, v]) => ({ id: k, name: v.name || 'Sans nom', hero: v.hero, sec: v.sec || '', n: Object.values(v.cards || {}).reduce((a, b) => a + b, 0), g: 'Mes decks' }));
    const st = STARTERS.map(s => ({ id: s.id, name: s.name, hero: s.hero, sec: '', n: 39, g: 'Decks de départ officiels' }));
    return mine.concat(st);
  }
  function dot(f) { return '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + FC[f] + ';flex:none"></span>'; }
  function picker(selId, cur) {
    const L = deckList(); let g = '';
    return '<div style="display:grid;gap:6px">' + L.map(d => {
      const f = DB[d.hero] ? DB[d.hero].f : null; const head = d.g !== g ? '<span class="lbl" style="margin-top:6px">' + esc(d.g) + '</span>' : ''; g = d.g;
      const on = d.id === cur;
      return head + '<button type="button" data-pick="' + esc(selId) + '" data-val="' + esc(d.id) + '" style="display:flex;gap:8px;align-items:center;text-align:left;justify-content:flex-start;' + (on ? 'outline:2px solid ' + (FC[f] || 'var(--acc)') + ';background:var(--soft)' : '') + '">' +
        (f ? dot(f) : '') + (d.sec && FC[d.sec] ? dot(d.sec) : '') +
        '<span style="flex:1"><b>' + esc(d.name) + '</b><br><span class="small"><span style="color:' + (FC[f] || 'inherit') + ';font-weight:600">' + esc(FN[f] || '') + '</span>' + (d.sec && FN[d.sec] ? ' + <span style="color:' + FC[d.sec] + ';font-weight:600">' + FN[d.sec] + '</span>' : '') + ' · ' + esc(NM(DB[d.hero])) + ' · ' + d.n + ' cartes</span></span></button>';
    }).join('') + '</div>';
  }
  function renderPickers() { for (const id of ['pdeck', 'sdeck']) { const box = $(id + 'Pick'); if (box) box.innerHTML = picker(id, $(id).value); } }
  function getDeck(id) {
    const s = STARTERS.find(x => x.id === id); if (s) return { hero: s.hero, cards: s.cards, name: s.name };
    const d = store.get('alt-bi-decks', {})[id]; return d && d.hero ? { hero: d.hero, cards: d.cards || {}, name: d.name } : null;
  }

  async function init() {
    try { const r = await fetch('cards.json'); for (const c of await r.json()) DB[c.r] = c; const rs = await fetch('starters.json'); STARTERS = (await rs.json()).filter(s => DB[s.hero]); } catch (e) { $('lobbyMsg').textContent = 'Impossible de charger les cartes.'; return; }
    const qd = new URLSearchParams(location.search).get('deck');
    if (qd) { try { let s = qd.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const o = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (o && DB[o.h]) { const all = store.get('alt-bi-decks', {}); const cards = {}; for (const [r, n] of Object.entries(o.c || {})) if (DB[r]) cards[r] = Math.max(0, Math.min(9, n | 0));
        const name = String(o.n || 'Deck importé').slice(0, 80); let id = Object.keys(all).find(k => all[k] && all[k].name === name && all[k].hero === o.h);
        id = id || ('d' + Date.now().toString(36)); all[id] = { name, hero: o.h, sec: o.s || '', cards, uniques: Array.isArray(o.u) ? o.u : [], updated: Date.now() };
        store.set('alt-bi-decks', all); store.set('alt-bi-lastdeck', id); } } catch (e) { } history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).get('join') ? '?join=' + new URLSearchParams(location.search).get('join') : '')); }
    $('pname').value = store.get('alt-bi-name', '');
    $('pdeck').innerHTML = deckOpts(store.get('alt-bi-lastdeck', '')); $('sdeck').innerHTML = deckOpts(''); renderPickers();
    document.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; $(b.dataset.pick).value = b.dataset.val; if (b.dataset.pick === 'pdeck') store.set('alt-bi-lastdeck', b.dataset.val); renderPickers(); });
    $('deckNote').textContent = decks().length ? '' : 'Pas encore de deck perso sur ce navigateur : joue avec un deck de départ officiel, ou crée le tien dans le deckbuilder.';
    $('pname').oninput = () => store.set('alt-bi-name', $('pname').value);
    $('pdeck').onchange = () => store.set('alt-bi-lastdeck', $('pdeck').value);
    $('bHost').onclick = startHost; $('bJoin').onclick = () => startJoin($('jcode').value.trim());
    $('bSolo').onclick = startSolo;
    const q = new URLSearchParams(location.search).get('join'); if (q) $('jcode').value = q;
    bindGame();
    const sb = $('statsBox'); if (sb) sb.innerHTML = statsHtml();
  }
  const myName = (def) => ($('pname').value.trim() || def || 'Joueur 1').slice(0, 24);
  function needDeck() { const d = getDeck($('pdeck').value); if (!d) { $('lobbyMsg').innerHTML = '<span class="err">Choisis un deck avec un héros.</span>'; } return d; }

  function startHost() {
    const d = needDeck(); if (!d) return;
    if (typeof Peer === 'undefined') { $('lobbyMsg').innerHTML = '<span class="err">Le module réseau n’a pas pu se charger.</span>'; return; }
    mode = 'host'; me = 0; decksUsed[0] = d; names[0] = myName('Joueur 1');
    S = E.newGame({}); E.addPlayer(S, 0, names[0], d, DB);
    $('lobbyMsg').textContent = 'Création de la partie…';
    net = NET.host(onHostMsg, (st, x) => {
      if (st === 'open') { const link = location.origin + location.pathname + '?join=' + x; $('lobbyMsg').innerHTML = 'Code de la partie : <b style="font-size:20px">' + esc(x) + '</b><br>Envoie ce code (ou ce lien : <a href="' + esc(link) + '">' + esc(link) + '</a>) à ton adversaire. La partie commence dès qu’il rejoint. Garde cette page ouverte.'; showGame(); setConn('En attente de l’adversaire · code ' + x); }
      else if (st === 'peer') setConn('Adversaire connecté');
      else if (st === 'left') setConn('Adversaire déconnecté : il peut revenir avec le même code.');
      else if (st === 'error') { $('lobbyMsg').innerHTML = '<span class="err">' + esc(x) + '</span>'; setConn('Erreur réseau : ' + x); }
    });
  }
  function onHostMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') {
      if (!S.players[1]) { const deck = sanitizeDeck(m.deck); if (!deck) { net.send({ type: 'err', m: 'Deck invalide.' }); return; } decksUsed[1] = deck; names[1] = String(m.name || 'Joueur 2').slice(0, 24); if (names[1] === names[0]) names[1] += ' (2)'; E.addPlayer(S, 1, names[1], deck, DB); E.advance(S, DB); }
      push();
    } else if (m.type === 'act' && m.a && typeof m.a === 'object') {
      const err = applyAct(1, m.a); if (err) net.send({ type: 'err', m: err }); push();
    } else if (m.type === 'undo') { const err = undo(1); if (err) net.send({ type: 'err', m: err }); push();
    } else if (m.type === 'rematch') rematch();
  }
  function sanitizeDeck(d) { if (!d || !DB[d.hero]) return null; const c = {}; let n = 0; for (const [r, k] of Object.entries(d.cards || {})) if (DB[r] && DB[r].t !== 'HERO') { const v = Math.max(0, Math.min(9, k | 0)); if (v) { c[r] = v; n += v; } } return n && n <= 80 ? { hero: d.hero, cards: c } : null; }

  function startJoin(code) {
    const d = needDeck(); if (!d) return;
    if (!/^[A-Za-z0-9]{6}$/.test(code)) { $('lobbyMsg').innerHTML = '<span class="err">Le code fait 6 caractères.</span>'; return; }
    if (typeof Peer === 'undefined') { $('lobbyMsg').innerHTML = '<span class="err">Le module réseau n’a pas pu se charger.</span>'; return; }
    mode = 'guest'; me = 1; $('lobbyMsg').textContent = 'Connexion…';
    net = NET.join(code, m => {
      if (!m) return;
      if (m.type === 'state') { V = m.v; showGame(); render(); }
      else if (m.type === 'err') flash(m.m);
      else if (m.type === 'full') { $('lobbyMsg').innerHTML = '<span class="err">Cette partie a déjà deux joueurs.</span>'; }
    }, (st, x) => {
      if (st === 'connected') { net.send({ type: 'hello', name: myName('Joueur 2'), deck: { hero: d.hero, cards: d.cards } }); setConn('Connecté'); }
      else if (st === 'left') setConn('Connexion perdue avec l’hôte.');
      else if (st === 'error') { $('lobbyMsg').innerHTML = '<span class="err">' + esc(x) + '</span>'; setConn('Erreur : ' + x); }
    });
  }

  function startSolo() {
    const a = needDeck(); if (!a) return; const b = getDeck($('sdeck').value) || a;
    mode = 'solo'; me = 0; decksUsed = [a, b]; names = [myName('Joueur 1'), 'Joueur 2'];
    S = E.newGame({}); E.addPlayer(S, 0, names[0], a, DB); E.addPlayer(S, 1, names[1], b, DB); E.advance(S, DB);
    $('bSwitch').classList.remove('hidden'); setConn('Partie d’essai');
    showGame(); push();
  }
  function rematch() {
    if (mode === 'guest') { net.send({ type: 'rematch' }); return; }
    if (!decksUsed[1]) return;
    S = E.newGame({}); E.addPlayer(S, 0, names[0], decksUsed[0], DB); E.addPlayer(S, 1, names[1], decksUsed[1], DB); E.advance(S, DB); sel = null; hist = []; push();
  }

  let hist = [];
  function applyAct(p, a) { const snap = JSON.stringify(S); const err = E.act(S, p, a, DB); if (!err) { hist.push({ s: snap, by: p }); if (hist.length > 40) hist.shift(); } return err; }
  function undo(p) {
    const last = hist[hist.length - 1]; if (!last) return 'Rien à annuler.';
    if (mode !== 'solo' && last.by !== p) return 'La dernière action est celle de l’adversaire : il doit l’annuler lui-même.';
    hist.pop(); S = JSON.parse(last.s); S.log.push({ d: S.day, m: (S.players[p] ? S.players[p].name : '?') + ' annule sa dernière action.' }); return null;
  }
  function dispatch(a) {
    if (mode === 'guest') { net.send({ type: 'act', a }); return; }
    const err = applyAct(me, a); if (err) flash(err); push();
  }
  function push() {
    if (mode === 'host' && net && S.players[1]) net.send({ type: 'state', v: E.view(S, 1) });
    V = E.view(S, me); render();
  }
  function showGame() { $('lobby').classList.add('hidden'); $('game').classList.remove('hidden'); if (!V && S) V = E.view(S, me); render(); }
  function setConn(t) { $('conn').textContent = t; }
  let flashT; function flash(m) { const p = $('prompt'); p.classList.remove('hidden'); p.innerHTML = '<span class="err">' + esc(m) + '</span>'; clearTimeout(flashT); flashT = setTimeout(render, 2500); }

  // ---------- Rendu ----------
  let TOKENS = [];
  fetch('tokens.json').then(r => r.json()).then(t => { TOKENS = Array.isArray(t) ? t : []; }).catch(() => { });
  const tokName = n => { const t = TOKENS.find(x => x.en.toLowerCase() === String(n).toLowerCase()); return t ? (LANG === 'en' ? t.en : t.fr) : n; };
  const card = id => V.cards[id];
  const data = c => c && (c.tok ? null : DB[c.ref]);
  const LMREF = { aerolith: 'ALT_CYCLONE_B_NE_03_C', manaseed: 'ALT_DUSTER_B_NE_04_C' };
  const tokRef = n => { const k = String(n).toLowerCase(); if (LMREF[k]) return LMREF[k]; const t = TOKENS.find(x => x.en.toLowerCase() === k); return t && t.r; };
  function img(c) {
    if (c.tok) { const r = tokRef(c.tok.n); if (r) return '<img loading="lazy" draggable="false" alt="' + esc(tokName(c.tok.n)) + '" src="img/tok/' + r + '_' + LANG + '.webp">' + (c.tok.p ? '<span class="tokst">' + c.tok.p.join('/') + '</span>' : ''); }
    return imgOld(c);
  }
  function imgOld(c) { return c.tok ? '<div class="tok"><b>' + esc(tokName(c.tok.n)) + '</b><span>' + c.tok.p.join(' / ') + '</span><span class="note">jeton</span></div>' : '<img loading="lazy" draggable="false" alt="' + esc(NM(DB[c.ref])) + '" src="img/' + LANG + '/' + encodeURIComponent(c.ref) + '.webp">'; }
  const CH = () => V && V.choices && V.choices[0];
  function isTarget(id) {
    const ch = CH(); if (!ch || ch.p !== me) return false;
    const L = locate(id); if (!L) return false; const c = card(id);
    if (ch.grp && ((V.picked || {})[ch.grp] || []).includes(id)) return false;
    if (ch.kind === 'reserve') return L.z === 'reserve';
    if (ch.kind === 'hand') return L.z === 'hand' && L.p === me;
    const perm = !c.tok && /PERMANENT/.test((DB[c.ref] || {}).t || '');
    if (ch.kind === 'perm') return perm && (L.z === 'exp' || L.z === 'lm') && (ch.max == null || E.num(DB[c.ref].c) <= ch.max);
    if (ch.kind === 'any') return L.z === 'exp' || L.z === 'lm';
    if (ch.kind === 'ownchar') { const src = locate(ch.src); return L.z === 'exp' && L.p === me && (!src || src.z !== 'exp' || src.e === L.e); }
    const isChar = c.tok ? !c.tok.lm : (DB[c.ref] || {}).t === 'CHARACTER';
    if (ch.kind === 'mychar') return L.z === 'exp' && L.p === me && isChar && (ch.max == null || c.tok || E.num(DB[c.ref].c) <= ch.max);
    if (ch.kind === 'charres') return (L.z === 'exp' || L.z === 'reserve') && isChar;
    if (ch.kind === 'myres') return L.z === 'reserve' && L.p === me && (!ch.notSelf || id !== ch.src);
    if (ch.kind === 'reschar') return L.z === 'reserve' && isChar;
    if (ch.kind === 'myctr') return L.p === me && c.ctr && Object.values(c.ctr).some(v => v >= (ch.act.n || 1));
    if (ch.fb && !(c.fleeting || c.boost > 0)) return false;
    if (ch.tokOnly && !(c.tok && !c.tok.lm)) return false;
    if (ch.exOnly && !c.ex) return false;
    if (ch.st1 && !c[ch.st1]) return false;
    if (ch.facing && !(L.z === 'exp' && L.p !== me)) return false;
    if (ch.tf && !c.tok && (DB[c.ref] || {}).t !== ch.tf) return false;
    if (ch.kind === 'oppany') return L.p !== me && (L.z === 'exp' || L.z === 'lm');
    if (ch.kind === 'readyable') return (L.z === 'reserve' && c.ex) || ((L.z === 'exp' || L.z === 'lm') && c.ex);
    if (ch.kind === 'augm' || ch.kind === 'anyres') return ['exp', 'reserve', 'lm'].includes(L.z) && (c.boost > 0 || (c.ctr && Object.values(c.ctr).some(v => v > 0)));
    if (ch.maxStat != null) { const pw = c.tok ? c.tok.p : (DB[c.ref] || {}).p || [0, 0, 0]; if (pw.some(x => E.num(x) + c.boost > ch.maxStat)) return false; }
    if (ch.kind === 'myperm') return L.p === me && (L.z === 'exp' || L.z === 'lm') && !c.tok && /PERMANENT/.test((DB[c.ref] || {}).t || '');
    if (ch.min != null && !c.tok && E.num((DB[c.ref] || {}).c) < ch.min) return false;
    if (ch.kind === 'char' && ch.status && !(c.fleeting || c.anchored || c.asleep)) return false;
    if (ch.kind === 'char') return L.z === 'exp' && (c.tok || (DB[c.ref] || {}).t === 'CHARACTER') && (ch.max == null || c.tok || E.num(DB[c.ref].c) <= ch.max);
    return false;
  }
  let GLOW = new Set();
  function computeGlow() {
    GLOW = new Set(); if (!V) return;
    const key = V.pending === 'dusk' || V.step === 'DUSK' ? 'at dusk' : (V.pending === 'night' || V.step === 'NIGHT') ? 'at night' : (V.step === 'NOON' || V.pending === 'noon' || (V.step === 'AFTERNOON' && !V.played)) ? 'at noon' : null;
    if (!key) return;
    for (const X of V.players) { if (!X) continue; for (const id of [X.hero, ...X.lm, ...X.exp.H, ...X.exp.C, ...X.reserve]) { const c = id && V.cards[id]; const d = c && !c.tok && DB[c.ref]; if (d && ((d.xe || '') + ' ' + (d.ee || '')).toLowerCase().includes(key)) GLOW.add(id); } }
  }
  function cardEl(id) {
    const c = card(id); if (!c) return '<div class="c"><div class="tok">?</div></div>';
    const b = []; if (c.boost) b.push('+' + c.boost); if (c.ctr) for (const [k, v] of Object.entries(c.ctr)) if (v) b.push(v + ' ' + k);
    let stats = '';
    { const L = locate(id), d = DB[c.ref] || {}; const isChar = c.tok ? !c.tok.lm : d.t === 'CHARACTER';
      if (L && L.z === 'exp' && isChar) { const pw = c.tok ? c.tok.p : (d.p || []); stats = '<div class="pw">' + ['F', 'M', 'W'].map((k, i) => { const base = E.num(pw[i]); const v = base + (c.boost || 0); return '<b class="p' + k + (c.boost ? ' up' : '') + (c.asleep ? ' zz' : '') + '">' + v + '</b>'; }).join('') + '</div>'; } }
    const st = []; if (c.fleeting) st.push(['<img src="img/ui/scan/s_fleeting.svg" alt="">', 'Fugace']); if (c.anchored) st.push(['<img src="img/ui/scan/s_anchored.svg" alt="">', 'Ancré']); if (c.asleep) st.push(['<img src="img/ui/scan/s_asleep.svg" alt="">', 'Endormi']); if (c.completed) st.push(['🏅', 'Accomplie']);
    const k = pick.has(id), tossed = keep.R.has(id) || keep.L.has(id);
    const P = V.players[me]; const drag = P && c.owner === me && (P.hand.includes(id) || P.reserve.includes(id));
    return '<div class="c' + (c.ex ? ' ex' : '') + (sel === id || k ? ' sel' : '') + (tossed ? ' toss' : '') + (isTarget(id) ? ' tgt' : '') + (GLOW.has(id) ? ' trig' : '') + '" data-id="' + esc(id) + '"' + (drag ? ' draggable="true"' : '') + '>' + img(c) + stats + (st.length ? '<div class="st">' + st.map(x => '<i title="' + x[1] + '">' + x[0] + '</i>').join('') + '</div>' : '') + (b.length ? '<div class="bd">' + b.map(x => '<b' + (/^\+/.test(x) ? ' class="bst"' : '') + '>' + esc(x) + '</b>').join('') + '</div>' : '') + '</div>';
  }
  const cardsEl = ids => ids.map(cardEl).join('') || '<span class="note empty">—</span>';
  const PH = { SETUP_MANA: 'Mise en place', MORNING: 'Matin', EXPAND: 'Matin', NOON: 'Midi', AFTERNOON: 'Après-midi', DUSK: 'Crépuscule', NIGHT: 'Nuit', CLEANUP: 'Nuit', END: 'Fin de partie' };
  function manaIcon(X, mine) {
    const r = X.mana.filter(m => !m.ex).length;
    return '<div class="manabox' + (mine ? ' mine' : '') + '" title="Mana disponible / total"><div class="manaico"' + (mine ? ' data-manaview="1" title="Voir les cartes en mana"' : '') + '><i class="spk"></i><i class="spk s2"></i><i class="spk s3"></i><i class="spk s4"></i><i class="streak"></i><b>' + r + '</b><span>/' + X.mana.length + '</span></div>' +
      (mine ? '<div class="orbs">' + X.mana.map((m, i) => '<span class="orb' + (m.ex ? ' ex' : '') + '" data-orb="' + i + '" title="Épuiser / redresser"></span>').join('') + '</div>' : '') + '</div>';
  }
  function totPills(t, terr, winT, base) {
    return ['F', 'M', 'W'].map(k => { const ch = base && base[k] !== t[k]; return '<span class="pill p' + k + (terr.includes(k) ? ' act' : ' off') + (winT.includes(k) ? ' win' : '') + (ch ? ' chg' : '') + '" title="' + TL[k] + (terr.includes(k) ? ' — compte dans la région actuelle' : ' — ne compte pas ici') + '">' + (ch ? '<s>' + base[k] + '</s>' : '') + t[k] + '</span>'; }).join('');
  }
  // Aperçu des scores si on joue la carte « id » dans l'expédition « e »
  function previewPlay(id, e) {
    let S; try { S = JSON.parse(JSON.stringify(V)); } catch (x) { return; }
    for (const P of S.players) if (P && P.deck) P.deck = P.deck.filter(d => S.cards[d]);
    if (S.step !== 'AFTERNOON') return; S.turn = me; S.choices = []; S.log = [];
    try { const r = E.act(S, me, { type: 'play', id, e, cost: 0 }, DB); if (typeof r === 'string') return; } catch (x) { return; }
    for (let p = 0; p < 2; p++) for (const ex of ['H', 'C']) {
      const el = document.getElementById('tot-' + p + ex); if (!el || !S.players[p]) continue;
      const X = S.players[p], o = 1 - p, t = E.totals(S, p, ex, DB), ot = E.totals(S, o, ex, DB), b = E.totals(V, p, ex, DB);
      const reg = S.adv[X.pos[ex]]; const terr = reg ? reg.terr : []; const asc = X.asc && X.asc[ex];
      const winT = terr.filter(k => (t[k] > ot[k] || (asc && t[k] === ot[k])) && t[k] > 0);
      if (!el.classList.contains('prev')) el.dataset.orig = el.innerHTML; el.innerHTML = totPills(t, terr, winT, b); el.classList.add('prev');
    }
  }
  function clearPreview() { document.querySelectorAll('.tot.prev').forEach(el => { el.innerHTML = el.dataset.orig || el.innerHTML; el.classList.remove('prev'); }); }
  function expRow(p) {
    const X = V.players[p], o = 1 - p, mine = p === me;
    const zone = e => {
      const t = E.totals(V, p, e, DB), ot = V.players[o] ? E.totals(V, o, e, DB) : { F: 0, M: 0, W: 0 };
      const reg = V.adv[X.pos[e]]; const terr = reg ? reg.terr : [];
      const asc = X.asc && X.asc[e];
      const winT = V.tie ? [] : terr.filter(k => (t[k] > ot[k] || (asc && t[k] === ot[k])) && t[k] > 0);
      const blocked = X.exp[e].some(id => { const c = card(id); return c && !c.tok && !c.asleep && E.kw(DB[c.ref]).defender; });
      const will = winT.length && !blocked;
      const tot = totPills(t, terr, winT);
      const badge = V.tie ? '' : (winT.length && blocked ? '<span class="nowill" title="Bloquée par un Défenseur">🛡</span>' : '');
      return '<div class="zone exp e' + e + (mine ? ' mine' : '') + (will ? ' willz' : '') + '"' + (mine ? ' data-drop="' + e + '"' : '') + '><h3 class="xh"><span class="xstats"><span class="tot" id="tot-' + p + e + '">' + tot + '</span>' + badge + (asc ? '<span class="asc" title="Expédition élevée">⇑</span>' : '') + '</span><span class="xname">' + (e === 'H' ? 'Héros' : 'Compagnon') + '</span><span class="xarr"><button class="mini" data-pos="' + p + ',' + e + ',' + (e === 'C' ? 1 : -1) + '" title="' + (e === 'C' ? 'Avancer' : 'Reculer') + ' l’expédition">◀</button><button class="mini" data-pos="' + p + ',' + e + ',' + (e === 'C' ? -1 : 1) + '" title="' + (e === 'C' ? 'Reculer' : 'Avancer') + ' l’expédition">▶</button></span></h3><div class="cards">' + cardsEl(X.exp[e]) + '</div></div>';
    };
    const hn = '<span class="hname" style="color:' + (FC[(DB[(card(X.hero) || {}).ref] || {}).f] || 'inherit') + '">' + esc(X.name) + '</span>';
    return zone('H') + '<div class="herocol' + (mine ? ' mine' : '') + '">' + (mine ? hn : '') + '<div class="herowrap">' + (X.hero ? cardEl(X.hero) : '') + '<span class="pass' + (V.passed && V.passed[p] ? ' done' : '') + '" title="' + (V.passed && V.passed[p] ? 'A passé : ne joue plus de cartes aujourd’hui' : 'Peut encore jouer des cartes') + '"><img class="pf" src="img/ui/scan/pass_blue.webp" alt=""><img class="pb" src="img/ui/scan/pass_gold.webp" alt=""></span>' + '</div>' + (mine ? '' : hn) + '</div>' + zone('C');
  }
  const slots = n => n > 0 ? '<i class="slot"></i>'.repeat(Math.min(n, 4)) : '';
  const backs = (n, cls) => { n = Math.min(n, 12); return Array.from({ length: n }, (x, i) => '<i class="' + cls + '" style="transform:rotate(' + ((i - (n - 1) / 2) * 6) + 'deg)"></i>').join(''); };
  function strip(X, p) {
    const top = X.discard[X.discard.length - 1];
    const res = '<div class="sres"><span class="lbl">Réserve (max ' + X.rl + ')</span><div class="cards rz">' + (X.reserve.length ? cardsEl(X.reserve) : '') + slots(X.rl - X.reserve.length) + '</div></div>';
    const lm = '<div class="slm"><span class="lbl">Repères (max ' + X.ll + ')</span><div class="cards rz">' + (X.lm.length ? cardsEl(X.lm) : '') + slots(X.ll - X.lm.length) + '</div></div>';
    const disc = '<div class="discz" data-disc="' + p + '" title="Voir la défausse"><span class="lbl">Défausse (' + X.discard.length + ')</span><div class="cards rz">' + (top ? cardEl(top) : '<i class="slot"></i>') + '</div></div>';
    const deck = '<div class="deckz"><span class="lbl">Deck</span><div class="deckpile" title="Cartes restantes dans le deck"><b>' + (X.deckCount || 0) + '</b></div></div>';
    const mid = p !== me ? '<div class="ofan" title="Cartes en main de l’adversaire : ' + (X.handCount || 0) + '">' + backs(X.handCount || 0, 'fback') + '</div>' : '<div></div>';
    return '<div class="strip2"><div class="sL">' + deck + res + '</div>' + mid + '<div class="sR">' + lm + disc + '</div></div>';
  }

  const SH = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 6l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 14.2 8.8 15.9l.6-3.6-2.6-2.5 3.6-.5z" fill="#fff"/></svg>';
  const PAW = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" fill="currentColor"/><g fill="#fff"><ellipse cx="12" cy="15.5" rx="4" ry="3.2"/><circle cx="7" cy="10.5" r="1.8"/><circle cx="10.2" cy="7.5" r="1.8"/><circle cx="13.8" cy="7.5" r="1.8"/><circle cx="17" cy="10.5" r="1.8"/></g></svg>';
  const MK_SCAN = { YZ: 1, MU: 1, OR: 1, AX: 1, BR: 1, LY: 1 };
  function marker(p, e) { const X = V.players[p]; const f = (DB[(card(X.hero) || {}).ref] || {}).f;
    if (MK_SCAN[f]) return '<span class="mk3 ' + (p === me ? 'me' : 'opp') + '" title="' + esc(X.name) + ' — expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + '"><img src="img/ui/scan/m_' + e + '_' + f + '.webp" alt=""><i>' + (p === me ? 'moi' : 'adv') + '</i></span>';
    return '<span class="mk2 ' + (p === me ? 'me' : 'opp') + '" style="color:' + (p === me ? '#22c3d6' : '#e0413a') + '" title="' + esc(X.name) + ' — expédition ' + (e === 'H' ? 'Héros' : 'Compagnon') + '">' + (e === 'H' ? SH : PAW) + '<i>' + (p === me ? 'moi' : 'adv') + '</i></span>'; }
  function arena() {
    const sum = p => { const a = E.totals(V, p, 'H', DB), b = E.totals(V, p, 'C', DB); return { F: a.F + b.F, M: a.M + b.M, W: a.W + b.W }; };
    const A = sum(me), B = sum(1 - me); let a = 0, b = 0; ['F', 'M', 'W'].forEach(t => { if (A[t] > B[t]) a++; else if (B[t] > A[t]) b++; });
    const col = (t) => '<div class="half"><div class="bgs"><span style="background-image:url(img/ui/' + ({ F: 'forest', M: 'mountain', W: 'water' })[t] + '.svg)"></span></div><b class="arn">' + TL[t] + '</b><span class="arv ' + (A[t] > B[t] ? 'me' : B[t] > A[t] ? 'opp' : '') + '">Toi ' + A[t] + ' — ' + B[t] + ' Adv</span></div>';
    return '<div class="advcard" style="grid-column:1/-1"><span class="lab">Arène — départage : la somme de tes deux expéditions par terrain. Tu gagnes ' + a + ' terrain(s), l’adversaire ' + b + '.</span><div class="halves" style="grid-template-columns:1fr 1fr 1fr">' + col('F') + col('M') + col('W') + '</div></div>';
  }
  function track() {
    if (V.tie) return arena();
    // Une région : jetons de l'adversaire en haut, les miens en bas (comme sur BGA)
    const zone = (i, cls) => {
      const r = V.adv[i], top = [], bot = [];
      V.players.forEach((X, p) => { if (!X) return; ['H', 'C'].forEach(e => { if (X.pos[e] === i) (p === me ? bot : top).push(marker(p, e)); }); });
      const here = top.length || bot.length;
      return '<div class="reg ' + cls + (here ? ' here' : '') + '" title="' + (r.up ? r.terr.map(t => TL[t]).join(' + ') : 'Région face cachée') + '"><div class="mko">' + top.join('') + '</div><div class="mkm">' + bot.join('') + '</div></div>';
    };
    const tcard = i => {
      const a = V.adv[i], b = V.adv[i + 1], up = a.up || b.up;
      const singleRight = a.terr.length > 1, key = (singleRight ? b : a).terr[0];
      return '<div class="tcard' + (up ? '' : ' down') + '"><div class="tcimg' + (up && singleRight ? ' flip' : '') + '" style="background-image:url(img/ui/scan/' + (up ? 'card_t_' + key : 'card_back') + '.webp)"></div>' + zone(i, 'L') + zone(i + 1, 'R') + '</div>';
    };
    return '<div class="tcard start"><div class="tcimg" style="background-image:url(img/ui/scan/card_start_H.webp)"></div>' + zone(0, 'S Sh') + '</div>' +
      [1, 3, 5].map(tcard).join('') +
      '<div class="tcard start"><div class="tcimg" style="background-image:url(img/ui/scan/card_start_C.webp)"></div>' + zone(7, 'S Sc') + '</div>';
  }
  function logLine(m) {
    let cls = 'lg';
    if (/^Jour \d+/.test(m)) cls += ' day';
    else if (/^(Matin|Midi|Après-midi|Crépuscule|Nuit|Arène|Fin de partie|🏆)/.test(m)) cls += ' phase';
    else if (/^\s*→/.test(m)) cls += ' fx';
    else if (/^🎲/.test(m)) cls += ' dice';
    let t = esc(m);
    const names = V.players.map((X, p) => X ? [esc(X.name), p] : null).filter(Boolean).sort((a, b) => b[0].length - a[0].length);
    const ph = []; names.forEach(([n, p], i) => { if (!n) return; t = t.split(n).join('\u0000' + i + '\u0000'); ph[i] = '<b class="' + (p === me ? 'who-me' : 'who-op') + '">' + n + '</b>'; });
    t = t.replace(/\u0000(\d+)\u0000/g, (x, i) => ph[+i]);
    if (/^\s*→/.test(m)) t = t.replace(/^\s*→\s*/, '');
    const mine = V.players[me] && m.indexOf(V.players[me].name) === 0, theirs = V.players[1 - me] && m.indexOf(V.players[1 - me].name) === 0;
    if (cls === 'lg') cls += mine ? ' me' : theirs ? ' op' : '';
    return '<div class="' + cls + '">' + t + '</div>';
  }
  // ---------- Statistiques (enregistrées sur cet appareil) ----------
  let statDone = null;
  function recordStats() {
    if (!V || V.step !== 'END' || V.winner == null || mode === 'solo') return;
    const key = (V.players.map(X => X && X.name).join('|')) + '#' + V.day + '#' + V.log.length; if (statDone === key) return; statDone = key;
    const P = V.players[me], O = V.players[1 - me]; if (!P || !O) return;
    const fac = X => (DB[(card(X.hero) || {}).ref] || {}).f || '?', hero = X => NM(DB[(card(X.hero) || {}).ref] || {}) || '?';
    const st = store.get('alt-bi-stats', { games: [] }); st.games = st.games || [];
    st.games.push({ t: Date.now(), win: V.winner === me, me: fac(P), heroMe: hero(P), deck: (decksUsed[me] || {}).name || hero(P), vs: fac(O), heroVs: hero(O), opp: O.name, days: V.day });
    if (st.games.length > 500) st.games = st.games.slice(-500);
    store.set('alt-bi-stats', st);
  }
  function statsHtml() {
    const g = (store.get('alt-bi-stats', { games: [] }).games || []); if (!g.length) return '<p class="note">Aucune partie en ligne terminée pour l’instant. Les résultats s’enregistreront ici automatiquement.</p>';
    const w = g.filter(x => x.win).length, pct = n => Math.round(100 * n);
    const by = (k) => { const m = {}; g.forEach(x => { const v = x[k]; m[v] = m[v] || [0, 0]; m[v][0]++; if (x.win) m[v][1]++; }); return Object.entries(m).sort((a, b) => b[1][0] - a[1][0]); };
    const row = (lab, n, v, col) => '<tr><td>' + (col ? '<span class="sdot" style="background:' + col + '"></span>' : '') + esc(lab) + '</td><td>' + n + '</td><td>' + v + ' – ' + (n - v) + '</td><td><b>' + pct(v / n) + ' %</b></td></tr>';
    const FN = { AX: 'Axiom', BR: 'Bravos', LY: 'Lyra', MU: 'Muna', OR: 'Ordis', YZ: 'Yzmir' };
    const tbl = (t, rows) => '<h3 class="sth">' + t + '</h3><table class="stt"><tr><th></th><th>Parties</th><th>V – D</th><th>Victoires</th></tr>' + rows + '</table>';
    return '<div class="stsum"><b>' + g.length + '</b> parties · <b>' + w + '</b> victoires · <b>' + (g.length - w) + '</b> défaites · <b>' + pct(w / g.length) + ' %</b></div>' +
      tbl('Avec ma faction', by('me').map(([k, v]) => row(FN[k] || k, v[0], v[1], FC[k])).join('')) +
      tbl('Contre la faction', by('vs').map(([k, v]) => row(FN[k] || k, v[0], v[1], FC[k])).join('')) +
      tbl('Par deck', by('deck').map(([k, v]) => row(k, v[0], v[1])).join('')) +
      '<h3 class="sth">Dernières parties</h3>' + g.slice(-8).reverse().map(x => '<div class="stlast ' + (x.win ? 'w' : 'l') + '">' + (x.win ? 'Victoire' : 'Défaite') + ' · ' + esc(x.heroMe) + ' contre ' + esc(x.heroVs) + ' (' + esc(x.opp) + ') · jour ' + x.days + '</div>').join('');
  }
  function render() {
    if (!V) return;
    if (V.step !== lastStep) { pick = new Set(); lastStep = V.step; }
    computeGlow();
    const P = V.players[me], O = V.players[1 - me];
    $('phase').textContent = 'Jour ' + V.day + ' · ' + (PH[V.step] || V.step) + (V.tie ? ' · Arène' : '');
    $('turnInfo').textContent = !O ? 'En attente du deuxième joueur…' : 'Premier joueur : ' + V.players[V.first].name + (V.step === 'AFTERNOON' ? ' · au tour de ' + V.players[V.turn].name : '');
    $('oppInfo').innerHTML = O ? '<b style="color:' + (FC[(DB[(card(O.hero) || {}).ref] || {}).f] || 'inherit') + '">' + esc(O.name) + '</b> · main ' + (O.handCount || 0) + ' · deck ' + (O.deckCount || 0) + ' · défausse ' + O.discard.length : 'En attente de l’adversaire…';
    $('oppMana').innerHTML = O ? manaIcon(O, false) : '';
    $('oppStrip').innerHTML = O ? strip(O, 1 - me) : '';
    $('oppExps').innerHTML = O ? expRow(1 - me) : '';
    $('adv').innerHTML = track();
    $('myExps').innerHTML = P ? expRow(me) : '';
    $('myStrip').innerHTML = P ? strip(P, me) : '';
    $('myInfo').innerHTML = '';
    $('myMana').innerHTML = P ? manaIcon(P, true) : '';
    $('hand').innerHTML = P ? cardsEl(P.hand) : '';
    $('log').innerHTML = V.log.slice().reverse().slice(0, 80).map(l => logLine(l.m)).join('');
    const fm = P && (DB[(card(P.hero) || {}).ref] || {}).f, fo = O && (DB[(card(O.hero) || {}).ref] || {}).f;
    document.body.style.background = 'var(--bg)';
    const mainEl = document.querySelector('#game .main'); if (mainEl) mainEl.style.background = 'linear-gradient(to bottom,' + (fo ? FC[fo] + '30' : 'transparent') + ' 0%,' + (fo ? FC[fo] + '99' : 'transparent') + ' 26%,transparent 46%,transparent 54%,' + (fm ? FC[fm] + '99' : 'transparent') + ' 74%,' + (fm ? FC[fm] + '30' : 'transparent') + ' 100%),var(--bg)';
    renderPrompt(P, O); renderSide();
    animate(); recordStats();
  }
  // Petites animations non bloquantes : carte posée, boosts / statuts qui tombent sur la carte, dé lancé
  let SNAP = null, LOGN = 0;
  function animate() {
    const cur = {};
    for (const id in V.cards) { const c = V.cards[id], L = locate(id); if (!L) continue; cur[id] = { z: L.z, b: c.boost || 0, st: (c.fleeting ? 'f' : '') + (c.anchored ? 'a' : '') + (c.asleep ? 's' : '') + (c.completed ? 'c' : ''), ct: c.ctr ? Object.values(c.ctr).reduce((a, v) => a + v, 0) : 0 }; }
    if (SNAP) {
      document.querySelectorAll('#game .main .c[data-id]').forEach(el => {
        const id = el.dataset.id, n = cur[id], o = SNAP[id]; if (!n || el.closest('.hand')) return;
        if ((!o && (n.z === 'exp' || n.z === 'lm')) || (o && o.z !== n.z && ['exp', 'lm', 'reserve'].includes(n.z))) el.classList.add('landed');
        if (o && n.b > o.b) { const b = el.querySelector('.bd b.bst'); if (b) b.classList.add('drop'); }
        if (o && n.ct > o.ct) el.querySelectorAll('.bd b:not(.bst)').forEach(b => b.classList.add('drop'));
        if (o && n.st !== o.st) { const T = { f: 'Fugace', a: 'Ancré', s: 'Endormi', c: 'Accomplie' }; [...n.st].filter(k => !o.st.includes(k)).forEach((k, i) => { const it = el.querySelector('.st i[title="' + T[k] + '"]'); if (it) { it.style.animationDelay = (i * 90) + 'ms'; it.classList.add('drop'); } }); }
      });
    }
    SNAP = cur;
    if (V.log.length < LOGN) LOGN = V.log.length;
    const fresh = V.log.slice(LOGN); LOGN = V.log.length;
    fresh.filter(l => /🎲/.test(l.m)).slice(-3).forEach((l, i) => { const m = l.m.match(/🎲\s*(.+?) lance un dé : (\d)/); if (m) setTimeout(() => showDie(+m[2], m[1]), i * 450); });
  }
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function showDie(n, who) {
    const d = document.createElement('div'); d.className = 'diefx';
    d.innerHTML = '<div class="die">' + Array.from({ length: 9 }, (x, i) => '<i' + (PIPS[n].includes(i) ? ' class="on"' : '') + '></i>').join('') + '</div><span>' + esc(who) + ' · ' + n + '</span>';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
  }
  function renderPrompt(P, O) {
    const pr = $('prompt'); let h = '';
    if (!O || !P) { pr.innerHTML = '<span class="note">En attente de l’adversaire…</span>'; return; }
    const r = V.ready[me], ch = CH();
    if (ch) {
      if (ch.p !== me) h = 'L’adversaire fait un choix…';
      else {
        h = '<b>' + esc(ch.label) + '</b>';
        if (ch.kind === 'exp') h += '<div class="row"><button class="pri" data-choose="H">Expédition Héros</button><button class="pri" data-choose="C">Expédition Compagnon</button></div>';
        else if (ch.kind === 'option') h += '<div style="display:grid;gap:5px">' + ch.opts.map((o, i) => '<button class="pri" style="text-align:left" data-choose="' + i + '">' + esc(o.label) + '</button>').join('') + '</div>';
        else if (ch.kind === 'anyexp') h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px"><button class="pri" data-choose="' + me + 'H">Mon Héros</button><button class="pri" data-choose="' + me + 'C">Mon Compagnon</button><button data-choose="' + (1 - me) + 'H">Héros adverse</button><button data-choose="' + (1 - me) + 'C">Compagnon adverse</button></div>';
        else if (ch.kind === 'yesno') h += '<div class="row"><button class="pri" data-choose="yes">Oui</button><button data-choose="no">Non</button></div>';
        else h += '<div class="note">Clique une carte en surbrillance.</div>' + (ch.opt ? '<div class="row"><button data-choose="none">Ne rien choisir</button></div>' : '');
      }
    }
    else if (V.step === 'END') h = '<b>' + esc(V.players[V.winner].name) + ' gagne la partie !</b><div class="row"><button class="pri" data-do="rematch">Revanche</button></div>';
    else if (V.step === 'SETUP_MANA') { const need = 3 - P.mana.length; h = r ? 'En attente de l’adversaire…' : 'Mise en place : <b>clique ' + need + ' cartes de ta main</b> pour ton mana (' + pick.size + '/' + need + ').<div class="row"><button class="pri" data-do="mana"' + (pick.size !== need ? ' disabled' : '') + '>Valider</button></div>'; }
    else if (V.step === 'EXPAND') h = r ? 'En attente de l’adversaire…' : 'Matin : <b>clique une carte de ta main</b> pour la mettre en mana (facultatif).<div class="row"><button class="pri" data-do="mana">' + (pick.size ? 'Mettre en mana' : 'Ne rien mettre') + '</button></div>';
    else if (V.pending && ['noon', 'dusk', 'night'].includes(V.pending)) h = r ? 'En attente de l’adversaire…' : ({ noon: 'Midi', dusk: 'Crépuscule', night: 'Nuit' })[V.pending] + ' : des effets sont à appliquer à la main.<div class="row"><button class="pri" data-do="ready">Continuer</button></div>';
    else if (V.step === 'AFTERNOON') h = V.turn === me ? '<b>À toi de jouer.</b> Glisse une carte sur une expédition, ou clique-la puis clique l’expédition.<div class="row">' + (V.inRush === me ? '<button class="pri" data-act=\'{"type":"skipRush"}\'>Ne rien jouer de plus</button>' : '<button class="pri" data-do="pass">Passer</button>') + '</div>' + (V.passed[1 - me] ? '<div class="note">L’adversaire a passé : joue autant de cartes que tu veux.</div>' : '') : (V.passed[me] ? 'Tu as passé. L’adversaire termine sa journée…' : 'Tour de l’adversaire…');
    else if (V.step === 'CLEANUP') {
      const over = P.reserve.length > P.rl || P.lm.length > P.ll;
      const nR = Math.max(0, P.reserve.length - P.rl), nL = Math.max(0, P.lm.length - P.ll), ok = keep.R.size === nR && keep.L.size === nL;
      h = r || !over ? 'En attente de l’adversaire…' : 'Nuit : <b>clique les cartes à défausser</b>' + (nR ? ' — réserve ' + keep.R.size + '/' + nR : '') + (nL ? ' — repères ' + keep.L.size + '/' + nL : '') + '.<div class="row"><button class="pri" data-do="cleanup"' + (ok ? '' : ' disabled') + '>Défausser</button></div>';
    }
    else h = '…';
    pr.innerHTML = h + (mode !== 'guest' ? '' : '') + '<div class="row undo"><button data-do="undo" title="Annuler ta dernière action">↶ Annuler</button></div>';
  }
  function locate(id) {
    for (let p = 0; p < V.players.length; p++) {
      const X = V.players[p]; if (!X) continue;
      for (const z of ['hand', 'reserve', 'lm', 'discard']) if (X[z].includes(id)) return { p, z };
      for (const e of ['H', 'C']) if (X.exp[e].includes(id)) return { p, z: 'exp', e };
      if (X.hero === id) return { p, z: 'hero' };
    }
    return null;
  }
  function renderSide() {
    const D = $('detail');
    if (sideView === 'mana') { const P = V.players[me]; const ids = P ? P.mana.map(m => m.id).filter(id => V.cards[id] && V.cards[id].ref !== '__mana') : []; const extra = P ? P.mana.length - ids.length : 0; D.innerHTML = '<div class="row" style="justify-content:space-between"><b>Mes cartes en mana (' + (P ? P.mana.length : 0) + ')</b><button data-do="closeSide">Fermer</button></div><div class="cards sm" style="margin-top:8px">' + cardsEl(ids) + '</div>' + (extra ? '<p class="note">+ ' + extra + ' mana sans carte (ajouté avec l’outil).</p>' : ''); return; }
    if (sideView === 'discard') { D.innerHTML = '<div class="row" style="justify-content:space-between"><b>Défausses</b><button data-do="closeSide">Fermer</button></div>' + V.players.map(X => X ? '<span class="lbl" style="margin-top:8px">' + esc(X.name) + '</span><div class="cards sm">' + cardsEl(X.discard) + '</div>' : '').join(''); return; }
    if (sideView === 'token') {
      D.innerHTML = '<b>Créer un jeton</b><div style="display:grid;gap:6px;margin-top:6px"><select id="tkPre">' + TOKENS.map((t, i) => '<option value="' + i + '">' + esc(LANG === 'en' ? t.en : t.fr) + ' — ' + esc(LANG === 'en' ? t.type : t.typefr) + ' ' + t.p.join('/') + '</option>').join('') + '<option value="custom">Autre jeton…</option></select>' +
        '<div id="tkCustom" class="hidden" style="display:grid;gap:6px"><input id="tkN" placeholder="Nom"><div class="row"><label>F <input id="tkF" type="number" value="1" style="width:56px"></label><label>M <input id="tkM" type="number" value="1" style="width:56px"></label><label>E <input id="tkW" type="number" value="1" style="width:56px"></label></div></div>' +
        '<select id="tkE"><option value="H">Expédition Héros</option><option value="C">Expédition Compagnon</option></select><div class="row"><button class="pri" data-do="mkToken">Créer</button><button data-do="closeSide">Annuler</button></div></div>';
      $('tkPre').onchange = () => $('tkCustom').classList.toggle('hidden', $('tkPre').value !== 'custom'); return;
    }
    if (!sel || !card(sel)) { D.innerHTML = '<p class="note">Survole une carte pour la voir en grand. Clique-la pour ses actions.</p>'; return; }
    const c = card(sel), d = data(c), L = locate(sel); if (!L) { sel = null; return renderSide(); }
    const mine = L.p === me, A = [];
    const b = (label, act, pri) => A.push('<button' + (pri ? ' class="pri"' : '') + " data-act='" + esc(JSON.stringify(act)) + "'>" + esc(label) + '</button>');
    const isBody = d && (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT');
    let costBox = '';
    if (mine && (L.z === 'hand' || L.z === 'reserve') && d) {
      costBox = '<label class="small">Coût <input id="costIn" type="number" min="0" placeholder="auto" style="width:70px"></label> <span class="note">(laisse « auto » sauf effet spécial)</span>';
      if (isBody) { b('Jouer → Héros', { type: 'play', id: sel, e: 'H' }, 1); b('Jouer → Compagnon', { type: 'play', id: sel, e: 'C' }, 1); }
      else b('Jouer', { type: 'play', id: sel }, 1);
    }
    if (mine && L.z === 'hero' && d && /\{T\}\s*[,:]/i.test(d.xe || '')) b('Activer la capacité {T} du héros' + (c.ex ? ' (déjà épuisé)' : ''), { type: 'heroT' });
    if (mine && L.z === 'reserve' && d) { const sb = E.supportBody(d); if (sb) b('Capacité de réserve (me défausser)' + (sb.auto ? '' : ' — effet manuel'), { type: 'support', id: sel }); }
    if (mine && L.z === 'hand') { b('Mettre en mana', { type: 'toMana', id: sel, free: !['SETUP_MANA', 'EXPAND'].includes(V.step) }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); b('Sur le deck', { type: 'move', id: sel, to: 'deck', top: true }); b('Sous le deck', { type: 'move', id: sel, to: 'deck' }); }
    if (L.z === 'exp') { b('+1 boost', { type: 'boost', id: sel, n: 1 }); b('−1 boost', { type: 'boost', id: sel, n: -1 }); b('Fugace', { type: 'flag', id: sel, f: 'fleeting' }); b('Ancré', { type: 'flag', id: sel, f: 'anchored' }); b('Endormi', { type: 'flag', id: sel, f: 'asleep' }); b('Épuisé', { type: 'flag', id: sel, f: 'ex' }); b('Autre expédition', { type: 'move', id: sel, to: 'exp', e: L.e === 'H' ? 'C' : 'H' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); }
    if (L.z === 'reserve') { b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); }
    if (L.z === 'lm') { b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); }
    if (L.z === 'discard') { b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Sur le deck', { type: 'move', id: sel, to: 'deck', top: true }); }
    if (L.z === 'hero' && mine) b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' });
    const info = d ? '<p class="small" style="margin:6px 0"><b>' + esc(NM(d)) + '</b> · coût ' + esc(String(d.c ?? '').replace(/#/g, '')) + ' / ' + esc(String(d.rc ?? '').replace(/#/g, '')) + (mine ? '' : ' · <i>carte adverse</i>') + '</p>' : '<p class="small"><b>Jeton ' + esc(tokName(c.tok.n)) + '</b></p>';
    D.innerHTML = '<div class="detimg">' + (c.tok ? img(c) : '<img alt="" src="img/' + LANG + '-hd/' + encodeURIComponent(c.ref) + '.webp">') + '</div>' + costBox + '<div class="acts" style="margin-top:6px">' + A.join('') + '</div>';
  }

  function playable(id) { const P = V && V.players[me]; return !!(P && V.step === 'AFTERNOON' && V.turn === me && (P.hand.includes(id) || P.reserve.includes(id))); }
  function playTo(id, zone) {
    const c = card(id), d = c && DB[c.ref]; if (!d) return;
    if (!playable(id)) { flash(V.step === 'AFTERNOON' ? 'Ce n’est pas ton tour.' : 'On joue les cartes l’après-midi.'); return; }
    const body = d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT';
    const a = { type: 'play', id };
    if (body) a.e = zone === 'C' ? 'C' : 'H';
    const ci = $('costIn'); if (ci && sel === id) { const v = parseInt(ci.value, 10); if (Number.isFinite(v)) a.cost = v; }
    sel = null; dispatch(a);
  }
  function bindDrag() {

    document.addEventListener('dragend', () => { DRAG = null; PREVZ = null; clearPreview(); });
    document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.c[draggable]'); if (!c) return; DRAG = c.dataset.id; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; hideZoom(); });
    document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.style.outline = '2px dashed var(--acc)'; if (DRAG && PREVZ !== z.dataset.drop) { PREVZ = z.dataset.drop; previewPlay(DRAG, PREVZ); } });
    document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; if (e.relatedTarget && z.contains(e.relatedTarget)) return; z.style.outline = ''; PREVZ = null; clearPreview(); });
    document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.style.outline = ''; const id = e.dataTransfer.getData('text/plain'); if (id) playTo(id, z.dataset.drop); });
  }
  const zoomEl = document.createElement('div'); zoomEl.id = 'zoomCard'; document.body.appendChild(zoomEl);
  function hideZoom() { zoomEl.style.display = 'none'; }
  function bindZoom() {
    document.addEventListener('mouseover', e => {
      if (sel && !DRAG) { const z = e.target.closest && e.target.closest('[data-drop]'); const zk = z ? z.dataset.drop : null; if (zk !== PREVZ) { PREVZ = zk; if (zk) { const c = card(sel); if (c && V.players[me] && (V.players[me].hand.includes(sel) || V.players[me].reserve.includes(sel))) previewPlay(sel, zk); } else clearPreview(); } }
      const c = e.target.closest && e.target.closest('.c[data-id]'); if (!c || !V) return;
      const x = card(c.dataset.id); if (!x || x.tok) { hideZoom(); return; }
      zoomEl.innerHTML = '<img alt="" src="img/' + LANG + '-hd/' + encodeURIComponent(x.ref) + '.webp">'; zoomEl.style.display = 'block';
    });
    // Téléphone : appui long sur une carte = zoom, on relâche = ça se ferme
    let lpT = null;
    document.addEventListener('touchstart', e => { const c = e.target.closest && e.target.closest('.c[data-id]'); if (!c || !V) return; clearTimeout(lpT); lpT = setTimeout(() => { const x = card(c.dataset.id); if (!x || x.tok) return; zoomEl.innerHTML = '<img alt="" src="img/' + LANG + '-hd/' + encodeURIComponent(x.ref) + '.webp">'; zoomEl.style.display = 'block'; zoomEl.classList.add('touch'); }, 320); }, { passive: true });
    const endLP = () => { clearTimeout(lpT); if (zoomEl.classList.contains('touch')) { zoomEl.classList.remove('touch'); hideZoom(); } };
    document.addEventListener('touchend', endLP, { passive: true }); document.addEventListener('touchcancel', endLP, { passive: true }); document.addEventListener('touchmove', () => clearTimeout(lpT), { passive: true });
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.c[data-id]') && zoomEl.classList.contains('touch')) e.preventDefault(); });
    document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('.c[data-id]'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) hideZoom(); });
  }

  // ---------- Événements ----------
  function bindGame() {
    bindDrag(); if (window.matchMedia && matchMedia('(hover: hover)').matches) bindZoom();
    document.addEventListener('click', e => {
      const t = e.target;
      const actB = t.closest('[data-act]');
      if (actB) { let a; try { a = JSON.parse(actB.dataset.act); } catch (x) { return; } if (a.type === 'play') { const v = parseInt(($('costIn') || {}).value, 10); if (Number.isFinite(v)) a.cost = v; } dispatch(a); if (a.type === 'play' || a.type === 'toMana' || (a.type === 'move')) sel = null; return; }
      const dsc = t.closest('[data-disc]');
      if (dsc && !t.closest('.c[data-id]')) { sideView = 'discard'; renderSide(); return; }
      const chB = t.closest('[data-choose]');
      if (chB) { const v = chB.dataset.choose; dispatch({ type: 'choose', target: v === 'none' ? null : v }); return; }
      const doB = t.closest('[data-do]');
      if (doB) {
        const k = doB.dataset.do;
        if (k === 'ready') dispatch({ type: 'ready' });
        else if (k === 'pass') dispatch({ type: 'pass' });
        else if (k === 'undo') { if (mode === 'guest') net.send({ type: 'undo' }); else { const e = undo(me); if (e) flash(e); push(); } }
        else if (k === 'mana') { const ids = [...pick]; pick = new Set(); dispatch({ type: 'toManaMany', ids }); }
        else if (k === 'rematch') rematch();
        else if (k === 'cleanup') { const P = V.players[me]; dispatch({ type: 'cleanup', keepR: P.reserve.filter(x => !keep.R.has(x)), keepL: P.lm.filter(x => !keep.L.has(x)) }); keep = { R: new Set(), L: new Set() }; }
        else if (k === 'closeSide') { sideView = 'card'; renderSide(); }
        else if (k === 'mkToken') { const pv = $('tkPre').value; if (pv === 'custom') dispatch({ type: 'token', n: $('tkN').value || 'Jeton', f: +$('tkF').value || 0, m: +$('tkM').value || 0, w: +$('tkW').value || 0, e: $('tkE').value }); else { const t = TOKENS[+pv]; if (t) dispatch({ type: 'token', n: t.en, f: t.p[0], m: t.p[1], w: t.p[2], e: $('tkE').value }); } sideView = 'card'; }
        return;
      }
      const tool = t.closest('[data-tool]');
      if (tool) {
        const k = tool.dataset.tool;
        if (k === 'draw') dispatch({ type: 'draw', n: 1 }); else if (k === 'resupply') dispatch({ type: 'resupply' }); else if (k === 'shuffle') dispatch({ type: 'shuffle' });
        else if (k === 'manaAdd') dispatch({ type: 'manaAdd' }); else if (k === 'manaDel') dispatch({ type: 'manaDel' });
        else if (k === 'token') { sideView = 'token'; renderSide(); } else if (k === 'discard') { sideView = 'discard'; renderSide(); }
        else if (k === 'lang') { LANG = LANG === 'en' ? 'fr' : 'en'; try { localStorage.setItem('alt-bi-lang', LANG); } catch (x) { } render(); }
        return;
      }
      const pos = t.closest('[data-pos]');
      if (pos) { const [p, ex, n] = pos.dataset.pos.split(','); dispatch({ type: 'pos', p: +p, e: ex, n: +n }); return; }
      if (t.closest('[data-manaview]')) { sideView = 'mana'; renderSide(); return; }
      const orb = t.closest('[data-orb]');
      if (orb) { dispatch({ type: 'manaEx', i: +orb.dataset.orb }); return; }
      const dz = t.closest('[data-drop]');
      if (dz && !t.closest('.c[data-id]') && !t.closest('button') && sel && playable(sel)) { playTo(sel, dz.dataset.drop); return; }
      const ce = t.closest('.c[data-id]');
      if (ce && V) {
        const id = ce.dataset.id, L = locate(id);
        if (isTarget(id)) { dispatch({ type: 'choose', target: id }); return; }
        if ((V.step === 'SETUP_MANA' || V.step === 'EXPAND') && L && L.p === me && L.z === 'hand' && !V.ready[me]) {
          const lim = V.step === 'SETUP_MANA' ? 3 - V.players[me].mana.length : 1;
          if (pick.has(id)) pick.delete(id); else { if (lim === 1) pick.clear(); if (pick.size < lim) pick.add(id); }
          render(); return;
        }
        if (V.step === 'CLEANUP' && L && L.p === me && !V.ready[me] && (L.z === 'reserve' || L.z === 'lm')) {
          const P = V.players[me], set = L.z === 'reserve' ? keep.R : keep.L, lim = L.z === 'reserve' ? Math.max(0, P.reserve.length - P.rl) : Math.max(0, P.lm.length - P.ll);
          if (set.has(id)) set.delete(id); else { if (lim === 1) set.clear(); if (set.size < lim) set.add(id); }
          render(); return;
        }
        sel = id; sideView = 'card'; render();
      }
    });
    $('bSwitch').onclick = () => { if (mode !== 'solo') return; me = 1 - me; sel = null; keep = { R: new Set(), L: new Set() }; push(); };
  }

  init();
})();
