'use strict';
/* Camada de dados local (IndexedDB). Tudo fica no aparelho do usuário.
   Modelo:
   - categoria:  { id, name, type: 'despesa'|'receita', color }
   - lançamento: { id, type, amount (centavos), date 'YYYY-MM-DD', categoryId, desc,
                   paid (bool), paidDate?, createdAt }
   Lançamento com paid=false é uma conta a pagar/receber (date = vencimento). */

const DEFAULT_CATEGORIES = [
  ['Alimentação', 'despesa', '#2a78d6'],
  ['Moradia', 'despesa', '#eb6834'],
  ['Transporte', 'despesa', '#1baf7a'],
  ['Saúde', 'despesa', '#eda100'],
  ['Educação', 'despesa', '#e87ba4'],
  ['Lazer', 'despesa', '#008300'],
  ['Fornecedores', 'despesa', '#6250d6'],
  ['Impostos e taxas', 'despesa', '#e34948'],
  ['Outras despesas', 'despesa', '#8a8984'],
  ['Vendas', 'receita', '#2a78d6'],
  ['Serviços', 'receita', '#1baf7a'],
  ['Salário', 'receita', '#6250d6'],
  ['Outras receitas', 'receita', '#8a8984'],
];

const Store = {
  db: null,
  categories: [],
  transactions: [],

  /* ---- baixo nível ---- */
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('controle-gastos', 1);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        d.createObjectStore('transactions', { keyPath: 'id' });
        d.createObjectStore('categories', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  _getAll(store) {
    return new Promise((res, rej) => {
      const r = this.db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  _run(store, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  _put(store, obj) { return this._run(store, s => s.put(obj)); },
  _del(store, id) { return this._run(store, s => s.delete(id)); },
  _clear(store) { return this._run(store, s => s.clear()); },
  async getMeta(key) {
    return new Promise(res => {
      const r = this.db.transaction('meta').objectStore('meta').get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => res(null);
    });
  },
  setMeta(key, value) { return this._put('meta', { key, value }); },

  /* ---- ciclo de vida ---- */
  async init() {
    await this.open();
    await this.load();
    if (!(await this.getMeta('seeded'))) {
      if (this.categories.length === 0) {
        /* ids fixos: dois aparelhos novos geram as MESMAS categorias padrão
           (updatedAt 0 = qualquer edição do usuário vence na sincronização) */
        let n = 0;
        for (const [name, type, color] of DEFAULT_CATEGORIES) {
          await this._put('categories', { id: 'def-' + (++n), name, type, color, updatedAt: 0 });
        }
      }
      await this.setMeta('seeded', true);
      await this.load();
    }
  },
  async load() {
    this.categories = await this._getAll('categories');
    this.transactions = await this._getAll('transactions');
    this.profile = (await this.getMeta('profile')) || {};
  },

  /* identidade visual: { name, logo (data URL), shape: 'square'|'round' } — fica neste aparelho */
  profile: {},
  validLogo: s => typeof s === 'string' && s.length < 700000 && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s),
  async setProfile(p) {
    const clean = {
      name: String(p.name || '').trim().slice(0, 40),
      logo: this.validLogo(p.logo) ? p.logo : '',
      shape: p.shape === 'round' ? 'round' : 'square',
    };
    await this.setMeta('profile', clean);
    this.profile = clean;
  },

  /* ---- consultas ---- */
  cat(id) { return this.categories.find(c => c.id === id); },
  catName(id) { const c = this.cat(id); return c ? c.name : 'Sem categoria'; },
  catColor(id) { const c = this.cat(id); return c ? c.color : '#8a8984'; },
  catsOf(type) { return this.categories.filter(c => c.type === type).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); },
  /* data efetiva: lançamentos pagos contam na data do pagamento */
  eff(t) { return t.paid ? (t.paidDate || t.date) : t.date; },

  /* ---- sincronização: apagados e mesclagem ----
     Cada registro leva updatedAt; exclusões ficam como "tombstones"
     ({ id: momento }) para que a exclusão também chegue ao outro aparelho. */
  async getTombs() { return (await this.getMeta('tombstones')) || {}; },
  async addTombs(ids) {
    const t = await this.getTombs();
    const now = Date.now();
    ids.forEach(id => { t[id] = now; });
    await this.setMeta('tombstones', t);
  },
  _changed() { if (typeof Sync !== 'undefined') Sync.schedule(); },
  snapshot() {
    return this.getTombs().then(tombstones => ({
      categories: this.categories, transactions: this.transactions, tombstones,
    }));
  },
  /* troca o conteúdo local pelo resultado da mesclagem (não dispara nova sincronização) */
  async applyMerged(m) {
    const replace = (store, arr) => this._run(store, s => { s.clear(); arr.forEach(o => s.put(o)); });
    await replace('categories', m.categories);
    await replace('transactions', m.transactions);
    await this.setMeta('tombstones', m.tombstones || {});
    await this.load();
  },

  /* ---- lançamentos ---- */
  async saveTx(t) {
    t.updatedAt = Date.now();
    await this._put('transactions', t);
    const i = this.transactions.findIndex(x => x.id === t.id);
    if (i >= 0) this.transactions[i] = t; else this.transactions.push(t);
    this._changed();
  },
  async deleteTx(id) {
    await this._del('transactions', id);
    await this.addTombs([id]);
    this.transactions = this.transactions.filter(t => t.id !== id);
    this._changed();
  },

  /* ---- categorias ---- */
  async saveCat(c) {
    c.updatedAt = Date.now();
    await this._put('categories', c);
    const i = this.categories.findIndex(x => x.id === c.id);
    if (i >= 0) this.categories[i] = c; else this.categories.push(c);
    this._changed();
  },
  async deleteCat(id) {
    await this._del('categories', id);
    await this.addTombs([id]);
    this.categories = this.categories.filter(c => c.id !== id);
    this._changed();
  },

  /* ---- backup ---- */
  exportData() {
    return JSON.stringify({
      app: 'controle-gastos', version: 1, exportedAt: new Date().toISOString(),
      categories: this.categories, transactions: this.transactions, profile: this.profile,
    }, null, 2);
  },
  async importData(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido (não é JSON).'); }
    if (!data || data.app !== 'controle-gastos' || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) {
      throw new Error('Este arquivo não é um backup do Controle de Gastos.');
    }
    const okTx = t => t && t.id && (t.type === 'despesa' || t.type === 'receita')
      && Number.isInteger(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
    const okCat = c => c && c.id && c.name && (c.type === 'despesa' || c.type === 'receita');
    const now = Date.now();
    const txs = data.transactions.filter(okTx).map(t => ({ ...t, updatedAt: now }));
    const cats = data.categories.filter(okCat).map(c => ({ ...c, updatedAt: now }));
    /* o que existia e não está no arquivo vira "apagado" (vale também na nuvem) */
    const keep = new Set([...txs, ...cats].map(x => x.id));
    const gone = [...this.transactions, ...this.categories].map(x => x.id).filter(id => !keep.has(id));
    await this._clear('transactions');
    await this._clear('categories');
    for (const c of cats) await this._put('categories', c);
    for (const t of txs) await this._put('transactions', t);
    await this.addTombs(gone);
    await this.setMeta('seeded', true);
    if (data.profile && typeof data.profile === 'object') await this.setProfile(data.profile);
    await this.load();
    this._changed();
    return { categories: cats.length, transactions: txs.length, ignored: (data.transactions.length - txs.length) };
  },
  /* apaga lançamentos e categorias; mantém senha e conexão com a nuvem */
  async wipe() {
    await this.addTombs([...this.transactions, ...this.categories].map(x => x.id));
    await this._clear('transactions');
    await this._clear('categories');
    await this.setMeta('seeded', false);
    await this.load();
    await this.init();
    const tombs = await this.getTombs();      /* categorias padrão voltam a existir */
    Object.keys(tombs).filter(id => id.startsWith('def-')).forEach(id => delete tombs[id]);
    await this.setMeta('tombstones', tombs);
    this._changed();
  },

  /* ---- dados de exemplo (para demonstração) ---- */
  async loadDemo() {
    const exp = this.catsOf('despesa'), inc = this.catsOf('receita');
    const byName = (list, n) => (list.find(c => c.name === n) || list[0]).id;
    const cur = currentMonth();
    const today = todayStr();
    const rows = [];
    for (const off of [-2, -1, 0]) {
      const k = addMonths(cur, off);
      const mk = d => k + '-' + String(d).padStart(2, '0');
      const scale = off === 0 ? 0.8 : off === -1 ? 1 : 0.9;
      const add = (type, day, value, cat, desc) => {
        const date = mk(day);
        const paid = date <= today;
        rows.push({ id: uid(), type, amount: Math.round(value * scale * 100), date, categoryId: cat, desc, paid, paidDate: paid ? date : undefined, createdAt: Date.now() });
      };
      add('receita', 5, 6200, byName(inc, 'Vendas'), 'Vendas da semana 1');
      add('receita', 12, 4100, byName(inc, 'Vendas'), 'Vendas da semana 2');
      add('receita', 20, 3300, byName(inc, 'Serviços'), 'Serviço prestado');
      add('despesa', 3, 1800, byName(exp, 'Moradia'), 'Aluguel');
      add('despesa', 6, 1450, byName(exp, 'Fornecedores'), 'Compra de insumos');
      add('despesa', 9, 620, byName(exp, 'Alimentação'), 'Supermercado');
      add('despesa', 11, 380, byName(exp, 'Transporte'), 'Combustível');
      add('despesa', 14, 290, byName(exp, 'Saúde'), 'Farmácia');
      add('despesa', 18, 540, byName(exp, 'Lazer'), 'Fim de semana');
      add('despesa', 22, 760, byName(exp, 'Impostos e taxas'), 'Impostos');
      add('despesa', 27, 910, byName(exp, 'Fornecedores'), 'Reposição de estoque');
    }
    const nx = addMonths(cur, 1);
    rows.push({ id: uid(), type: 'despesa', amount: 180000, date: nx + '-03', categoryId: byName(exp, 'Moradia'), desc: 'Aluguel', paid: false, createdAt: Date.now() });
    rows.push({ id: uid(), type: 'receita', amount: 520000, date: nx + '-05', categoryId: byName(inc, 'Vendas'), desc: 'Vendas previstas', paid: false, createdAt: Date.now() });
    rows.push({ id: uid(), type: 'despesa', amount: 98000, date: addDays(today, 2), categoryId: byName(exp, 'Fornecedores'), desc: 'Boleto fornecedor', paid: false, createdAt: Date.now() });
    rows.push({ id: uid(), type: 'despesa', amount: 45000, date: addDays(today, -3), categoryId: byName(exp, 'Impostos e taxas'), desc: 'Guia de imposto', paid: false, createdAt: Date.now() });
    rows.push({ id: uid(), type: 'receita', amount: 150000, date: addDays(today, 6), categoryId: byName(inc, 'Serviços'), desc: 'Cliente a receber', paid: false, createdAt: Date.now() });
    for (const r of rows) await this.saveTx(r);
    return rows.length;
  },
};
