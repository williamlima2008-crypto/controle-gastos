'use strict';
/* Painel gráfico: compara dois períodos (mês atual x anterior, dois meses à
   escolha ou um intervalo de datas x o intervalo imediatamente anterior). */

UI.painel = {
  mode: 'mes',                 // 'mes' | 'dois' | 'intervalo'
  mes: currentMonth(),
  a: currentMonth(),
  b: addMonths(currentMonth(), -1),
  from: currentMonth() + '-01',
  to: todayStr(),
};

function monthPeriod(key) {
  const { from, to } = monthRange(key);
  return { from, to, label: monthLabel(key), short: monthLabelShort(key) };
}
function rangePeriod(from, to) {
  return { from, to, label: `${fmtDate(from)} a ${fmtDate(to)}`, short: `${fmtDM(from)}–${fmtDM(to)}` };
}
function getPeriods() {
  const p = UI.painel;
  if (p.mode === 'mes') return { A: monthPeriod(p.mes), B: monthPeriod(addMonths(p.mes, -1)) };
  if (p.mode === 'dois') return { A: monthPeriod(p.a), B: monthPeriod(p.b) };
  let from = p.from || todayStr(), to = p.to || from;
  if (from > to) [from, to] = [to, from];
  const n = daysBetween(from, to) + 1;
  return { A: rangePeriod(from, to), B: rangePeriod(addDays(from, -n), addDays(from, -1)) };
}

