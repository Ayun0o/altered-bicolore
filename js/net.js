// Réseau pair-à-pair (PeerJS). L'hôte garde l'état, l'invité envoie ses actions.
(function (root) {
  'use strict';
  const PREFIX = 'altbi-';
  function code() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

  function host(onMsg, onStatus, fixed) {
    const c = fixed || code();
    const peer = new Peer(PREFIX + c);
    let conn = null;
    peer.on('open', () => onStatus('open', c));
    peer.on('error', e => onStatus('error', e && e.type === 'unavailable-id' ? 'Ce code est déjà pris, crée une nouvelle partie.' : (e && e.message) || String(e)));
    peer.on('connection', k => {
      if (conn && conn.open) { k.on('open', () => { k.send({ type: 'full' }); setTimeout(() => k.close(), 500); }); return; }
      conn = k;
      k.on('open', () => onStatus('peer', null));
      k.on('data', d => onMsg(d));
      k.on('close', () => { onStatus('left', null); conn = null; });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    return { code: c, send: d => { if (conn && conn.open) conn.send(d); }, close: () => peer.destroy() };
  }

  function join(c, onMsg, onStatus) {
    const peer = new Peer();
    let conn = null;
    peer.on('open', () => {
      conn = peer.connect(PREFIX + c.toUpperCase(), { reliable: true });
      conn.on('open', () => onStatus('connected', null));
      conn.on('data', d => onMsg(d));
      conn.on('close', () => onStatus('left', null));
      conn.on('error', e => onStatus('error', String(e)));
    });
    peer.on('error', e => onStatus('error', e && e.type === 'peer-unavailable' ? 'Partie introuvable : vérifie le code, et que l’hôte a bien la page ouverte.' : (e && e.message) || String(e)));
    return { send: d => { if (conn && conn.open) conn.send(d); }, close: () => peer.destroy() };
  }

  root.AlteredNet = { host, join };
})(window);
