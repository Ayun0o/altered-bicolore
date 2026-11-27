// Compte en ligne (Supabase) : connexion par lien e-mail, decks et statistiques synchronisés.
// Sans connexion, tout continue de fonctionner dans le navigateur.
(function (root) {
  'use strict';
  const URL = 'https://rwvrdaytkarbehcljicr.supabase.co';
  const KEY = 'sb_publishable_r9FsSdpXs7hDjcj6NQUL7Q_pRuwfPoq';
  let sb = null, user = null;
  const subs = [];

  function client() {
    if (sb) return sb;
    if (!root.supabase || !root.supabase.createClient) return null;
    sb = root.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setTimeout(async () => { const np = prompt('Choisis ton nouveau mot de passe (6 caractères minimum) :'); if (np && np.length >= 6) { const r = await sb.auth.updateUser({ password: np }); alert(r.error ? 'Échec : ' + r.error.message : 'Mot de passe changé, tu es connecté.'); } }, 300); const u = session ? session.user : null; if ((u && u.id) !== (user && user.id)) { user = u; subs.forEach(f => { try { f(user); } catch (e) { } }); } });
    return sb;
  }
  async function init() {
    const c = client(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); user = data && data.session ? data.session.user : null; } catch (e) { user = null; }
    return user;
  }
  async function signIn(email) {
    const c = client(); if (!c) throw new Error('Module de connexion indisponible.');
    const back = location.origin + location.pathname;
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: back } });
    if (error) throw error;
  }
  async function verify(email, token) {
    const c = client(); if (!c) throw new Error('Module de connexion indisponible.');
    const { error } = await c.auth.verifyOtp({ email, token: String(token).replace(/\s/g, ''), type: 'email' });
    if (error) throw error;
  }
  async function signInPwd(email, password) {
    const c = client(); if (!c) throw new Error('Module de connexion indisponible.');
    const r = await c.auth.signInWithPassword({ email, password }); if (r.error) throw r.error;
  }
  async function signUpPwd(email, password) {
    const c = client(); if (!c) throw new Error('Module de connexion indisponible.');
    const r = await c.auth.signUp({ email, password }); if (r.error) throw r.error;
    if (!r.data.session) { const s = await c.auth.signInWithPassword({ email, password }); if (s.error) throw new Error('Compte créé, mais la confirmation par e-mail est activée dans Supabase : désactive « Confirm email ».'); }
  }
  async function resetPwd(email) {
    const c = client(); if (!c) throw new Error('Module de connexion indisponible.');
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error;
  }
  async function signOut() { const c = client(); if (c) await c.auth.signOut(); user = null; subs.forEach(f => f(null)); }

  // Adaptateur au format « collection / doc / onSnapshot » déjà utilisé par le deckbuilder
  function db() {
    const c = client(); if (!c || !user) return null;
    let last = new Map();
    const snap = (rows) => {
      const now = new Map(rows.map(r => [r.id, r.data]));
      const changes = [];
      for (const id of last.keys()) if (!now.has(id)) changes.push({ type: 'removed', doc: { id } });
      last = now;
      return { docs: rows.map(r => ({ id: r.id, data: () => r.data })), docChanges: () => changes };
    };
    return {
      doc: () => ({ onSnapshot: () => () => { } }),
      collection: (name) => ({
        doc: (id) => ({
          set: async (data) => { const { error } = await c.from('decks').upsert({ user_id: user.id, id, data, updated_at: new Date().toISOString() }); if (error) throw error; },
          delete: async () => { const { error } = await c.from('decks').delete().eq('user_id', user.id).eq('id', id); if (error) throw error; }
        }),
        onSnapshot: (cb, err) => {
          let stop = false;
          const pull = async () => { if (stop) return; const { data, error } = await c.from('decks').select('id,data').eq('user_id', user.id); if (error) { if (err) err(error); return; } cb(snap(data || [])); };
          pull();
          const onFocus = () => pull(); root.addEventListener('focus', onFocus);
          const t = setInterval(pull, 30000);
          return () => { stop = true; clearInterval(t); root.removeEventListener('focus', onFocus); };
        }
      })
    };
  }

  async function addGame(g) { const c = client(); if (!c || !user) return false; const { error } = await c.from('games').insert({ user_id: user.id, data: g }); return !error; }
  async function games() { const c = client(); if (!c || !user) return null; const { data, error } = await c.from('games').select('data,created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1000); if (error) return null; return (data || []).map(r => r.data).filter(d => d && d.kind !== 'run'); }

  // Pseudo du profil (partie avant le @ de l'e-mail), lisible seulement par le joueur et l'administrateur
  async function ensureProfile() { const c = client(); if (!c || !user) return; try { const { data } = await c.from('profiles').select('id').eq('id', user.id).maybeSingle(); if (!data) await c.from('profiles').insert({ id: user.id, name: String(user.email || '').split('@')[0].slice(0, 40) }); } catch (e) { } }
  // Administration : réservé aux comptes listés dans la table « admins » (la base refuse tout le reste)
  async function isAdmin() { const c = client(); if (!c || !user) return false; try { const { data, error } = await c.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(); return !error && !!data; } catch (e) { return false; } }
  async function adminData() { const c = client(); if (!c || !user) return null;
    const [g, p] = await Promise.all([c.from('games').select('user_id,data,created_at').order('created_at', { ascending: false }).limit(5000), c.from('profiles').select('id,name')]);
    if (g.error) return null; const names = {}; for (const r of (p.data || [])) names[r.id] = r.name; return { games: g.data || [], names }; }
  root.AltCloud = { ensureProfile, isAdmin, adminData, init, signIn, verify, signInPwd, signUpPwd, resetPwd, signOut, db, addGame, games, user: () => user, onChange: f => subs.push(f), ready: () => !!client() };
})(window);
