'use strict';
/* Telas (exceto o painel, que fica em painel.js) e formulários */

const Views = {};
const UI = {
  month: currentMonth(),
  lanFilter: 'todos',
  lanQ: '',
  contasTab: 'pagar',
  horizon: 60,
  painel: null, // iniciado em painel.js
};

/* ---------- helpers ---------- */
function openModal(html, ready) {
  const m = $('#modal');
  m.innerHTML = html;
  if (!m.open) m.showModal();
  if (ready) ready(m);
}
function closeModal() { const m = $('#modal'); if (m.open) m.close(); }

function monthNavHtml(id, key) {
  return `<div class="monthnav" id="${id}"><button type="button" data-d="-1" aria-label="Mês anterior">‹</button>`
    + `<input type="month" value="${key}" aria-label="Mês"><button type="button" data-d="1" aria-label="Próximo mês">›</button></div>`;
}
function bindMonthNav(root, id, get, set) {
  const n = $('#' + id, root);
  if (!n) return;
  n.querySelectorAll('button').forEach(b => { b.onclick = () => { set(addMonths(get(), +b.dataset.d)); refresh(); }; });
  n.querySelector('input').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { set(e.target.value); refresh(); } };
}
function segHtml(id, items, current) {
  return `<div class="seg" id="${id}" role="group">${items.map(([v, l, cls]) =>
    `<button type="button" data-v="${v}" class="${v === current ? 'on ' : ''}${cls || ''}">${l}</button>`).join('')}</div>`;
}
function bindSeg(root, id, cb) {
  const s = $('#' + id, root);
  if (s) s.querySelectorAll('button').forEach(b => { b.onclick = () => cb(b.dataset.v); });
}
const sign = t => (t.type === 'receita' ? '+ ' : '− ');
const dayTitle = s => `${weekday(s)}, ${fmtDate(s)}`;

function dueBadge(t) {
  const d = daysBetween(todayStr(), t.date);
  if (d < 0) return `<span class="badge late">vencida há ${-d} dia${d === -1 ? '' : 's'}</span>`;
  if (d === 0) return '<span class="badge soon">vence hoje</span>';
  if (d <= 3) return `<span class="badge soon">em ${d} dia${d === 1 ? '' : 's'}</span>`;
  return `<span class="badge">em ${d} dias</span>`;
}

/* =====================================================================
   Formulário de lançamento
   ===================================================================== */
