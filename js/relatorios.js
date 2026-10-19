'use strict';
/* Relatórios: DRE (mês, ano ou intervalo) e extrato.
   Saída para impressora ou PDF (botão Imprimir → "Salvar como PDF"). Sem Excel. */

UI.rel = {
  tab: 'dre',            // 'dre' | 'extrato'
  mode: 'mes',           // 'mes' | 'ano' | 'intervalo'
  mes: currentMonth(),
  ano: new Date().getFullYear(),
  from: currentMonth() + '-01',
  to: todayStr(),
  basis: 'realizado',    // 'realizado' (pago/recebido) | 'previsto' (inclui pendentes)
};

function relPeriod() {
  const r = UI.rel;
  if (r.mode === 'ano') {
    const buckets = MESES3.map((l, i) => {
      const key = `${r.ano}-${pad(i + 1)}`;
      return { label: l, ...monthRange(key) };
    });
    return { from: `${r.ano}-01-01`, to: `${r.ano}-12-31`, buckets, title: `Ano de ${r.ano}`, annual: true };
  }
  if (r.mode === 'intervalo') {
    let from = r.from || todayStr(), to = r.to || from;
    if (from > to) [from, to] = [to, from];
    return { from, to, buckets: [{ label: 'Período', from, to }], title: `${fmtDate(from)} a ${fmtDate(to)}` };
  }
  const { from, to } = monthRange(r.mes);
  return { from, to, buckets: [{ label: monthLabelShort(r.mes), from, to }], title: monthLabel(r.mes) };
}

function relTransactions(P) {
  return Store.transactions
    .filter(t => (UI.rel.basis === 'previsto' || t.paid) && Store.eff(t) >= P.from && Store.eff(t) <= P.to)
    .sort((a, b) => Store.eff(a).localeCompare(Store.eff(b)) || (a.createdAt || 0) - (b.createdAt || 0));
}

