'use strict';
/* Gráficos em SVG puro (sem bibliotecas, funcionam offline).
   Cada gráfico é redesenhado com a largura real do contêiner. */

const Charts = (() => {
  const observers = [];

  /* ---------- tooltip ---------- */
  function tipEl() {
    let t = document.getElementById('tip');
    if (!t) { t = document.createElement('div'); t.id = 'tip'; t.className = 'tip'; document.body.appendChild(t); }
    return t;
  }
  function showTip(html, x, y) {
    const t = tipEl();
    t.innerHTML = html;
    t.style.display = 'block';
    const w = t.offsetWidth, h = t.offsetHeight;
    let l = x + 14, tp = y - h - 12;
    if (l + w > window.innerWidth - 8) l = x - w - 14;
    if (l < 8) l = 8;
    if (tp < 8) tp = y + 18;
    t.style.left = l + 'px';
    t.style.top = tp + 'px';
  }
  function hideTip() { tipEl().style.display = 'none'; }

  function bindTips(root) {
    root.querySelectorAll('[data-tip]').forEach(n => {
      const show = e => showTip(n.getAttribute('data-tip'), e.clientX, e.clientY);
      n.addEventListener('pointerenter', show);
      n.addEventListener('pointermove', show);
      n.addEventListener('pointerleave', hideTip);
    });
  }

  /* ---------- montagem / redimensionamento ---------- */
  function reset() {
    observers.forEach(o => o.disconnect());
    observers.length = 0;
    hideTip();
  }
  function mount(el, draw) {
    if (!el) return;
    const render = () => {
      const w = Math.max(240, Math.floor(el.clientWidth || 300));
      const r = draw(w);
      el.innerHTML = r.html;
      if (r.bind) r.bind(el);
      bindTips(el);
    };
    render();
    if (typeof ResizeObserver !== 'undefined') {
      let last = el.clientWidth;
      const ro = new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - last) > 4) { last = el.clientWidth; render(); }
      });
      ro.observe(el);
      observers.push(ro);
    }
  }

  /* ---------- escalas ---------- */
  function niceScale(lo, hi) {
    lo = Math.min(0, lo); hi = Math.max(0, hi);
    if (hi === lo) hi = lo + 100;
    const raw = (hi - lo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
  }
  const f1 = n => Math.round(n * 10) / 10;

  function barPath(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    if (h <= 0) return '';
    return `M${f1(x)},${f1(y + h)}L${f1(x)},${f1(y + r)}Q${f1(x)},${f1(y)} ${f1(x + r)},${f1(y)}L${f1(x + w - r)},${f1(y)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)}L${f1(x + w)},${f1(y + h)}Z`;
  }
  const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* ---------- barras agrupadas (vertical) ---------- */
  function groupedBars({ labels, series }) {
    return w => {
      const h = 250, m = { l: 52, r: 8, t: 22, b: 28 };
      const pw = w - m.l - m.r, ph = h - m.t - m.b;
      const max = Math.max(1, ...series.flatMap(s => s.values));
      const sc = niceScale(0, max);
      const y = v => m.t + ph - (v / sc.hi) * ph;
      let g = '';
      for (let v = 0; v <= sc.hi + 1; v += sc.step) {
        g += `<line class="gl" x1="${m.l}" x2="${w - m.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>`
          + `<text class="ax" x="${m.l - 8}" y="${f1(y(v)) + 4}" text-anchor="end">${fmtShort(v)}</text>`;
      }
      const gw = pw / labels.length, n = series.length;
      const bw = Math.min(54, (gw * 0.72 - 2 * (n - 1)) / n);
      let bars = '', lbl = '';
      labels.forEach((lab, i) => {
        const gx = m.l + gw * i + gw / 2;
        const total = n * bw + (n - 1) * 2;
        series.forEach((s, j) => {
          const v = s.values[i];
          const bx = gx - total / 2 + j * (bw + 2);
          const bh = (v / sc.hi) * ph;
          const tip = attr(`<b>${esc(lab)}</b><br><i style="background:${s.color}"></i>${esc(s.name)}: <b>${fmt(v)}</b>`);
          bars += `<path d="${barPath(bx, y(v), bw, bh, 4)}" fill="${s.color}"/>`;
          bars += `<rect x="${f1(bx - 2)}" y="${m.t}" width="${f1(bw + 4)}" height="${ph}" fill="transparent" data-tip="${tip}"/>`;
          if (v > 0) bars += `<text class="vl" x="${f1(bx + bw / 2)}" y="${f1(y(v) - 6)}" text-anchor="middle">${fmtShort(v)}</text>`;
        });
        lbl += `<text class="ax" x="${f1(gx)}" y="${h - 8}" text-anchor="middle">${esc(lab)}</text>`;
      });
      return { html: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${g}${bars}${lbl}</svg>` };
    };
  }

  /* ---------- barras horizontais (categorias A x B) ---------- */
  function hBars({ rows, nameA, nameB, colorA, colorB }) {
    return w => {
      const rh = 40, lw = Math.min(124, Math.round(w * 0.34)), vw = 64;
      const h = Math.max(60, rows.length * rh + 8);
      const pw = Math.max(40, w - lw - vw);
      const max = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
      let out = '';
      rows.forEach((r, i) => {
        const y0 = 4 + i * rh;
        const name = r.name.length > 16 && lw < 120 ? r.name.slice(0, 15) + '…' : r.name;
        const wa = Math.max(r.a > 0 ? 3 : 0, (r.a / max) * pw), wb = Math.max(r.b > 0 ? 3 : 0, (r.b / max) * pw);
        const d = pctChange(r.a, r.b);
        const tip = attr(`<b>${esc(r.name)}</b><br><i style="background:${colorA}"></i>${esc(nameA)}: <b>${fmt(r.a)}</b><br><i style="background:${colorB}"></i>${esc(nameB)}: <b>${fmt(r.b)}</b><br>Variação: <b>${fmtPct(d)}</b>`);
        out += `<text class="ax" x="0" y="${y0 + 20}" fill="currentColor">${esc(name)}</text>`;
        out += `<path d="${rbar(lw, y0 + 6, wa, 11)}" fill="${colorA}"/>`;
        out += `<path d="${rbar(lw, y0 + 19, wb, 11)}" fill="${colorB}"/>`;
        out += `<text class="vl" x="${f1(lw + wa + 6)}" y="${y0 + 16}">${fmtShort(r.a)}</text>`;
        out += `<rect x="0" y="${y0}" width="${w}" height="${rh - 2}" fill="transparent" data-tip="${tip}"/>`;
      });
      return { html: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${out}</svg>` };
    };
    function rbar(x, y, w, h) { // arredondado só na ponta direita
      if (w <= 0) return '';
      const r = Math.min(4, w, h / 2);
      return `M${f1(x)},${f1(y)}L${f1(x + w - r)},${f1(y)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)}L${f1(x + w)},${f1(y + h - r)}Q${f1(x + w)},${f1(y + h)} ${f1(x + w - r)},${f1(y + h)}L${f1(x)},${f1(y + h)}Z`;
    }
  }

  /* ---------- rosca ---------- */
  function doughnut({ items, centerTop, centerBottom }) {
    return w => {
      const size = Math.min(w, 230), cx = w / 2, cy = size / 2;
      const R = size / 2 - 4, r = R * 0.62;
      const total = items.reduce((s, i) => s + i.value, 0);
      let out = '';
      if (total <= 0) {
        out += ring(cx, cy, R, r, 0, Math.PI * 2, 'var(--line)');
        out += `<text class="ctr" x="${cx}" y="${cy + 4}" text-anchor="middle">Sem dados</text>`;
      } else {
        let a0 = -Math.PI / 2;
        items.forEach(it => {
          if (it.value <= 0) return;
          const a1 = a0 + (it.value / total) * Math.PI * 2;
          const tip = attr(`<i style="background:${it.color}"></i><b>${esc(it.name)}</b><br>${fmt(it.value)} · ${((it.value / total) * 100).toFixed(1).replace('.', ',')}%`);
          out += `<path d="${ring(cx, cy, R, r, a0, a1)}" fill="${it.color}" stroke="var(--surface)" stroke-width="2" data-tip="${tip}"/>`;
          a0 = a1;
        });
        out += `<text class="ctr-s" x="${cx}" y="${cy - 4}" text-anchor="middle">${esc(centerTop || '')}</text>`;
        out += `<text class="ctr" x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(centerBottom || '')}</text>`;
      }
      return { html: `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" role="img">${out}</svg>` };
    };
    function ring(cx, cy, R, r, a0, a1, fill) {
      const full = a1 - a0 >= Math.PI * 2 - 1e-6;
      if (full) a1 = a0 + Math.PI * 2 - 0.0001;
      const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
      const d = `M${f1(x0)},${f1(y0)}A${f1(R)},${f1(R)} 0 ${large} 1 ${f1(x1)},${f1(y1)}L${f1(x2)},${f1(y2)}A${f1(r)},${f1(r)} 0 ${large} 0 ${f1(x3)},${f1(y3)}Z`;
      return fill ? `<path d="${d}" fill="${fill}"/>` : d;
    }
  }

  /* ---------- linhas (com marcador de passagem) ---------- */
  function line({ series, xLabel, xTitle }) {
    return w => {
      const h = 250, m = { l: 52, r: 14, t: 16, b: 30 };
      const pw = w - m.l - m.r, ph = h - m.t - m.b;
      const N = Math.max(...series.map(s => s.values.length));
      const all = series.flatMap(s => s.values);
      const sc = niceScale(Math.min(0, ...all), Math.max(0, ...all));
      const x = i => m.l + (N <= 1 ? pw / 2 : (i / (N - 1)) * pw);
      const y = v => m.t + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
      let g = '';
      for (let v = sc.lo; v <= sc.hi + 1; v += sc.step) {
        const zero = Math.abs(v) < 1e-9;
        g += `<line class="${zero ? 'gl zero' : 'gl'}" x1="${m.l}" x2="${w - m.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>`
          + `<text class="ax" x="${m.l - 8}" y="${f1(y(v)) + 4}" text-anchor="end">${fmtShort(v)}</text>`;
      }
      const nt = Math.min(N, w < 420 ? 4 : 6);
      let xt = '';
      for (let k = 0; k < nt; k++) {
        const i = nt === 1 ? 0 : Math.round((k * (N - 1)) / (nt - 1));
        xt += `<text class="ax" x="${f1(x(i))}" y="${h - 8}" text-anchor="${k === 0 ? 'start' : k === nt - 1 ? 'end' : 'middle'}">${esc(xLabel(i))}</text>`;
      }
      let paths = '';
      series.forEach(s => {
        const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${f1(x(i))},${f1(y(v))}`).join('');
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
      });
      const cursor = `<g id="lc" style="display:none"><line class="cur" y1="${m.t}" y2="${m.t + ph}"/>`
        + series.map((s, k) => `<circle id="lc${k}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('') + '</g>';
      const html = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${g}${xt}${paths}${cursor}`
        + `<rect id="lh" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
      const bind = root => {
        const hit = root.querySelector('#lh'), cur = root.querySelector('#lc'), ln = cur.querySelector('.cur');
        const move = e => {
          const b = hit.getBoundingClientRect();
          const rel = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
          const i = N <= 1 ? 0 : Math.round(rel * (N - 1));
          cur.style.display = '';
          ln.setAttribute('x1', f1(x(i))); ln.setAttribute('x2', f1(x(i)));
          let rows = `<b>${esc(xTitle ? xTitle(i) : xLabel(i))}</b>`;
          series.forEach((s, k) => {
            const dot = root.querySelector('#lc' + k);
            if (i < s.values.length) {
              dot.style.display = '';
              dot.setAttribute('cx', f1(x(i))); dot.setAttribute('cy', f1(y(s.values[i])));
              rows += `<br><i style="background:${s.color}"></i>${esc(s.name)}: <b>${fmt(s.values[i])}</b>`;
            } else dot.style.display = 'none';
          });
          showTip(rows, e.clientX, e.clientY);
        };
        hit.addEventListener('pointerenter', move);
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerleave', () => { cur.style.display = 'none'; hideTip(); });
      };
      return { html, bind };
    };
  }

  return { mount, reset, groupedBars, hBars, doughnut, line, hideTip };
})();