function openTxForm(tx, defaults = {}) {
  const edit = !!tx;
  let type = tx ? tx.type : (defaults.type || 'despesa');
  let paid = tx ? tx.paid : defaults.paid !== false;
  const dateInit = tx ? Store.eff(tx) : todayStr();

  const repOpts = [1, 2, 3, 4, 6, 12, 24].map(n => `<option value="${n}">${n === 1 ? 'Não repetir' : n + ' meses'}</option>`).join('');
  openModal(`
    <form class="sheet" id="txf" autocomplete="off">
      <h2>${edit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      <div class="seg" id="tt"><button type="button" data-t="despesa" class="exp">Despesa</button><button type="button" data-t="receita" class="inc">Receita</button></div>
      <div class="two">
        <label class="f">Valor (R$)<input id="fv" inputmode="decimal" placeholder="0,00" required></label>
        <label class="f"><span id="fdl">Data</span><input id="fd" type="date" required></label>
      </div>
      <label class="f">Descrição<input id="fdesc" type="text" placeholder="Ex.: Supermercado" maxlength="120"></label>
      <label class="f">Categoria<select id="fc"></select></label>
      <div class="seg" id="st"><button type="button" data-p="1"></button><button type="button" data-p="0"></button></div>
      ${edit ? '' : `<label class="f">Repetir todo mês<select id="frep">${repOpts}</select></label>`}
      <div class="acts">
        ${edit ? '<button type="button" class="btn danger" id="fdel">Excluir</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" id="fcancel">Cancelar</button>
        <button class="btn primary" type="submit">Salvar</button>
      </div>
    </form>`, m => {
    const fc = $('#fc', m);
    $('#fv', m).value = tx ? centsToInput(tx.amount) : '';
    $('#fd', m).value = dateInit;
    $('#fdesc', m).value = tx ? (tx.desc || '') : '';

    const sync = (keepCat) => {
      $$('#tt button', m).forEach(b => b.classList.toggle('on', b.dataset.t === type));
      $$('#st button', m).forEach(b => b.classList.toggle('on', (b.dataset.p === '1') === paid));
      const [b1, b0] = $$('#st button', m);
      b1.textContent = type === 'despesa' ? 'Já pago' : 'Já recebido';
      b0.textContent = type === 'despesa' ? 'Pendente (a pagar)' : 'Pendente (a receber)';
      $('#fdl', m).textContent = paid ? 'Data' : 'Vencimento';
      const cur = keepCat || fc.value;
      const cats = Store.catsOf(type);
      fc.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      if (cats.some(c => c.id === cur)) fc.value = cur;
    };
    sync(tx ? tx.categoryId : null);
    $$('#tt button', m).forEach(b => b.onclick = () => { type = b.dataset.t; sync(); });
    $$('#st button', m).forEach(b => b.onclick = () => { paid = b.dataset.p === '1'; sync(); });
    $('#fcancel', m).onclick = closeModal;
    if (edit) {
      $('#fdel', m).onclick = async () => {
        if (!confirm('Excluir este lançamento?')) return;
        await Store.deleteTx(tx.id); closeModal(); toast('Lançamento excluído'); refresh();
      };
    }
    $('#txf', m).onsubmit = async e => {
      e.preventDefault();
      const amount = parseMoney($('#fv', m).value);
      const date = $('#fd', m).value;
      if (amount <= 0) { toast('Informe um valor maior que zero'); $('#fv', m).focus(); return; }
      if (!date) { toast('Informe a data'); return; }
      if (!fc.value) { toast('Crie uma categoria primeiro (menu Categorias)'); return; }
      const desc = $('#fdesc', m).value.trim();
      const n = edit ? 1 : parseInt($('#frep', m).value, 10) || 1;
      for (let i = 0; i < n; i++) {
        const d = addMonthsToDate(date, i);
        const isPaid = i === 0 ? paid : false;
        const t = {
          id: edit ? tx.id : uid(), type, amount, date: d, categoryId: fc.value,
          desc: n > 1 ? `${desc || Store.catName(fc.value)} (${i + 1}/${n})` : desc,
          paid: isPaid, createdAt: edit ? tx.createdAt : Date.now(),
        };
        if (isPaid) t.paidDate = d;
        await Store.saveTx(t);
      }
      closeModal();
      toast(edit ? 'Lançamento atualizado' : n > 1 ? `${n} lançamentos criados` : 'Lançamento salvo');
      refresh();
    };
    setTimeout(() => $('#fv', m).focus(), 50);
  });
}

/* =====================================================================
   Lançamentos
   ===================================================================== */
