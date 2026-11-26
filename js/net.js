// Réseau pair-à-pair (PeerJS). L'hôte garde l'état, l'invité envoie ses actions.
(function (root) {
  'use strict';
  const PREFIX = 'altbi-';
  // Serveurs STUN + relais TURN publics : indispensables quand un des deux appareils est en 4G / derrière une box stricte
  const OPTS = { config: { iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' }
  ] } };
  const nice = e => { const m = (e && e.message) || String(e); return /negotiation|ice|failed/i.test(m) ? 'La connexion directe entre vos deux appareils a échoué. Réessaie (Créer une partie puis Rejoindre) ; si ça recommence, essayez tous les deux sur le même Wi-Fi.' : m; };
  function code() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

  function host(onMsg, onStatus, fixed) {
    const c = fixed || code();
    const peer = new Peer(PREFIX + c, OPTS);
    let conn = null;
    peer.on('open', () => onStatus('open', c));
    peer.on('error', e => onStatus('error', e && e.type === 'unavailable-id' ? 'Ce code est déjà pris, crée une nouvelle partie.' : nice(e)));
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
    const peer = new Peer(OPTS);
    let conn = null;
    peer.on('open', () => {
      conn = peer.connect(PREFIX + c.toUpperCase(), { reliable: true });
      conn.on('open', () => onStatus('connected', null));
      conn.on('data', d => onMsg(d));
      conn.on('close', () => onStatus('left', null));
      conn.on('error', e => onStatus('error', nice(e)));
    });
    peer.on('error', e => onStatus('error', e && e.type === 'peer-unavailable' ? 'Partie introuvable : vérifie le code, et que l’hôte a bien la page ouverte.' : nice(e)));
    return { send: d => { if (conn && conn.open) conn.send(d); }, close: () => peer.destroy() };
  }

  root.AlteredNet = { host, join };
})(window);
