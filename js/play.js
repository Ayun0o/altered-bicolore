// Interface de la table de jeu
(function () {
  'use strict';
  const E = window.AlteredEngine, NET = window.AlteredNet;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  let LANG = 'fr'; try { LANG = localStorage.getItem('alt-bi-lang') === 'en' ? 'en' : 'fr'; } catch (e) { }

  let STARTERS = [], DB = {}, mode = null, S = null, V = null, me = 0, net = null, sel = null, sideView = 'card', keep = { R: new Set(), L: new Set() }, pick = new Set(), decksUsed = [], names = [];
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
  }
  const myName = () => ($('pname').value.trim() || 'Joueur').slice(0, 24);
  function needDeck() { const d = getDeck($('pdeck').value); if (!d) { $('lobbyMsg').innerHTML = '<span class="err">Choisis un deck avec un héros.</span>'; } return d; }

  function startHost() {
    const d = needDeck(); if (!d) return;
    if (typeof Peer === 'undefined') { $('lobbyMsg').innerHTML = '<span class="err">Le module réseau n’a pas pu se charger.</span>'; return; }
    mode = 'host'; me = 0; decksUsed[0] = d; names[0] = myName();
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
      if (!S.players[1]) { const deck = sanitizeDeck(m.deck); if (!deck) { net.send({ type: 'err', m: 'Deck invalide.' }); return; } decksUsed[1] = deck; names[1] = String(m.name || 'Invité').slice(0, 24); E.addPlayer(S, 1, names[1], deck, DB); E.advance(S, DB); }
      push();
    } else if (m.type === 'act' && m.a && typeof m.a === 'object') {
      const err = E.act(S, 1, m.a, DB); if (err) net.send({ type: 'err', m: err }); push();
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
      if (st === 'connected') { net.send({ type: 'hello', name: myName(), deck: { hero: d.hero, cards: d.cards } }); setConn('Connecté'); }
      else if (st === 'left') setConn('Connexion perdue avec l’hôte.');
      else if (st === 'error') { $('lobbyMsg').innerHTML = '<span class="err">' + esc(x) + '</span>'; setConn('Erreur : ' + x); }
    });
  }

  function startSolo() {
    const a = needDeck(); if (!a) return; const b = getDeck($('sdeck').value) || a;
    mode = 'solo'; me = 0; decksUsed = [a, b]; names = [myName(), 'Adversaire (toi aussi)'];
    S = E.newGame({}); E.addPlayer(S, 0, names[0], a, DB); E.addPlayer(S, 1, names[1], b, DB); E.advance(S, DB);
    $('bSwitch').classList.remove('hidden'); setConn('Partie d’essai');
    showGame(); push();
  }
  function rematch() {
    if (mode === 'guest') { net.send({ type: 'rematch' }); return; }
    if (!decksUsed[1]) return;
    S = E.newGame({}); E.addPlayer(S, 0, names[0], decksUsed[0], DB); E.addPlayer(S, 1, names[1], decksUsed[1], DB); E.advance(S, DB); sel = null; push();
  }

  function dispatch(a) {
    if (mode === 'guest') { net.send({ type: 'act', a }); return; }
    const err = E.act(S, me, a, DB); if (err) flash(err); push();
  }
  function push() {
    if (mode === 'host' && net && S.players[1]) net.send({ type: 'state', v: E.view(S, 1) });
    V = E.view(S, me); render();
  }
  function showGame() { $('lobby').classList.add('hidden'); $('game').classList.remove('hidden'); if (!V && S) V = E.view(S, me); render(); }
  function setConn(t) { $('conn').textContent = t; }
  let flashT; function flash(m) { const p = $('prompt'); p.classList.remove('hidden'); p.innerHTML = '<span class="err">' + esc(m) + '</span>'; clearTimeout(flashT); flashT = setTimeout(render, 2500); }

  // ---------- Rendu ----------
  const card = id => V.cards[id];
  const data = c => c && (c.tok ? null : DB[c.ref]);
  function img(c) { return c.tok ? '<div class="tok"><b>' + esc(c.tok.n) + '</b><span>F' + c.tok.p[0] + ' M' + c.tok.p[1] + ' E' + c.tok.p[2] + '</span></div>' : '<img loading="lazy" alt="' + esc(NM(DB[c.ref])) + '" src="img/' + LANG + '/' + encodeURIComponent(c.ref) + '.webp">'; }
  function cardEl(id, extra) {
    const c = card(id); if (!c) return '<div class="c"><div class="tok">?</div></div>';
    const b = []; if (c.boost) b.push('+' + c.boost); if (c.fleeting) b.push('fugace'); if (c.anchored) b.push('ancré'); if (c.asleep) b.push('endormi');
    const k = keep.R.has(id) || keep.L.has(id) || pick.has(id);
    const P = V.players[me]; const drag = P && c.owner === me && (P.hand.includes(id) || P.reserve.includes(id));
    return '<div class="c' + (c.ex ? ' ex' : '') + (sel === id || k ? ' sel' : '') + '" data-id="' + esc(id) + '"' + (drag ? ' draggable="true"' : '') + (extra || '') + '>' + img(c) + (b.length ? '<div class="bd">' + b.map(x => '<b>' + esc(x) + '</b>').join('') + '</div>' : '') + '</div>';
  }
  const cardsEl = ids => ids.map(id => cardEl(id)).join('') || '<span class="note">—</span>';
  const PH = { SETUP_MANA: 'Mise en place', MORNING: 'Matin', EXPAND: 'Matin', NOON: 'Midi', AFTERNOON: 'Après-midi', DUSK: 'Crépuscule', NIGHT: 'Nuit', CLEANUP: 'Nuit', END: 'Fin de partie' };

  let lastStep = null;
  function render() {
    if (!V) return;
    if (V.step !== lastStep) { pick = new Set(); lastStep = V.step; }
    const P = V.players[me], O = V.players[1 - me];
    $('phase').textContent = 'Jour ' + V.day + ' · ' + (PH[V.step] || V.step) + (V.tie ? ' · Arène' : '');
    $('turnInfo').textContent = !O ? 'En attente du deuxième joueur…' : 'Premier joueur : ' + V.players[V.first].name + (V.step === 'AFTERNOON' ? ' · Au tour de ' + V.players[V.turn].name : '');
    renderPrompt(P, O);
    $('adv').innerHTML = V.adv.map((r, i) => {
      const mk = []; V.players.forEach((X, p) => { if (!X) return; ['H', 'C'].forEach(e => { if (X.pos[e] === i) mk.push('<span class="mk ' + (p === me ? 'me' : 'opp') + '" title="' + esc(X.name) + '">' + (p === me ? 'Moi' : 'Adv') + ' ' + (e === 'H' ? 'Hé' : 'Co') + '</span>'); }); });
      return '<div class="reg' + (r.up ? '' : ' down') + '"><span class="note">' + (r.kind === 'H' ? 'Départ Héros' : r.kind === 'C' ? 'Départ Compagnon' : (r.up ? 'Tumulte' : '?')) + '</span><div class="t">' + (r.up ? r.terr.map(t => '<span class="ter ' + t + '" title="' + TL[t] + '">' + TL[t][0] + '</span>').join('') : '') + '</div>' + mk.join('') + '</div>';
    }).join('');
    $('oppTop').innerHTML = O ? sideTop(O, 1 - me, true) : '<p class="note">En attente de l’adversaire…</p>';
    $('oppExps').innerHTML = O ? exps(1 - me) : '';
    $('myExps').innerHTML = P ? exps(me) : '';
    $('myBottom').innerHTML = P ? sideTop(P, me, false) : '';
    $('handTitle').textContent = 'Ta main (' + (P ? P.hand.length : 0) + ')';
    $('hand').innerHTML = P ? cardsEl(P.hand) : '';
    $('log').innerHTML = V.log.slice().reverse().slice(0, 80).map(l => '<div>' + esc(l.m) + '</div>').join('');
    renderSide();
  }
  function sideTop(X, p, opp) {
    const hero = X.hero ? cardEl(X.hero) : '';
    const rdy = X.mana.filter(m => !m.ex).length;
    const orbs = X.mana.map((m, i) => '<span class="orb' + (m.ex ? ' ex' : '') + '"' + (!opp ? ' data-orb="' + i + '" title="Épuiser / redresser"' : '') + '></span>').join('');
    return '<h3>' + esc(X.name) + (opp ? ' · main : ' + (X.handCount || 0) : '') + ' · deck : ' + (X.deckCount || 0) + ' · défausse : ' + X.discard.length + ' · mana : ' + rdy + '/' + X.mana.length + ' · limites réserve ' + X.rl + ' / repères ' + X.ll + '</h3>' +
      '<div class="row" style="align-items:flex-start;gap:14px"><div>' + hero + '</div><div><span class="lbl">Mana</span><div class="mana">' + (orbs || '<span class="note">—</span>') + '</div></div>' +
      '<div><span class="lbl">Réserve</span><div class="cards">' + cardsEl(X.reserve) + '</div></div><div><span class="lbl">Repères</span><div class="cards">' + cardsEl(X.lm) + '</div></div></div>';
  }
  function exps(p) {
    const X = V.players[p], o = 1 - p;
    return ['H', 'C'].map(e => {
      const t = E.totals(V, p, e, DB), ot = V.players[o] ? E.totals(V, o, e, DB) : { F: 0, M: 0, W: 0 };
      const reg = V.adv[X.pos[e]]; const terr = reg ? reg.terr : [];
      const tot = ['F', 'M', 'W'].map(k => '<span class="' + (terr.includes(k) && t[k] > ot[k] && t[k] > 0 ? 'win' : '') + '" title="' + TL[k] + (terr.includes(k) ? ' (terrain de la région)' : '') + '"><span class="ter ' + k + '">' + TL[k][0] + '</span>' + t[k] + '</span>').join('');
      return '<div class="zone"' + (p === me ? ' data-drop="' + e + '"' : '') + '><h3>' + (p === me ? 'Mon expédition ' : 'Expédition adverse ') + (e === 'H' ? 'Héros' : 'Compagnon') + ' <span class="tot">' + tot + '</span><span style="margin-left:auto"></span><button class="small" data-pos="' + p + ',' + e + ',-1" title="Reculer">◀</button><button class="small" data-pos="' + p + ',' + e + ',1" title="Avancer">▶</button></h3><div class="cards">' + cardsEl(X.exp[e]) + '</div></div>';
    }).join('');
  }

  function renderPrompt(P, O) {
    const pr = $('prompt'); let h = '';
    if (!O || !P) { pr.classList.add('hidden'); return; }
    const r = V.ready[me];
    if (V.step === 'END') h = '<b>' + esc(V.players[V.winner].name) + ' gagne la partie !</b> <button class="pri" data-do="rematch">Revanche</button>';
    else if (V.step === 'SETUP_MANA') { const need = 3 - P.mana.length; h = r ? 'En attente de l’adversaire…' : 'Mise en place : <b>clique ' + need + ' cartes de ta main</b> à mettre en mana (' + pick.size + '/' + need + '). <button class="pri" data-do="mana"' + (pick.size !== need ? ' disabled' : '') + '>Valider</button>'; }
    else if (V.step === 'EXPAND') h = r ? 'En attente de l’adversaire…' : 'Matin : <b>clique une carte de ta main</b> pour la mettre en mana (facultatif). <button class="pri" data-do="mana">' + (pick.size ? 'Mettre en mana' : 'Ne rien mettre') + '</button>';
    else if (V.pending && ['noon', 'dusk', 'night'].includes(V.pending)) h = r ? 'En attente de l’adversaire…' : ({ noon: 'Midi', dusk: 'Crépuscule', night: 'Nuit' })[V.pending] + ' : des cartes en jeu ont un effet à ce moment. Applique-les avec les outils, puis <button class="pri" data-do="ready">Continuer</button>';
    else if (V.step === 'AFTERNOON') h = V.turn === me ? '<b>À toi de jouer.</b> Glisse une carte de ta main ou de ta réserve sur une de tes expéditions (ou clique la carte, puis l’expédition). <button class="pri" data-do="pass">Passer</button>' + (V.passed[1 - me] ? ' <span class="note">(l’adversaire a passé : tu peux jouer plusieurs cartes)</span>' : '') : (V.passed[me] ? 'Tu as passé. L’adversaire termine sa journée…' : 'Tour de l’adversaire…');
    else if (V.step === 'CLEANUP') {
      const over = P.reserve.length > P.rl || P.lm.length > P.ll;
      h = r || !over ? 'En attente de l’adversaire…' : 'Nuit : garde au plus ' + P.rl + ' carte(s) en réserve et ' + P.ll + ' repère(s). Clique les cartes à garder (' + keep.R.size + '/' + Math.min(P.rl, P.reserve.length) + ' en réserve, ' + keep.L.size + '/' + Math.min(P.ll, P.lm.length) + ' repères), le reste sera défaussé. <button class="pri" data-do="cleanup">Valider</button>';
    }
    pr.classList.toggle('hidden', !h); pr.innerHTML = h;
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
    if (sideView === 'discard') { D.innerHTML = '<div class="row" style="justify-content:space-between"><b>Défausses</b><button data-do="closeSide">Fermer</button></div>' + V.players.map((X, p) => X ? '<span class="lbl" style="margin-top:8px">' + esc(X.name) + '</span><div class="cards">' + cardsEl(X.discard) + '</div>' : '').join(''); return; }
    if (sideView === 'token') { D.innerHTML = '<b>Créer un jeton</b><div style="display:grid;gap:6px;margin-top:6px"><input id="tkN" placeholder="Nom (ex. Scarabot)"><div class="row"><label>F <input id="tkF" type="number" value="2" style="width:56px"></label><label>M <input id="tkM" type="number" value="2" style="width:56px"></label><label>E <input id="tkW" type="number" value="2" style="width:56px"></label></div><select id="tkE"><option value="H">Expédition Héros</option><option value="C">Expédition Compagnon</option></select><div class="row"><button class="pri" data-do="mkToken">Créer</button><button data-do="closeSide">Annuler</button></div></div>'; return; }
    if (!sel || !card(sel)) { D.innerHTML = '<p class="note">Clique sur une carte pour voir ses actions.</p>'; return; }
    const c = card(sel), d = data(c), L = locate(sel); if (!L) { sel = null; return renderSide(); }
    const mine = L.p === me, A = [];
    const b = (label, act, pri) => A.push('<button' + (pri ? ' class="pri"' : '') + " data-act='" + esc(JSON.stringify(act)) + "'>" + esc(label) + '</button>');
    const isBody = d && (d.t === 'CHARACTER' || d.t === 'EXPEDITION_PERMANENT');
    let costBox = '';
    if (mine && (L.z === 'hand' || L.z === 'reserve') && d) {
      const fromRes = L.z === 'reserve'; const cost = E.num(fromRes ? d.rc : d.c);
      costBox = '<label class="small">Coût payé <input id="costIn" type="number" min="0" value="' + cost + '" style="width:64px"></label> ';
      if (isBody) { b('Jouer → Héros', { type: 'play', id: sel, e: 'H' }, 1); b('Jouer → Compagnon', { type: 'play', id: sel, e: 'C' }, 1); }
      else b('Jouer', { type: 'play', id: sel }, 1);
    }
    if (mine && L.z === 'hand') { b('Mettre en mana', { type: 'toMana', id: sel, free: !['SETUP_MANA', 'EXPAND'].includes(V.step) }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); b('Sur le deck', { type: 'move', id: sel, to: 'deck', top: true }); b('Sous le deck', { type: 'move', id: sel, to: 'deck' }); }
    if (L.z === 'exp') { b('+1 boost', { type: 'boost', id: sel, n: 1 }); b('−1 boost', { type: 'boost', id: sel, n: -1 }); b('Fugace', { type: 'flag', id: sel, f: 'fleeting' }); b('Ancré', { type: 'flag', id: sel, f: 'anchored' }); b('Endormi', { type: 'flag', id: sel, f: 'asleep' }); b('Épuisé', { type: 'flag', id: sel, f: 'ex' }); b('Autre expédition', { type: 'move', id: sel, to: 'exp', e: L.e === 'H' ? 'C' : 'H' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); }
    if (L.z === 'reserve') { b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); }
    if (L.z === 'lm') { b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Défausser', { type: 'move', id: sel, to: 'discard' }); }
    if (L.z === 'discard') { b('Vers la main', { type: 'move', id: sel, to: 'hand' }); b('Vers la réserve', { type: 'move', id: sel, to: 'reserve' }); b('Sur le deck', { type: 'move', id: sel, to: 'deck', top: true }); }
    if (L.z === 'hero' && mine) b('Épuiser / redresser', { type: 'flag', id: sel, f: 'ex' });
    const info = d ? '<p class="small" style="margin:6px 0">' + esc(NM(d)) + ' · coût ' + esc(String(d.c ?? '').replace(/#/g, '')) + ' / ' + esc(String(d.rc ?? '').replace(/#/g, '')) + (mine ? '' : ' · <i>carte adverse</i>') + '</p>' : '<p class="small">' + esc(c.tok ? 'Jeton ' + c.tok.n : '') + '</p>';
    D.innerHTML = (c.tok ? img(c) : '<img alt="" src="img/' + LANG + '/' + encodeURIComponent(c.ref) + '.webp">') + info + (TX(d) ? '<p class="small note" style="margin:0 0 8px">' + esc(TX(d).replace(/[#\[\]]/g, '')) + '</p>' : '') + costBox + '<div class="acts" style="margin-top:6px">' + A.join('') + '</div>';
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
    document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.c[draggable]'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; hideZoom(); });
    document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.style.outline = '2px dashed var(--acc)'; });
    document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z) z.style.outline = ''; });
    document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.style.outline = ''; const id = e.dataTransfer.getData('text/plain'); if (id) playTo(id, z.dataset.drop); });
  }
  const zoomEl = document.createElement('div'); zoomEl.id = 'zoomCard'; document.body.appendChild(zoomEl);
  function hideZoom() { zoomEl.style.display = 'none'; }
  function bindZoom() {
    document.addEventListener('mouseover', e => {
      const c = e.target.closest && e.target.closest('.c[data-id]'); if (!c || !V) return;
      const x = card(c.dataset.id); if (!x || x.tok) { hideZoom(); return; }
      zoomEl.innerHTML = '<img alt="" src="img/' + LANG + '/' + encodeURIComponent(x.ref) + '.webp">'; zoomEl.style.display = 'block';
    });
    document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('.c[data-id]'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) hideZoom(); });
  }

  // ---------- Événements ----------
  function bindGame() {
    bindDrag(); if (window.matchMedia && matchMedia('(hover: hover)').matches) bindZoom();
    document.addEventListener('click', e => {
      const t = e.target;
      const actB = t.closest('[data-act]');
      if (actB) { let a; try { a = JSON.parse(actB.dataset.act); } catch (x) { return; } if (a.type === 'play') { const v = parseInt(($('costIn') || {}).value, 10); if (Number.isFinite(v)) a.cost = v; } dispatch(a); if (a.type === 'play' || a.type === 'toMana' || (a.type === 'move')) sel = null; return; }
      const doB = t.closest('[data-do]');
      if (doB) {
        const k = doB.dataset.do;
        if (k === 'ready') dispatch({ type: 'ready' });
        else if (k === 'pass') dispatch({ type: 'pass' });
        else if (k === 'mana') { const ids = [...pick]; pick = new Set(); dispatch({ type: 'toManaMany', ids }); }
        else if (k === 'rematch') rematch();
        else if (k === 'cleanup') { dispatch({ type: 'cleanup', keepR: [...keep.R], keepL: [...keep.L] }); keep = { R: new Set(), L: new Set() }; }
        else if (k === 'closeSide') { sideView = 'card'; renderSide(); }
        else if (k === 'mkToken') { dispatch({ type: 'token', n: $('tkN').value || 'Jeton', f: +$('tkF').value || 0, m: +$('tkM').value || 0, w: +$('tkW').value || 0, e: $('tkE').value }); sideView = 'card'; }
        return;
      }
      const tool = t.closest('[data-tool]');
      if (tool) {
        const k = tool.dataset.tool;
        if (k === 'draw') dispatch({ type: 'draw', n: 1 }); else if (k === 'resupply') dispatch({ type: 'resupply' }); else if (k === 'shuffle') dispatch({ type: 'shuffle' });
        else if (k === 'token') { sideView = 'token'; renderSide(); } else if (k === 'discard') { sideView = 'discard'; renderSide(); }
        else if (k === 'lang') { LANG = LANG === 'en' ? 'fr' : 'en'; try { localStorage.setItem('alt-bi-lang', LANG); } catch (x) { } render(); }
        return;
      }
      const pos = t.closest('[data-pos]');
      if (pos) { const [p, ex, n] = pos.dataset.pos.split(','); dispatch({ type: 'pos', p: +p, e: ex, n: +n }); return; }
      const orb = t.closest('[data-orb]');
      if (orb) { dispatch({ type: 'manaEx', i: +orb.dataset.orb }); return; }
      const dz = t.closest('[data-drop]');
      if (dz && !t.closest('.c[data-id]') && !t.closest('button') && sel && playable(sel)) { playTo(sel, dz.dataset.drop); return; }
      const ce = t.closest('.c[data-id]');
      if (ce && V) {
        const id = ce.dataset.id, L = locate(id);
        if ((V.step === 'SETUP_MANA' || V.step === 'EXPAND') && L && L.p === me && L.z === 'hand' && !V.ready[me]) {
          const lim = V.step === 'SETUP_MANA' ? 3 - V.players[me].mana.length : 1;
          if (pick.has(id)) pick.delete(id); else { if (lim === 1) pick.clear(); if (pick.size < lim) pick.add(id); }
          render(); return;
        }
        if (V.step === 'CLEANUP' && L && L.p === me && !V.ready[me] && (L.z === 'reserve' || L.z === 'lm')) {
          const set = L.z === 'reserve' ? keep.R : keep.L, lim = L.z === 'reserve' ? V.players[me].rl : V.players[me].ll;
          if (set.has(id)) set.delete(id); else if (set.size < lim) set.add(id);
          render(); return;
        }
        sel = id; sideView = 'card'; render();
      }
    });
    $('bSwitch').onclick = () => { if (mode !== 'solo') return; me = 1 - me; sel = null; keep = { R: new Set(), L: new Set() }; push(); };
  }

  init();
})();