Views.lancamentos = el => {
  const { from, to } = monthRange(UI.month);
  const inMonth = Store.transactions.filter(t => { const d = Store.eff(t); return d >= from && d <= to; });
  const sum = (type, paid) => inMonth.filter(t => t.type === type && t.paid === paid).reduce((s, t) => s + t.amount, 0);
  const inc = sum('receita', true), exp = sum('despesa', true);
  const pendOut = sum('despesa', false), pendIn = sum('receita', false);

  el.innerHTML = `
    <div class="page-head"><div><h1>Lançamentos</h1><div class="sub">Entradas e saídas do mês</div></div>
      <button class="btn primary" id="addtx"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Novo lançamento</button></div>
    <div class="toolbar">
      ${monthNavHtml('mn', UI.month)}
      ${segHtml('lf', [['todos', 'Todos'], ['receita', 'Receitas', 'inc'], ['despesa', 'Despesas', 'exp'], ['pendente', 'Pendentes']], UI.lanFilter)}
      <div class="grow"></div>
      <input type="search" id="lq" placeholder="Buscar…" value="${esc(UI.lanQ)}" style="max-width:220px" aria-label="Buscar lançamento">
    </div>
    <div class="cards">
      <div class="card stat"><div class="lbl">Receitas</div><div class="val">${fmt(inc)}</div><div class="cmp">${pendIn ? `+ ${fmt(pendIn)} a receber` : 'recebido no mês'}</div></div>
      <div class="card stat"><div class="lbl">Despesas</div><div class="val">${fmt(exp)}</div><div class="cmp">${pendOut ? `+ ${fmt(pendOut)} a pagar` : 'pago no mês'}</div></div>
      <div class="card stat"><div class="lbl">Saldo do mês</div><div class="val">${fmt(inc - exp)}</div><div class="cmp">receitas − despesas</div></div>
    </div>
    <div class="list" id="lanlist"></div>`;

  const draw = () => {
    const q = UI.lanQ.trim().toLowerCase();
    let list = inMonth.filter(t => {
      if (UI.lanFilter === 'receita' && t.type !== 'receita') return false;
      if (UI.lanFilter === 'despesa' && t.type !== 'despesa') return false;
      if (UI.lanFilter === 'pendente' && t.paid) return false;
      if (q && !((t.desc || '') + ' ' + Store.catName(t.categoryId)).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => Store.eff(b).localeCompare(Store.eff(a)) || b.createdAt - a.createdAt);
    const box = $('#lanlist', el);
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>Nenhum lançamento</b>${Store.transactions.length ? 'Nada encontrado com esse filtro neste mês.' : 'Toque em “Novo lançamento” para começar.'}</div>`;
      return;
    }
    let html = '', last = '';
    list.forEach(t => {
      const d = Store.eff(t);
      if (d !== last) { html += `<div class="day">${dayTitle(d)}</div>`; last = d; }
      html += `<div class="row" data-id="${t.id}" role="button" tabindex="0">
        <span class="dot" style="background:${Store.catColor(t.categoryId)}"></span>
        <div class="main"><div class="t">${esc(t.desc || Store.catName(t.categoryId))}</div>
          <div class="s">${esc(Store.catName(t.categoryId))}${t.paid ? '' : ' · vence ' + fmtDM(t.date)}</div></div>
        ${t.paid ? '' : '<span class="badge pend">pendente</span>'}
        <span class="amt">${sign(t)}${fmt(t.amount)}</span></div>`;
    });
    box.innerHTML = html;
    $$('.row', box).forEach(r => {
      const open = () => openTxForm(Store.transactions.find(t => t.id === r.dataset.id));
      r.onclick = open;
      r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  };
  draw();
  bindMonthNav(el, 'mn', () => UI.month, v => { UI.month = v; });
  bindSeg(el, 'lf', v => { UI.lanFilter = v; refresh(); });
  $('#lq', el).oninput = debounce(e => { UI.lanQ = e.target.value; draw(); }, 120);
  $('#addtx', el).onclick = () => openTxForm(null);
};

/* =====================================================================
   Contas a pagar / a receber
   ===================================================================== */
Views.contas = el => {
  const pagar = UI.contasTab === 'pagar';
  const type = pagar ? 'despesa' : 'receita';
  const today = todayStr();
  const list = Store.transactions.filter(t => !t.paid && t.type === type).sort((a, b) => a.date.localeCompare(b.date));
  const total = list.reduce((s, t) => s + t.amount, 0);
  const late = list.filter(t => t.date < today);
  const lateSum = late.reduce((s, t) => s + t.amount, 0);
  const week = list.filter(t => t.date >= today && t.date <= addDays(today, 7)).reduce((s, t) => s + t.amount, 0);

  el.innerHTML = `
    <div class="page-head"><div><h1>Contas a pagar e a receber</h1><div class="sub">Compromissos com vencimento e alertas</div></div>
      <button class="btn primary" id="addc"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Nova conta</button></div>
    <div class="toolbar">${segHtml('ct', [['pagar', 'A pagar', 'exp'], ['receber', 'A receber', 'inc']], UI.contasTab)}</div>
    <div class="cards">
      <div class="card stat"><div class="lbl">Total em aberto</div><div class="val">${fmt(total)}</div><div class="cmp">${list.length} conta${list.length === 1 ? '' : 's'}</div></div>
      <div class="card stat"><div class="lbl">${pagar ? 'Vencidas' : 'Atrasadas'}</div><div class="val">${fmt(lateSum)}</div><div class="cmp">${late.length} conta${late.length === 1 ? '' : 's'}</div></div>
      <div class="card stat"><div class="lbl">Próximos 7 dias</div><div class="val">${fmt(week)}</div><div class="cmp">até ${fmtDM(addDays(today, 7))}</div></div>
    </div>
    <div class="list mt" id="clist"></div>`;

  const box = $('#clist', el);
  if (!list.length) {
    box.innerHTML = `<div class="empty"><b>Nenhuma conta em aberto</b>Cadastre uma conta com vencimento usando “Nova conta”.</div>`;
  } else {
    box.innerHTML = list.map(t => `
      <div class="row" data-id="${t.id}" role="button" tabindex="0">
        <span class="dot" style="background:${Store.catColor(t.categoryId)}"></span>
        <div class="main"><div class="t">${esc(t.desc || Store.catName(t.categoryId))}</div>
          <div class="s">${fmtDate(t.date)} · ${esc(Store.catName(t.categoryId))}</div></div>
        ${dueBadge(t)}
        <span class="amt">${fmt(t.amount)}</span>
        <div class="acts"><button class="btn small primary" data-pay="${t.id}">${pagar ? 'Pagar' : 'Receber'}</button></div>
      </div>`).join('');
    $$('.row', box).forEach(r => {
      const open = () => openTxForm(Store.transactions.find(t => t.id === r.dataset.id));
      r.onclick = open;
      r.onkeydown = e => { if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } };
    });
    $$('[data-pay]', box).forEach(b => {
      b.onclick = async e => {
        e.stopPropagation();
        const t = Store.transactions.find(x => x.id === b.dataset.pay);
        await Store.saveTx({ ...t, paid: true, paidDate: todayStr() });
        toast(pagar ? 'Conta marcada como paga' : 'Conta marcada como recebida');
        refresh();
      };
    });
  }
  bindSeg(el, 'ct', v => { UI.contasTab = v; refresh(); });
  $('#addc', el).onclick = () => openTxForm(null, { type, paid: false });
};

/* =====================================================================
   Fluxo de caixa (saldo + projeção)
   ===================================================================== */
function computeCashflow(horizon) {
  const today = todayStr(), end = addDays(today, horizon);
  const balanceNow = Store.transactions.filter(t => t.paid)
    .reduce((s, t) => s + (t.type === 'receita' ? t.amount : -t.amount), 0);
  const pend = Store.transactions.filter(t => !t.paid && t.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const delta = new Array(horizon + 1).fill(0);
  let inc = 0, out = 0;
  pend.forEach(t => {
    const i = Math.max(0, daysBetween(today, t.date)); // vencidas entram em "hoje"
    const v = t.type === 'receita' ? t.amount : -t.amount;
    delta[i] += v;
    if (v > 0) inc += v; else out += -v;
  });
  const bal = [];
  let acc = balanceNow;
  delta.forEach(d => { acc += d; bal.push(acc); });
  return { today, end, balanceNow, pend, bal, inc, out };
}

Views.fluxo = el => {
  const H = UI.horizon;
  const cf = computeCashflow(H);
  const endBal = cf.bal[cf.bal.length - 1];
  const neg = cf.bal.findIndex(v => v < 0);

  el.innerHTML = `
    <div class="page-head"><div><h1>Fluxo de caixa</h1><div class="sub">Saldo atual e projeção com base nas contas a pagar e a receber</div></div></div>
    <div class="toolbar">${segHtml('hz', [['30', '30 dias'], ['60', '60 dias'], ['90', '90 dias']], String(H))}</div>
    ${neg >= 0 ? `<div class="banner bad"><div class="grow"><b>Atenção:</b> o saldo previsto fica negativo em ${fmtDate(addDays(cf.today, neg))} (${fmt(cf.bal[neg])}).</div></div>` : ''}
    <div class="cards">
      <div class="card stat"><div class="lbl">Saldo atual</div><div class="val">${fmt(cf.balanceNow)}</div><div class="cmp">tudo que já foi pago/recebido</div></div>
      <div class="card stat"><div class="lbl">Entradas previstas</div><div class="val">${fmt(cf.inc)}</div><div class="cmp">a receber em ${H} dias</div></div>
      <div class="card stat"><div class="lbl">Saídas previstas</div><div class="val">${fmt(cf.out)}</div><div class="cmp">a pagar em ${H} dias</div></div>
      <div class="card stat"><div class="lbl">Saldo em ${fmtDM(cf.end)}</div><div class="val">${fmt(endBal)}</div><div class="cmp">${endBal >= cf.balanceNow ? '▲' : '▼'} ${fmt(Math.abs(endBal - cf.balanceNow))} em relação a hoje</div></div>
    </div>
    <div class="card mt"><div class="card-head"><h2>Saldo projetado</h2><div class="lgs"><span class="lg"><i style="background:var(--a)"></i>Saldo previsto</span></div></div>
      <div class="chart" id="cfchart"></div></div>
    <div class="card mt"><h2>Próximos lançamentos</h2>
      <div class="tbl-wrap" id="cftbl"></div></div>`;

  Charts.mount($('#cfchart', el), Charts.line({
    series: [{ name: 'Saldo previsto', color: 'var(--a)', values: cf.bal }],
    xLabel: i => (i === 0 ? 'Hoje' : fmtDM(addDays(cf.today, i))),
    xTitle: i => `${weekday(addDays(cf.today, i))}, ${fmtDate(addDays(cf.today, i))}`,
  }));

  let run = cf.balanceNow;
  const rows = cf.pend.slice(0, 80).map(t => {
    run += t.type === 'receita' ? t.amount : -t.amount;
    const late = t.date < cf.today;
    return `<tr><td>${fmtDate(t.date)}${late ? ' <span class="badge late">vencida</span>' : ''}</td>
      <td>${esc(t.desc || Store.catName(t.categoryId))}<div class="muted" style="font-size:12px">${esc(Store.catName(t.categoryId))}</div></td>
      <td class="num">${sign(t)}${fmt(t.amount)}</td><td class="num"><b>${fmt(run)}</b></td></tr>`;
  }).join('');
  $('#cftbl', el).innerHTML = cf.pend.length
    ? `<table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo após</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty"><b>Sem contas previstas</b>Cadastre contas a pagar e a receber para ver a projeção.</div>';
  bindSeg(el, 'hz', v => { UI.horizon = +v; refresh(); });
};

/* =====================================================================
   Categorias / plano de contas
   ===================================================================== */
const SWATCHES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#8a8984'];

function openCatForm(cat, type = 'despesa') {
  const edit = !!cat;
  let color = cat ? cat.color : SWATCHES[0];
  openModal(`
    <form class="sheet" id="cf" autocomplete="off">
      <h2>${edit ? 'Editar categoria' : 'Nova categoria'}</h2>
      <label class="f">Nome<input id="cn" type="text" maxlength="40" required></label>
      <label class="f">Tipo<select id="ct2" ${edit ? 'disabled' : ''}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      <div class="f"><span style="font-size:13px;color:var(--ink-2);font-weight:550">Cor</span>
        <div class="swatches" id="sw">${SWATCHES.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
        <input type="color" id="cc" aria-label="Escolher outra cor"></div></div>
      <div class="acts"><span class="spacer"></span><button type="button" class="btn" id="cx">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
    </form>`, m => {
    $('#cn', m).value = cat ? cat.name : '';
    $('#ct2', m).value = cat ? cat.type : type;
    const paint = () => { $$('#sw button', m).forEach(b => b.classList.toggle('on', b.dataset.c === color)); $('#cc', m).value = color; };
    paint();
    $$('#sw button', m).forEach(b => b.onclick = () => { color = b.dataset.c; paint(); });
    $('#cc', m).oninput = e => { color = e.target.value; paint(); };
    $('#cx', m).onclick = closeModal;
    $('#cf', m).onsubmit = async e => {
      e.preventDefault();
      const name = $('#cn', m).value.trim();
      if (!name) return;
      await Store.saveCat({ id: cat ? cat.id : uid(), name, type: cat ? cat.type : $('#ct2', m).value, color });
      closeModal(); toast('Categoria salva'); refresh();
    };
    setTimeout(() => $('#cn', m).focus(), 50);
  });
}

Views.categorias = el => {
  const section = (type, title) => {
    const cats = Store.catsOf(type);
    const rows = cats.map(c => {
      const n = Store.transactions.filter(t => t.categoryId === c.id).length;
      return `<div class="row" data-id="${c.id}" role="button" tabindex="0">
        <span class="dot" style="background:${c.color}"></span>
        <div class="main"><div class="t">${esc(c.name)}</div><div class="s">${n} lançamento${n === 1 ? '' : 's'}</div></div>
        <div class="acts"><button class="btn small danger" data-del="${c.id}" aria-label="Excluir ${esc(c.name)}">Excluir</button></div></div>`;
    }).join('') || '<div class="empty">Nenhuma categoria.</div>';
    return `<div class="card"><div class="card-head"><h2>${title}</h2><button class="btn small" data-new="${type}">+ Nova</button></div><div class="list">${rows}</div></div>`;
  };
  el.innerHTML = `
    <div class="page-head"><div><h1>Categorias</h1><div class="sub">Plano de contas: classifique cada lançamento para analisar melhor</div></div></div>
    <div class="grid2" style="margin-top:0">${section('despesa', 'Despesas')}${section('receita', 'Receitas')}</div>`;
  $$('[data-new]', el).forEach(b => b.onclick = () => openCatForm(null, b.dataset.new));
  $$('.row', el).forEach(r => {
    const open = () => openCatForm(Store.cat(r.dataset.id));
    r.onclick = open;
    r.onkeydown = e => { if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } };
  });
  $$('[data-del]', el).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const id = b.dataset.del, n = Store.transactions.filter(t => t.categoryId === id).length;
    if (n > 0) { toast(`Categoria em uso por ${n} lançamento${n === 1 ? '' : 's'}. Altere-os antes de excluir.`, 3800); return; }
    if (!confirm('Excluir esta categoria?')) return;
    await Store.deleteCat(id); toast('Categoria excluída'); refresh();
  });
};