/* matriz categoria x período para um tipo (receita/despesa) */
function relMatrix(txs, P, type) {
  const rows = new Map();
  txs.filter(t => t.type === type).forEach(t => {
    const d = Store.eff(t);
    const bi = P.buckets.findIndex(b => d >= b.from && d <= b.to);
    if (bi < 0) return;
    if (!rows.has(t.categoryId)) rows.set(t.categoryId, new Array(P.buckets.length).fill(0));
    rows.get(t.categoryId)[bi] += t.amount;
  });
  const list = [...rows.entries()].map(([id, vals]) => ({ id, name: Store.catName(id), vals, total: vals.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total);
  const totals = P.buckets.map((_, i) => list.reduce((s, r) => s + r.vals[i], 0));
  return { list, totals, total: totals.reduce((s, v) => s + v, 0) };
}

function relBasisText() {
  return UI.rel.basis === 'previsto'
    ? 'Regime: previsto (inclui contas pendentes, pela data de vencimento)'
    : 'Regime: realizado (somente o que já foi pago/recebido)';
}

function dreTable(P, txs) {
  const inc = relMatrix(txs, P, 'receita'), exp = relMatrix(txs, P, 'despesa');
  const n = P.buckets.length, single = n === 1;
  /* no ano inteiro os valores ficam sem "R$" para caber as 12 colunas (aviso no cabeçalho) */
  const money = single ? fmt : c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = v => `<td class="num">${v ? money(v) : '–'}</td>`;
  const pctCell = (v, base) => `<td class="num muted">${base ? ((v / base) * 100).toFixed(1).replace('.', ',') + '%' : '–'}</td>`;
  const head = `<tr><th>Descrição</th>${P.buckets.map(b => `<th class="num">${esc(b.label)}</th>`).join('')}${single ? '' : '<th class="num">Total</th>'}${single ? '<th class="num">% da receita</th>' : ''}</tr>`;
  const colspan = n + 2 + (single ? 0 : 0);

  const block = (title, m, totalLabel) => {
    let h = `<tr class="sec"><td colspan="${colspan}">${title}</td></tr>`;
    if (!m.list.length) h += `<tr><td colspan="${colspan}" class="muted">Nenhum lançamento</td></tr>`;
    m.list.forEach(r => {
      h += `<tr><td class="ind">${esc(r.name)}</td>${r.vals.map(cell).join('')}${single ? '' : cell(r.total)}${single ? pctCell(r.total, inc.total) : ''}</tr>`;
    });
    h += `<tr class="tot"><td>${totalLabel}</td>${m.totals.map(cell).join('')}${single ? '' : cell(m.total)}${single ? pctCell(m.total, inc.total) : ''}</tr>`;
    return h;
  };
  const res = inc.totals.map((v, i) => v - exp.totals[i]);
  const resTotal = inc.total - exp.total;
  const resCell = v => `<td class="num ${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : ''}${money(Math.abs(v))}</td>`;
  const margin = (r, b) => (b ? ((r / b) * 100).toFixed(1).replace('.', ',') + '%' : '–');

  return `<div class="tbl-wrap"><table class="tbl dre${single ? "" : " annual"}"><thead>${head}</thead><tbody>
    ${block('RECEITAS', inc, 'Total de receitas')}
    ${block('DESPESAS', exp, 'Total de despesas')}
    <tr class="res"><td>RESULTADO (receitas − despesas)</td>${res.map(resCell).join('')}${single ? '' : resCell(resTotal)}${single ? `<td class="num">${margin(resTotal, inc.total)}</td>` : ''}</tr>
    ${single ? '' : `<tr><td class="muted">Margem sobre a receita</td>${res.map((r, i) => `<td class="num muted">${margin(r, inc.totals[i])}</td>`).join('')}<td class="num muted">${margin(resTotal, inc.total)}</td></tr>`}
    </tbody></table></div>`;
}

function extratoTable(P, txs) {
  if (!txs.length) return '<div class="empty"><b>Nenhum lançamento no período</b></div>';
  let inc = 0, exp = 0;
  const rows = txs.map(t => {
    if (t.type === 'receita') inc += t.amount; else exp += t.amount;
    const sit = t.paid ? (t.type === 'receita' ? 'Recebido' : 'Pago') : 'Pendente';
    return `<tr><td>${fmtDate(Store.eff(t))}</td><td>${esc(t.desc || Store.catName(t.categoryId))}</td><td>${esc(Store.catName(t.categoryId))}</td>
      <td>${sit}</td><td class="num">${t.type === 'receita' ? '+ ' : '− '}${fmt(t.amount)}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th class="num">Valor</th></tr></thead>
    <tbody>${rows}
    <tr class="tot"><td colspan="4">Total de receitas</td><td class="num">${fmt(inc)}</td></tr>
    <tr class="tot"><td colspan="4">Total de despesas</td><td class="num">${fmt(exp)}</td></tr>
    <tr class="res"><td colspan="4">Saldo do período</td><td class="num ${inc - exp < 0 ? 'neg' : ''}">${inc - exp < 0 ? '−' : ''}${fmt(Math.abs(inc - exp))}</td></tr>
    </tbody></table></div>`;
}

Views.relatorios = el => {
  const r = UI.rel;
  const P = relPeriod();
  const txs = relTransactions(P);

  const controls = {
    mes: monthNavHtml('rm', r.mes),
    ano: `<div class="monthnav" id="ry"><button type="button" data-d="-1" aria-label="Ano anterior">‹</button>
      <input type="number" min="2000" max="2100" value="${r.ano}" style="width:90px;text-align:center;border:0;background:transparent;font-weight:600" aria-label="Ano">
      <button type="button" data-d="1" aria-label="Próximo ano">›</button></div>`,
    intervalo: `<div class="inline-f"><label class="f">De<input type="date" id="rf" value="${r.from}"></label><label class="f">Até<input type="date" id="rt" value="${r.to}"></label></div>`,
  }[r.mode];

  /* o ano inteiro cabe melhor em paisagem na impressão */
  let ps = $('#pgstyle');
  if (!ps) { ps = document.createElement('style'); ps.id = 'pgstyle'; document.head.appendChild(ps); }
  ps.textContent = P.annual && r.tab === 'dre' ? '@media print { @page { size: A4 landscape; margin: 12mm; } }' : '@media print { @page { size: A4; margin: 14mm; } }';

  const title = r.tab === 'dre' ? 'Demonstrativo de resultado (DRE)' : 'Extrato de lançamentos';
  el.innerHTML = `
    <div class="print-head">
      <div class="ph-brand">${Store.validLogo((Store.profile || {}).logo) ? brandMarkHtml(46) : ''}<b>${esc(brandName())}</b></div>
      <h1>${title}</h1><div>Período: ${esc(P.title)}${P.annual && r.tab === 'dre' ? ' · valores em R$' : ''}</div><div>${relBasisText()}</div>
      <div class="muted">Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div></div>
    <div class="page-head"><div><h1>Relatórios</h1><div class="sub">DRE e extrato para conferir, imprimir ou salvar em PDF</div></div>
      <button class="btn primary" id="rprint"><svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/></svg>Imprimir / PDF</button></div>
    <div class="toolbar">
      ${segHtml('rtab', [['dre', 'DRE'], ['extrato', 'Extrato']], r.tab)}
      ${segHtml('rmode', [['mes', 'Mês'], ['ano', 'Ano'], ['intervalo', 'Intervalo']], r.mode)}
      ${controls}
      <div class="grow"></div>
      ${segHtml('rbasis', [['realizado', 'Realizado'], ['previsto', 'Previsto']], r.basis)}
    </div>
    <div class="card">
      <div class="card-head"><h2>${title} · ${esc(P.title)}</h2><span class="muted" style="font-size:12.5px">${P.annual && r.tab === 'dre' ? 'valores em R$ · ' : ''}${relBasisText().replace('Regime: ', '')}</span></div>
      ${r.tab === 'dre' ? dreTable(P, txs) : extratoTable(P, txs)}
    </div>
    <p class="muted noprint mt">Para gerar o PDF sem impressora: toque em “Imprimir / PDF” e, na janela de impressão, escolha “Salvar como PDF” como destino.</p>`;

  bindSeg(el, 'rtab', v => { r.tab = v; refresh(); });
  bindSeg(el, 'rmode', v => { r.mode = v; refresh(); });
  bindSeg(el, 'rbasis', v => { r.basis = v; refresh(); });
  bindMonthNav(el, 'rm', () => r.mes, v => { r.mes = v; });
  const ry = $('#ry', el);
  if (ry) {
    ry.querySelectorAll('button').forEach(b => { b.onclick = () => { r.ano += +b.dataset.d; refresh(); }; });
    ry.querySelector('input').onchange = e => { const y = parseInt(e.target.value, 10); if (y >= 2000 && y <= 2100) { r.ano = y; refresh(); } };
  }
  const on = (id, key) => { const n = $('#' + id, el); if (n) n.onchange = e => { if (e.target.value) { r[key] = e.target.value; refresh(); } }; };
  on('rf', 'from'); on('rt', 'to');
  $('#rprint', el).onclick = () => window.print();
};