/* Totais (só o que já foi pago/recebido) e saldo acumulado dia a dia */
function summarize(P) {
  const days = daysBetween(P.from, P.to) + 1;
  const daily = new Array(days).fill(0);
  let inc = 0, exp = 0;
  const byCat = {};
  Store.transactions.forEach(t => {
    if (!t.paid) return;
    const d = Store.eff(t);
    if (d < P.from || d > P.to) return;
    const i = daysBetween(P.from, d);
    if (t.type === 'receita') { inc += t.amount; daily[i] += t.amount; }
    else { exp += t.amount; daily[i] -= t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
  });
  let acc = 0;
  const cum = daily.map(v => (acc += v));
  return { inc, exp, net: inc - exp, byCat, cum, days };
}

function deltaHtml(a, b, upIsGood) {
  const p = pctChange(a, b);
  if (p === null) return '<span class="delta">novo</span>';
  if (Math.abs(p) < 0.05) return '<span class="delta">= igual</span>';
  const up = p > 0, good = up === upIsGood;
  return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${fmtPct(p).replace('-', '−')}</span>`;
}

function statCard(label, a, b, A, B, upIsGood) {
  return `<div class="card stat"><div class="lbl">${label}</div><div class="val">${fmt(a)}</div>
    <div class="cmp">${deltaHtml(a, b, upIsGood)} <span>vs ${fmt(b)} (${esc(B.short)})</span></div></div>`;
}

Views.painel = el => {
  const p = UI.painel;
  const { A, B } = getPeriods();
  const sA = summarize(A), sB = summarize(B);
  const today = todayStr();

  /* alertas de vencimento (contas a pagar) */
  const open = Store.transactions.filter(t => !t.paid && t.type === 'despesa');
  const late = open.filter(t => t.date < today);
  const soon = open.filter(t => t.date >= today && t.date <= addDays(today, 3));
  const openOut = open.reduce((s, t) => s + t.amount, 0);
  const openIn = Store.transactions.filter(t => !t.paid && t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const controls = {
    mes: `${monthNavHtml('pm', p.mes)}<span class="muted">comparado a ${esc(monthLabel(addMonths(p.mes, -1)))}</span>`,
    dois: `<div class="inline-f"><label class="f">Período A<input type="month" id="pa" value="${p.a}"></label>
           <label class="f">Período B<input type="month" id="pb" value="${p.b}"></label></div>`,
    intervalo: `<div class="inline-f"><label class="f">De<input type="date" id="pf" value="${p.from}"></label>
           <label class="f">Até<input type="date" id="pt" value="${p.to}"></label></div>
           <span class="muted">comparado a ${esc(B.label)}</span>`,
  }[p.mode];

  /* categorias de despesa: top 8 (+ demais) para A x B */
  const ids = [...new Set([...Object.keys(sA.byCat), ...Object.keys(sB.byCat)])]
    .sort((x, y) => Math.max(sB.byCat[y] || 0, sA.byCat[y] || 0) - Math.max(sB.byCat[x] || 0, sA.byCat[x] || 0));
  const top = ids.slice(0, 8), rest = ids.slice(8);
  const catRows = top.map(id => ({ id, name: Store.catName(id), a: sA.byCat[id] || 0, b: sB.byCat[id] || 0 }));
  if (rest.length) catRows.push({ id: '_', name: 'Demais categorias', a: rest.reduce((s, id) => s + (sA.byCat[id] || 0), 0), b: rest.reduce((s, id) => s + (sB.byCat[id] || 0), 0) });

  /* rosca do período A: top 6 + demais */
  const idsA = Object.keys(sA.byCat).sort((x, y) => sA.byCat[y] - sA.byCat[x]);
  const donut = idsA.slice(0, 6).map(id => ({ name: Store.catName(id), value: sA.byCat[id], color: Store.catColor(id) }));
  const restA = idsA.slice(6).reduce((s, id) => s + sA.byCat[id], 0);
  if (restA > 0) donut.push({ name: 'Demais categorias', value: restA, color: '#8a8984' });

  const legend = (A_, B_) => `<div class="lgs"><span class="lg"><i style="background:var(--a)"></i>${esc(A_)}</span><span class="lg"><i style="background:var(--b)"></i>${esc(B_)}</span></div>`;
  const hasAny = Store.transactions.length > 0;

  el.innerHTML = `
    <div class="page-head"><div><h1>Painel</h1><div class="sub">${esc(A.label)} comparado a ${esc(B.label)}</div></div>
      <button class="btn primary" id="addtx"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Novo lançamento</button></div>
    ${(late.length || soon.length) ? `<div class="banner ${late.length ? 'bad' : ''}"><div class="grow">
      ${late.length ? `<b>${late.length} conta${late.length > 1 ? 's' : ''} vencida${late.length > 1 ? 's' : ''}</b>` : ''}${late.length && soon.length ? ' e ' : ''}${soon.length ? `<b>${soon.length} vencendo nos próximos 3 dias</b>` : ''}
      — total de ${fmt([...late, ...soon].reduce((s, t) => s + t.amount, 0))} a pagar.</div>
      <a class="btn small" href="#/contas">Ver contas</a></div>` : ''}
    <div class="toolbar">
      ${segHtml('pmode', [['mes', 'Mês'], ['dois', 'Comparar meses'], ['intervalo', 'Intervalo']], p.mode)}
      ${controls}
    </div>
    ${hasAny ? '' : `<div class="card empty"><b>Ainda não há lançamentos</b>Cadastre o primeiro ou veja o painel com dados de exemplo.
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" id="e1">Novo lançamento</button><button class="btn" id="e2">Carregar exemplo</button></div></div>`}
    <div class="cards">
      ${statCard('Receitas', sA.inc, sB.inc, A, B, true)}
      ${statCard('Despesas', sA.exp, sB.exp, A, B, false)}
      ${statCard('Saldo do período', sA.net, sB.net, A, B, true)}
      <a class="card stat" href="#/contas" style="text-decoration:none;color:inherit"><div class="lbl">Contas em aberto</div><div class="val">${fmt(openOut)}</div>
        <div class="cmp"><span>a pagar</span> · ${fmt(openIn)} a receber${late.length ? ` · <span class="delta bad">${late.length} vencida${late.length > 1 ? 's' : ''}</span>` : ''}</div></a>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-head"><h2>Receitas x despesas</h2>${legend(A.short, B.short)}</div><div class="chart" id="c1"></div></div>
      <div class="card"><div class="card-head"><h2>Saldo acumulado no período</h2>${legend(A.short, B.short)}</div><div class="chart" id="c2"></div></div>
      <div class="card"><div class="card-head"><h2>Despesas por categoria</h2><span class="muted" style="font-size:12.5px">${esc(A.short)}</span></div>
        <div class="chart" id="c3"></div><div class="legend-list" id="c3l"></div></div>
      <div class="card"><div class="card-head"><h2>Categorias: ${esc(A.short)} x ${esc(B.short)}</h2>${legend(A.short, B.short)}</div><div class="chart" id="c4"></div></div>
    </div>
    <details class="tablev card"><summary>Ver como tabela</summary><div class="tbl-wrap" id="ptbl"></div></details>`;

  /* gráficos */
  Charts.mount($('#c1', el), Charts.groupedBars({
    labels: ['Receitas', 'Despesas'],
    series: [{ name: A.short, color: 'var(--a)', values: [sA.inc, sA.exp] }, { name: B.short, color: 'var(--b)', values: [sB.inc, sB.exp] }],
  }));

  const upTo = daysBetween(A.from, A.to < today ? A.to : today); // não desenha o futuro
  const cumA = A.from > today ? [] : sA.cum.slice(0, upTo + 1);
  const series = [];
  if (cumA.length) series.push({ name: A.short, color: 'var(--a)', values: cumA });
  series.push({ name: B.short, color: 'var(--b)', values: sB.cum });
  Charts.mount($('#c2', el), Charts.line({ series, xLabel: i => 'dia ' + (i + 1), xTitle: i => 'Dia ' + (i + 1) }));

  Charts.mount($('#c3', el), Charts.doughnut({ items: donut, centerTop: 'Despesas', centerBottom: fmtShort(sA.exp) }));
  const totalD = donut.reduce((s, i) => s + i.value, 0);
  $('#c3l', el).innerHTML = donut.map(i => `<div class="li"><span class="dot" style="background:${i.color}"></span><span class="n">${esc(i.name)}</span>`
    + `<span class="p">${totalD ? ((i.value / totalD) * 100).toFixed(0) : 0}%</span><span class="v">${fmt(i.value)}</span></div>`).join('')
    || '<div class="muted">Sem despesas no período.</div>';

  if (catRows.length) {
    Charts.mount($('#c4', el), Charts.hBars({ rows: catRows, nameA: A.short, nameB: B.short, colorA: 'var(--a)', colorB: 'var(--b)' }));
  } else {
    $('#c4', el).innerHTML = '<div class="empty">Sem despesas nos períodos.</div>';
  }

  /* tabela acessível */
  const trs = catRows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.a)}</td><td class="num">${fmt(r.b)}</td><td class="num">${fmtPct(pctChange(r.a, r.b)).replace('-', '−')}</td></tr>`).join('');
  $('#ptbl', el).innerHTML = `<table class="tbl"><thead><tr><th></th><th class="num">${esc(A.short)}</th><th class="num">${esc(B.short)}</th><th class="num">Variação</th></tr></thead><tbody>
    <tr><td><b>Receitas</b></td><td class="num">${fmt(sA.inc)}</td><td class="num">${fmt(sB.inc)}</td><td class="num">${fmtPct(pctChange(sA.inc, sB.inc)).replace('-', '−')}</td></tr>
    <tr><td><b>Despesas</b></td><td class="num">${fmt(sA.exp)}</td><td class="num">${fmt(sB.exp)}</td><td class="num">${fmtPct(pctChange(sA.exp, sB.exp)).replace('-', '−')}</td></tr>
    <tr><td><b>Saldo</b></td><td class="num">${fmt(sA.net)}</td><td class="num">${fmt(sB.net)}</td><td class="num">${fmtPct(pctChange(sA.net, sB.net)).replace('-', '−')}</td></tr>
    ${trs ? `<tr><td colspan="4" class="muted" style="font-size:12px;padding-top:14px">DESPESAS POR CATEGORIA</td></tr>${trs}` : ''}</tbody></table>`;

  /* eventos */
  bindSeg(el, 'pmode', v => { p.mode = v; refresh(); });
  bindMonthNav(el, 'pm', () => p.mes, v => { p.mes = v; });
  const on = (id, key) => { const n = $('#' + id, el); if (n) n.onchange = e => { if (e.target.value) { p[key] = e.target.value; refresh(); } }; };
  on('pa', 'a'); on('pb', 'b'); on('pf', 'from'); on('pt', 'to');
  $('#addtx', el).onclick = () => openTxForm(null);
  const e1 = $('#e1', el), e2 = $('#e2', el);
  if (e1) e1.onclick = () => openTxForm(null);
  if (e2) e2.onclick = async () => { const n = await Store.loadDemo(); toast(`${n} lançamentos de exemplo adicionados`); refresh(); };
};
