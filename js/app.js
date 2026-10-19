'use strict';
/* Inicialização, navegação SPA (troca de conteúdo na mesma janela),
   alertas de vencimento e registro do service worker. */

const NAV = [
  ['painel', 'Painel', 'Painel', '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'],
  ['lancamentos', 'Lançamentos', 'Lançam.', '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'],
  ['contas', 'Contas a pagar/receber', 'Contas', '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'],
  ['fluxo', 'Fluxo de caixa', 'Fluxo', '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>'],
  ['relatorios', 'Relatórios (DRE)', 'Relat.', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'],
  ['categorias', 'Categorias', 'Categ.', '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>'],
  ['config', 'Ajustes', 'Ajustes', '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'],
];
const FAB_ROUTES = ['painel', 'lancamentos', 'contas'];

/* ---------- identidade (foto/logo + nome), fixa no topo ---------- */
const DEFAULT_NAME = 'Controle de Gastos';
const brandName = () => (Store.profile && Store.profile.name) || DEFAULT_NAME;
function brandMarkHtml(size) {
  const p = Store.profile || {};
  if (Store.validLogo(p.logo)) {
    return `<img class="bimg${p.shape === 'round' ? ' round' : ''}" src="${p.logo}" alt="Logo"${size ? ` style="width:${size}px;height:${size}px"` : ''}>`;
  }
  return `<span class="logo" aria-hidden="true"${size ? ` style="width:${size}px;height:${size}px"` : ''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg></span>`;
}
function renderBrand() {
  const html = `${brandMarkHtml()}<span class="bname">${esc(brandName())}</span>`;
  $('#brand').innerHTML = html;
  $('#topbar').innerHTML = html;
  document.title = brandName();
}

/* reduz a imagem escolhida (máx. 320 px) e devolve um data URL pequeno */
async function fileToLogo(file) {
  if (!/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem (PNG, JPG, WebP ou SVG).');
  if (file.size > 8 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 8 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const w0 = img.naturalWidth || 320, h0 = img.naturalHeight || 320, max = 320;
    const isSvg = /svg/.test(file.type);
    const k = isSvg ? max / Math.max(w0, h0) : Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const keepAlpha = /png|webp|gif|svg/.test(file.type);
    const out = c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.9);
    if (!Store.validLogo(out)) throw new Error('Imagem complexa demais. Tente uma versão menor.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}

function currentRoute() {
  const r = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return NAV.some(n => n[0] === r) ? r : 'painel';
}
/* atalhos do ícone do app: #/lancamentos?novo=1 abre o formulário de novo lançamento */
function wantsNew() {
  const h = location.hash || '', i = h.indexOf('?');
  return i >= 0 && new URLSearchParams(h.slice(i + 1)).has('novo');
}

function buildNav() {
  const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  $('#nav').innerHTML = NAV.map(([id, l, , p]) => `<a href="#/${id}" data-r="${id}">${svg(p)}<span>${l}</span></a>`).join('');
  $('#bottomnav').innerHTML = NAV.map(([id, , s, p]) => `<a href="#/${id}" data-r="${id}">${svg(p)}<span>${s}</span></a>`).join('');
}

function render() {
  const route = currentRoute();
  $$('#nav a, #bottomnav a').forEach(a => {
    const on = a.dataset.r === route;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#fab').hidden = !FAB_ROUTES.includes(route);
  Charts.reset();
  Views[route]($('#view'));
  if (wantsNew()) {
    history.replaceState(null, '', '#/' + route);
    openTxForm(null, route === 'contas' ? { type: 'despesa', paid: false } : {});
  }
}

/* re-desenha a tela atual (depois de salvar algo, trocar filtro etc.) */
function refresh() { render(); }

const App = {
  /* Avisa das contas vencidas / a vencer em 3 dias (uma vez por dia, ao abrir o app) */
  async notifyDue(force) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = todayStr();
    if (!force && (await Store.getMeta('lastNotify')) === today) return;
    const due = Store.transactions.filter(t => !t.paid && t.type === 'despesa' && t.date <= addDays(today, 3));
    if (!due.length) return;
    await Store.setMeta('lastNotify', today);
    const late = due.filter(t => t.date < today).length;
    const body = `${late ? late + ' vencida' + (late > 1 ? 's' : '') + ' · ' : ''}${due.length - late} vencendo em até 3 dias — ${fmt(due.reduce((s, t) => s + t.amount, 0))}`;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) reg.showNotification('Contas a pagar', { body, icon: 'icons/icon-192.png', tag: 'due' });
      else new Notification('Contas a pagar', { body, icon: 'icons/icon-192.png' });
    } catch (e) { /* ignorar */ }
  },
};

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.deferredInstall = e; if (currentRoute() === 'config') refresh(); });
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

(async function boot() {
  buildNav();
  try {
    await Store.init();
  } catch (err) {
    $('#view').innerHTML = `<div class="card empty"><b>Não foi possível abrir o armazenamento local</b>${esc(err && err.message || err)}<br>Verifique se o navegador permite dados do site (fora do modo anônimo).</div>`;
    return;
  }
  renderBrand();
  /* senha opcional: bloqueia a tela antes de mostrar qualquer dado */
  if (await Lock.isSet() && !Lock.unlocked()) await Lock.prompt();
  $('#fab').onclick = () => {
    const r = currentRoute();
    if (r === 'contas') openTxForm(null, { type: UI.contasTab === 'pagar' ? 'despesa' : 'receita', paid: false });
    else openTxForm(null);
  };
  $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
  render();
  App.notifyDue();
  Sync.init();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* funciona sem offline */ });
  }
})();