/* =====================================================================
   Ajustes: backup, notificações, instalação
   ===================================================================== */
Views.config = el => {
  const notifOk = 'Notification' in window;
  const perm = notifOk ? Notification.permission : 'unsupported';
  el.innerHTML = `
    <div class="page-head"><div><h1>Ajustes</h1><div class="sub">Backup, alertas e instalação do app</div></div></div>
    <div class="card">
      <div class="set-row" id="profilerow"></div>
      <div class="set-row"><div class="d"><b>Exportar backup</b><span>Baixa um arquivo com todos os lançamentos e categorias. Use para guardar ou levar os dados para outro aparelho.</span></div>
        <button class="btn" id="exp">Exportar</button></div>
      <div class="set-row"><div class="d"><b>Importar backup</b><span>Substitui os dados deste aparelho pelos do arquivo escolhido.</span></div>
        <button class="btn" id="imp">Importar</button><input type="file" id="impf" accept="application/json,.json" hidden></div>
      <div class="set-row"><div class="d"><b>Alertas de vencimento</b><span>${notifOk
        ? (perm === 'granted' ? 'Ativados: ao abrir o app você é avisado das contas vencidas e das que vencem em até 3 dias.' : perm === 'denied' ? 'Bloqueados pelo navegador. Libere nas configurações do site.' : 'Ative para receber aviso das contas vencidas ou perto de vencer ao abrir o app.')
        : 'Este navegador não suporta notificações.'}</span></div>
        ${notifOk && perm === 'default' ? '<button class="btn" id="notif">Ativar</button>' : ''}</div>
      <div class="set-row" id="syncrow"></div>
      <div class="set-row" id="lockrow"></div>
      <div class="set-row"><div class="d"><b>Instalar o app</b><span>No celular: menu do navegador → “Adicionar à tela inicial”. No computador (Chrome/Edge): ícone de instalar na barra de endereço.</span></div>
        ${window.deferredInstall ? '<button class="btn primary" id="inst">Instalar</button>' : ''}</div>
      <div class="set-row"><div class="d"><b>Dados de exemplo</b><span>Adiciona lançamentos fictícios para você ver o painel funcionando. Podem ser apagados em “Apagar tudo”.</span></div>
        <button class="btn" id="demo">Carregar exemplo</button></div>
      <div class="set-row"><div class="d"><b>Apagar tudo</b><span>Remove todos os lançamentos e restaura as categorias padrão. Não dá para desfazer.</span></div>
        <button class="btn danger" id="wipe">Apagar tudo</button></div>
    </div>
    <p class="muted mt">Seus dados ficam neste aparelho. Se você conectar o Google Drive, uma cópia fica numa pasta oculta do app na sua própria conta (sem servidor e sem custo) e os aparelhos se mantêm iguais.</p>`;

  /* ----- identidade: foto/logo e nome no topo ----- */
  const drawProfile = () => {
    const p = Store.profile || {};
    const has = Store.validLogo(p.logo);
    $('#profilerow', el).innerHTML = `
      <div class="d"><b>Foto ou logo da empresa</b><span>Fica no topo em todas as telas e nos relatórios impressos.</span>
        <div class="prof-edit">
          <div class="prof-prev">${brandMarkHtml(64)}</div>
          <label class="f" style="flex:1;min-width:190px">Nome (empresa ou pessoa)<input id="pname" type="text" maxlength="40" placeholder="${DEFAULT_NAME}" value="${esc(p.name || '')}"></label>
        </div>
        ${has ? `<div style="margin-top:10px">${segHtml('pshape', [['square', 'Quadrada'], ['round', 'Redonda']], p.shape === 'round' ? 'round' : 'square')}</div>` : ''}
      </div>
      <button class="btn" id="plogo">${has ? 'Trocar imagem' : 'Escolher imagem'}</button>
      ${has ? '<button class="btn danger" id="prm">Remover</button>' : ''}
      <input type="file" id="pfile" accept="image/*" hidden>`;
    on1('plogo', () => $('#pfile', el).click());
    on1('prm', async () => { await Store.setProfile({ ...p, logo: '' }); renderBrand(); drawProfile(); toast('Imagem removida'); });
    $('#pfile', el).onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const logo = await fileToLogo(f);
        await Store.setProfile({ ...Store.profile, name: $('#pname', el).value, logo });
        renderBrand(); drawProfile(); toast('Imagem salva');
      } catch (err) { toast(err.message, 4000); }
      e.target.value = '';
    };
    $('#pname', el).onchange = async e => { await Store.setProfile({ ...Store.profile, name: e.target.value }); renderBrand(); toast('Nome salvo'); };
    bindSeg(el, 'pshape', async v => { await Store.setProfile({ ...Store.profile, shape: v }); renderBrand(); drawProfile(); });
  };
  const on1 = (id, fn) => { const n = $('#' + id, el); if (n) n.onclick = fn; };
  drawProfile();

  /* ----- sincronização (Google Drive) ----- */
  const S = Sync.state, cid = Sync.clientId();
  const when = S.last ? new Date(S.last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const statusTxt = !S.connected && S.status !== 'syncing'
    ? 'Não conectado. Conecte para manter celular e computador iguais.'
    : S.status === 'syncing' ? 'Sincronizando…'
      : S.status === 'needs-auth' ? 'Precisa entrar no Google de novo para continuar sincronizando.'
        : S.status === 'offline' || S.status === 'error' ? esc(S.msg || 'Não foi possível sincronizar.')
          : `Conectado${when ? ' · última sincronização ' + when : ''}.`;
  $('#syncrow', el).innerHTML = `
    <div class="d"><b>Sincronizar com o Google Drive</b><span>${statusTxt}</span>
      ${S.connected || cid ? '' : '<label class="f" style="margin-top:8px">ID do cliente Google (modo avançado)<input type="text" id="gcid" placeholder="123456-abc.apps.googleusercontent.com" autocomplete="off"></label>'}
    </div>
    ${S.connected
      ? `<button class="btn" id="syncnow"${S.status === 'syncing' ? ' disabled' : ''}>Sincronizar agora</button><button class="btn danger" id="syncoff">Desconectar</button>`
      : '<button class="btn primary" id="syncon">Conectar Google Drive</button>'}`;
  on1('syncon', async () => {
    const v = $('#gcid', el) ? $('#gcid', el).value.trim() : '';
    if (!cid && !v) { toast('Informe o ID do cliente Google (veja o GUIA-PUBLICAR)', 3800); return; }
    try { await Sync.connect(v); toast('Google Drive conectado'); } catch (e) { toast(e.message || 'Não foi possível conectar', 4200); }
  });
  on1('syncnow', async () => { try { await Sync.now(); toast('Sincronizado'); } catch (e) { toast(e.message, 4200); } });
  on1('syncoff', async () => { if (confirm('Desconectar o Google Drive? Os dados deste aparelho continuam aqui.')) { await Sync.disconnect(); refresh(); } });

  /* ----- senha ----- */
  Store.getMeta('lock').then(rec => {
    const row = $('#lockrow', el);
    if (!row) return;
    const ok = Lock.supported();
    row.innerHTML = `<div class="d"><b>Senha para abrir o app</b><span>${!ok
      ? 'Disponível quando o app é aberto por https ou localhost (por exemplo, instalado a partir do link publicado).'
      : rec ? 'Ativada. O app pede a senha ao ser aberto.' : 'Opcional. Impede que outra pessoa abra o app no seu aparelho.'}</span></div>
      ${!ok ? '' : rec
        ? '<button class="btn" id="lkchg">Alterar</button><button class="btn danger" id="lkrm">Remover</button>'
        : '<button class="btn" id="lkset">Definir senha</button>'}`;
    on1('lkset', () => Lock.openForm('set'));
    on1('lkchg', () => Lock.openForm('change'));
    on1('lkrm', () => Lock.openForm('remove'));
  });

  $('#exp', el).onclick = () => { download(`controle-gastos-${todayStr()}.json`, Store.exportData()); toast('Backup baixado'); };
  $('#imp', el).onclick = () => $('#impf', el).click();
  $('#impf', el).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm('Importar vai SUBSTITUIR os dados atuais deste aparelho. Continuar?')) { e.target.value = ''; return; }
    try {
      const r = await Store.importData(await f.text());
      toast(`Importado: ${r.transactions} lançamentos e ${r.categories} categorias`, 3600);
      refresh();
    } catch (err) { toast(err.message, 4000); }
    e.target.value = '';
  };
  const nb = $('#notif', el);
  if (nb) nb.onclick = async () => { await Notification.requestPermission(); refresh(); App.notifyDue(true); };
  const ib = $('#inst', el);
  if (ib) ib.onclick = async () => { window.deferredInstall.prompt(); await window.deferredInstall.userChoice; window.deferredInstall = null; refresh(); };
  $('#demo', el).onclick = async () => { const n = await Store.loadDemo(); toast(`${n} lançamentos de exemplo adicionados`); location.hash = '#/painel'; refresh(); };
  $('#wipe', el).onclick = async () => {
    if (!confirm('Apagar TODOS os dados deste aparelho?')) return;
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return;
    await Store.wipe(); toast('Dados apagados'); refresh();
  };
};
