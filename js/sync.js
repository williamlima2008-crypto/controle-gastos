'use strict';
/* Sincronização entre aparelhos usando o Google Drive DO PRÓPRIO USUÁRIO.
   - Os dados vão para a pasta oculta do app (appDataFolder): só este app enxerga,
     não aparece no Drive do usuário e não gasta nada de hospedagem.
   - Escopo mínimo: drive.appdata.
   - A mesclagem é por registro (id + updatedAt): o mais recente vence;
     exclusões viajam como "tombstones". Não perde lançamentos feitos nos dois aparelhos. */

/* ---------- mesclagem (função pura, testada em Node) ---------- */
const SYNC_TOMB_TTL = 180 * 86400000; // esquece exclusões com mais de 180 dias

function syncMerge(L, R, now = Date.now()) {
  const ts = x => x.updatedAt || x.createdAt || 0;
  const tombs = { ...(R.tombstones || {}) };
  Object.entries(L.tombstones || {}).forEach(([id, t]) => { tombs[id] = Math.max(tombs[id] || 0, t); });
  Object.keys(tombs).forEach(id => { if (now - tombs[id] > SYNC_TOMB_TTL) delete tombs[id]; });

  const mergeArr = (a, b) => {
    const m = new Map();
    (a || []).forEach(x => m.set(x.id, x));
    (b || []).forEach(x => {
      const cur = m.get(x.id);
      if (!cur || ts(x) > ts(cur)) m.set(x.id, x);   // empate: fica o local
    });
    return [...m.values()].filter(x => !(tombs[x.id] && tombs[x.id] >= ts(x)));
  };
  return {
    categories: mergeArr(L.categories, R.categories),
    transactions: mergeArr(L.transactions, R.transactions),
    tombstones: tombs,
  };
}
function syncSig(d) {
  const by = a => [...(a || [])].sort((x, y) => (x.id < y.id ? -1 : 1));
  const tomb = Object.entries(d.tombstones || {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([by(d.categories), by(d.transactions), tomb]);
}

if (typeof module !== 'undefined') module.exports = { syncMerge, syncSig };

/* ---------- Google Drive ---------- */
const Sync = (() => {
  if (typeof window === 'undefined') return {};
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE = 'controle-gastos.json';
  const API = 'https://www.googleapis.com';
  const st = { status: 'off', msg: '', last: null, connected: false, clientId: '' };
  let token = null, tokenExp = 0, running = false, again = false, timer = null;

  const emit = () => {
    if (typeof currentRoute === 'function' && currentRoute() === 'config' && typeof refresh === 'function' && !$('#modal').open) refresh();
  };
  const set = (status, msg = '') => { st.status = status; st.msg = msg; emit(); };

  async function settings() { return (await Store.getMeta('sync')) || {}; }
  async function save(patch) { const s = { ...(await settings()), ...patch }; await Store.setMeta('sync', s); Object.assign(st, s); return s; }
  const clientId = () => (window.APP_CONFIG && window.APP_CONFIG.googleClientId) || st.clientId || '';

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Sem conexão com o Google. Tente de novo quando estiver online.'));
      document.head.appendChild(s);
    });
  }

  /* interactive=true abre a janela de login/consentimento do Google;
     false tenta renovar em silêncio (prompt 'none') */
  async function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return token;
    const cid = clientId();
    if (!cid) throw new Error('Falta o ID do cliente Google (veja Ajustes).');
    await loadGsi();
    return new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: SCOPE,
        callback: r => {
          if (r.error) { reject(Object.assign(new Error(r.error_description || r.error), { code: r.error })); return; }
          token = r.access_token;
          tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          resolve(token);
        },
        error_callback: e => reject(Object.assign(new Error((e && (e.message || e.type)) || 'Falha na autorização'), { code: (e && e.type) || 'auth_error' })),
      });
      tc.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (r.status === 401) { token = null; throw Object.assign(new Error('Sessão do Google expirada'), { code: 'auth_expired' }); }
    if (!r.ok) throw new Error('Google Drive respondeu ' + r.status);
    return r;
  }
  async function findFile() {
    const q = encodeURIComponent(`name='${FILE}'`);
    const r = await api(`${API}/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=1`);
    const j = await r.json();
    return j.files && j.files[0];
  }
  async function download(id) { return (await api(`${API}/drive/v3/files/${id}?alt=media`)).json(); }
  async function upload(id, data) {
    const json = JSON.stringify({ app: 'controle-gastos', version: 2, savedAt: Date.now(), ...data });
    if (id) {
      await api(`${API}/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
      return;
    }
    const b = 'cg' + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n`
      + `--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
    await api(`${API}/upload/drive/v3/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
  }

  async function run(interactive = false) {
    if (running) { again = true; return; }
    if (!st.connected && !interactive) return;
    if (!navigator.onLine) { set('offline', 'Sem internet. Sincroniza quando voltar.'); return; }
    running = true;
    set('syncing');
    try {
      await getToken(interactive);
      const file = await findFile();
      const local = await Store.snapshot();
      let merged = local, remote = null;
      if (file) { remote = await download(file.id); merged = syncMerge(local, remote); }
      let changedLocal = false;
      if (remote && syncSig(merged) !== syncSig(local)) { await Store.applyMerged(merged); changedLocal = true; }
      if (!remote || syncSig(merged) !== syncSig(remote)) await upload(file && file.id, merged);
      await save({ connected: true, last: Date.now() });
      set('idle');
      if (changedLocal && typeof refresh === 'function') refresh();
    } catch (e) {
      const needAuth = ['interaction_required', 'login_required', 'consent_required', 'auth_expired', 'popup_failed_to_open', 'popup_closed', 'access_denied'].includes(e.code);
      set(needAuth ? 'needs-auth' : 'error', e.message);
      if (interactive) throw e;
    } finally {
      running = false;
      if (again) { again = false; schedule(1500); }
    }
  }

  function schedule(ms = 4000) {
    if (!st.connected) return;
    clearTimeout(timer);
    timer = setTimeout(() => run(false), ms);
  }

  return {
    state: st,
    clientId,
    async init() {
      Object.assign(st, await settings());
      if (st.connected) {
        st.status = 'idle';
        schedule(1200);
        window.addEventListener('online', () => schedule(500));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(800); });
      }
    },
    schedule,
    now: () => run(true),                     // botão "Sincronizar agora"
    async connect(cid) {
      if (!(window.APP_CONFIG && window.APP_CONFIG.googleClientId) && cid) await save({ clientId: cid.trim() });
      token = null;
      await run(true);                         // abre o login do Google e faz a 1ª sincronização
      window.addEventListener('online', () => schedule(500));
    },
    async disconnect() {
      try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) { /* ignorar */ }
      token = null; clearTimeout(timer);
      await save({ connected: false, last: null });
      set('off');
    },
  };
})();
