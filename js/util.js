'use strict';
/* Utilitários gerais: DOM, dinheiro, datas */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/* ---------- Dinheiro (sempre em centavos, inteiros) ---------- */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = c => BRL.format((c || 0) / 100);

function fmtShort(c) {
  const v = Math.abs(c) / 100;
  let s;
  if (v >= 1e6) s = (v / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' mi';
  else if (v >= 1e3) s = (v / 1e3).toFixed(1).replace('.', ',').replace(',0', '') + ' mil';
  else s = String(Math.round(v));
  return (c < 0 ? '-' : '') + 'R$ ' + s;
}

/* Aceita "1.234,56", "1234,56", "1234.56", "R$ 12" */
function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input || '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const centsToInput = c => (c / 100).toFixed(2).replace('.', ',');

/* ---------- Datas (strings 'YYYY-MM-DD' e 'YYYY-MM') ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const monthKey = s => s.slice(0, 7);
const currentMonth = () => monthKey(todayStr());

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

/* Soma meses a uma data mantendo o dia (31/01 + 1 mês = 28/02) */
function addMonthsToDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return ymd(target);
}

function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return { from: key + '-01', to: ymd(new Date(y, m, 0)) };
}

const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const monthLabel = key => { const [y, m] = key.split('-').map(Number); return MESES[m - 1] + ' ' + y; };
const monthLabelShort = key => { const [y, m] = key.split('-').map(Number); return MESES3[m - 1] + '/' + y; };
const fmtDate = s => s.split('-').reverse().join('/');
const fmtDM = s => { const [, m, d] = s.split('-'); return d + '/' + m; };
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const weekday = s => WEEK[parseYmd(s).getDay()];

/* Variação percentual de a em relação a b (null quando b = 0 e a ≠ 0) */
function pctChange(a, b) {
  if (b === 0) return a === 0 ? 0 : null;
  return ((a - b) / Math.abs(b)) * 100;
}
const fmtPct = p => (p === null ? 'novo' : (p > 0 ? '+' : '') + p.toFixed(1).replace('.', ',') + '%');

function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

if (typeof module !== 'undefined') {
  module.exports = { esc, fmt, fmtShort, parseMoney, centsToInput, ymd, parseYmd, addMonths, addMonthsToDate, monthRange, addDays, daysBetween, monthLabel, monthLabelShort, fmtDate, pctChange, fmtPct };
}
