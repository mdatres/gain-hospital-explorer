import { STATES, TOTAL, DEFAULTS, sanitize, costs, regionTotal } from './model.mjs';
import { createRoomClient } from './room-sync.mjs?v=6';
import { SYNC_ENDPOINT } from './connection-config.mjs?v=6';

const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('en-GB');
const money = n => euro.format(n);
const number = n => integer.format(n);
const shortMoney = n => n >= 1e9 ? `€${(n / 1e9).toFixed(1)}bn` : n >= 1e6 ? `€${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}m` : n >= 1e3 ? `€${(n / 1e3).toFixed(n % 1000 === 0 ? 0 : 1)}k` : money(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const validRoom = value => /^[A-HJ-NP-Z2-9]{16}$/.test(value || '');
function randomRoom() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(16))].map(x => alphabet[x % alphabet.length]).join(''); }
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.slice(1));
// The main page and legacy Explore links now open the controls-only screen.
let view = params.get('view') === 'display' ? 'display' : 'controller';
let room = validRoom(hash.get('room')) ? hash.get('room') : randomRoom();
let state = sanitize(DEFAULTS);
try { state = sanitize(JSON.parse(localStorage.getItem(`gain-scenario-${room}`)) || DEFAULTS); } catch {}
let roomClient, remoteActive = false, toastTimer, renderFrame = 0;
let peerStateMessage = 'Not connected';
$('state-list').innerHTML = STATES.filter(([id]) => !['BY', 'SN'].includes(id)).map(([id, label, count]) => `<label class="state-option"><input type="checkbox" value="${id}"><span class="state-name">${label}</span><span class="state-count">${number(count)}</span></label>`).join('');

function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4300); }
function storageSave() { try { localStorage.setItem(`gain-scenario-${room}`, JSON.stringify(state)); } catch {} }
function refreshStatus(status = {}) {
  $('pair-status').textContent = peerStateMessage;
  $('sync-warning').hidden = status.phase !== 'offline';
  $('sync-warning-text').textContent = peerStateMessage;
}
function update(changes) { state = sanitize({ ...state, ...changes }); storageSave(); scheduleRender(); roomClient?.edit(changes); }
function scheduleRender() { if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); }); }
function setView(next) {
  view = next; document.body.dataset.view = view;
  $('presentation-button').innerHTML = view === 'display' ? '<span aria-hidden="true">↙</span> Exit presentation' : 'Presentation mode <span aria-hidden="true">↗</span>';
  $('presentation-button').setAttribute('aria-pressed', String(view === 'display'));
  const url = new URL(location.href); url.searchParams.set('view', view); url.hash = `room=${room}${hash.get('join') === '1' ? '&join=1' : ''}`; history.replaceState(null, '', url);
  document.title = `gAIn — ${view === 'controller' ? 'iPad controller' : view === 'display' ? 'Live cost projection' : 'Hospital deployment explorer'}`;
  scheduleRender();
}
function inputValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
function render() {
  const c = costs(state), per = costs(state, 1), sum = regionTotal(state);
  inputValue('hospital-number', state.hospitals); inputValue('hospital-slider', state.hospitals);
  $('hospital-slider').style.background = `linear-gradient(to right,var(--purple) ${state.hospitals / TOTAL * 100}%,#e9e8f0 ${state.hospitals / TOTAL * 100}%)`;
  $('hospital-slider').setAttribute('aria-valuetext', `${number(state.hospitals)} hospitals`);
  $('cost-mode').value = state.mode; inputValue('years', state.years); $('years').disabled = state.mode === 'hardware';
  $('time-hint').hidden = state.mode !== 'hardware';
  $('years-value').textContent = `${state.years} ${state.years === 1 ? 'year' : 'years'}`;
  $('years').setAttribute('aria-valuetext', $('years-value').textContent);
  $('years').style.background = `linear-gradient(to right,var(--purple) ${(state.years - 1) / 19 * 100}%,#e9e8f0 ${(state.years - 1) / 19 * 100}%)`;
  document.querySelectorAll('[data-state]').forEach(b => b.setAttribute('aria-pressed', String(state.selected.includes(b.dataset.state))));
  $('select-all').setAttribute('aria-pressed', String(state.selected.length === STATES.length));
  $('region-summary').hidden = !state.selected.length;
  const otherCount = state.selected.filter(id => !['BY', 'SN'].includes(id)).length;
  $('more-count').textContent = otherCount ? `${otherCount} selected` : '';
  document.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.count) === state.hospitals)));
  document.querySelectorAll('.state-option input').forEach(el => el.checked = state.selected.includes(el.value));
  $('region-total').textContent = number(sum); $('region-count').textContent = `${state.selected.length} ${state.selected.length === 1 ? 'state' : 'states'}`;
  $('use-region').disabled = !state.selected.length;
  $('region-legend').hidden = !state.selected.length;
  $('quant-cost').textContent = money(c.quant); $('rtx-cost').textContent = money(c.rtx);
  $('quant-per').textContent = `${money(per.quant)} per hospital`; $('rtx-per').textContent = `${money(per.rtx)} per hospital`;
  $('saving-cost').textContent = money(c.difference);
  $('saving-percent').textContent = c.percent === null ? 'No RTX 3050 baseline cost' : Math.abs(c.percent) < 0.005 ? 'Equal costs in this scenario' : `${Math.abs(c.percent).toFixed(1)}% ${c.difference >= 0 ? 'lower' : 'higher'} for the gAIn setup`;
  $('selected-caption').textContent = `${number(state.hospitals)} hospitals`;
  $('cost-caption').textContent = state.mode === 'hardware' ? 'Hardware only · one-time cost' : `Hardware + ${state.years} ${state.years === 1 ? 'year' : 'years'} of electricity`;
  drawChart();
}

function niceMax(value) { if (value <= 0) return 100; const power = 10 ** Math.floor(Math.log10(value)); const fraction = value / power; return ([1, 2, 2.5, 4, 5, 8, 10].find(n => n >= fraction) || 10) * power; }
function drawChart() {
  const svg = $('cost-chart');
  const rect = svg.getBoundingClientRect();
  const width = Math.max(600, rect.width || 1000), height = Math.max(360, rect.height || 470);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const presentation = view === 'display';
  const tickFont = presentation ? (width > 1400 ? 19 : 16) : 14;
  const axisFont = presentation ? 20 : 16;
  const pad = { left: presentation ? 125 : 100, right: 38, top: 83, bottom: 65 };
  const plotW = width - pad.left - pad.right, bottom = height - pad.bottom;
  const c = costs(state), max = costs(state, TOTAL), sum = regionTotal(state);
  const ceiling = niceMax(Math.max(max.quant, max.rtx) * 1.12);
  const x = n => pad.left + n / TOTAL * plotW, y = v => bottom - v / ceiling * (bottom - pad.top);
  const focusX = x(state.hospitals), qY = y(c.quant), rY = y(c.rtx);
  let out = `<title id="chart-title">Hospital deployment costs: ${number(state.hospitals)} hospitals</title><desc id="chart-desc">${state.mode === 'hardware' ? 'Hardware only' : `Hardware and ${state.years} years of electricity`}. gAIn setup ${money(c.quant)}. RTX 3050 ${money(c.rtx)}. ${state.selected.length ? `Selected states: ${sum} hospitals.` : ''} All cost inputs are illustrative assumptions.</desc><rect width="${width}" height="${height}" fill="#fff"/><text x="4" y="23" fill="#000" font-size="${axisFont}" font-weight="600" letter-spacing=".4">COST (EUR)</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = ceiling * i / 4, yy = y(v);
    out += `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#e9ebf1" ${i === 0 ? '' : 'stroke-dasharray="3 5"'}/><text x="${pad.left - 13}" y="${yy + tickFont * .35}" fill="#000" font-size="${tickFont}" font-weight="500" text-anchor="end">${shortMoney(v)}</text>`;
  }
  out += `<path d="M ${pad.left} ${pad.top} V ${bottom} H ${width - pad.right}" fill="none" stroke="#000" stroke-width="${presentation ? 1.6 : 1.2}"/>`;
  const ticks = width < 700 ? [0, 500, 1000, 1500, TOTAL] : [0, 250, 500, 750, 1000, 1250, 1500, TOTAL];
  for (const n of ticks) out += `<line x1="${x(n)}" y1="${bottom}" x2="${x(n)}" y2="${bottom + 5}" stroke="#d7dbe6"/><text x="${x(n)}" y="${bottom + 28}" text-anchor="middle" fill="#000" font-size="${tickFont}" font-weight="500">${number(n)}</text>`;
  out += `<text x="${pad.left + plotW / 2}" y="${height - 7}" text-anchor="middle" fill="#000" font-size="${axisFont}" font-weight="600">Number of hospitals</text>`;
  out += `<path d="M ${x(0)} ${bottom} L ${focusX} ${qY} L ${focusX} ${rY} Z" fill="#d7f343" opacity=".18"/>`;
  out += `<rect x="${Math.max(pad.left, focusX - 12)}" y="${pad.top - 13}" width="${Math.min(24, width - pad.right - Math.max(pad.left, focusX - 12))}" height="${bottom - pad.top + 13}" fill="#edf0f5" opacity=".65"/>`;
  out += `<path d="M ${x(0)} ${bottom} L ${x(TOTAL)} ${y(max.rtx)}" fill="none" stroke="#3c5868" stroke-width="3" stroke-linecap="round"/><path d="M ${x(0)} ${bottom} L ${x(TOTAL)} ${y(max.quant)}" fill="none" stroke="#7255cd" stroke-width="3" stroke-linecap="round"/>`;
  for (const [yy, color] of [[qY, '#7255cd'], [rY, '#3c5868']]) out += `<line x1="${pad.left}" y1="${yy}" x2="${focusX}" y2="${yy}" stroke="${color}" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>`;
  out += `<line x1="${focusX}" y1="${pad.top - 14}" x2="${focusX}" y2="${bottom}" stroke="#343b4a" stroke-width="1.3"/>`;
  const focusLabelX = Math.max(pad.left + 83, Math.min(width - pad.right - 83, focusX));
  out += `<rect x="${focusLabelX - 82}" y="34" width="164" height="29" rx="7" fill="#252a38"/><text x="${focusLabelX}" y="53" text-anchor="middle" fill="white" font-weight="550" font-size="12">${number(state.hospitals)} hospitals · selected</text>`;
  if (state.selected.length) {
    const sx = x(sum), labelX = Math.max(pad.left + 82, Math.min(width - pad.right - 82, sx));
    const same = Math.abs(sx - focusX) < 172;
    out += `<line x1="${sx}" y1="${pad.top - 8}" x2="${sx}" y2="${bottom}" stroke="#b66b24" stroke-width="1.7" stroke-dasharray="6 5"/><rect x="${labelX - 78}" y="${same ? 2 : 34}" width="156" height="25" rx="6" fill="#fff3e3"/><text x="${labelX}" y="${same ? 19 : 51}" text-anchor="middle" fill="#995619" font-size="11" font-weight="550">${number(sum)} · selected states</text>`;
  }
  let qLabelY = qY - 17, rLabelY = rY - 17;
  if (Math.abs(qLabelY - rLabelY) < 39) { qLabelY = Math.min(bottom - 28, Math.max(qY, rY) - 12); rLabelY = qLabelY - 40; }
  qLabelY = Math.max(pad.top, Math.min(bottom - 27, qLabelY)); rLabelY = Math.max(pad.top, Math.min(bottom - 27, rLabelY));
  for (const [yy, labelY, value, color, title] of [[rY, rLabelY, c.rtx, '#3c5868', 'RTX'], [qY, qLabelY, c.quant, '#7255cd', 'gAIn']]) {
    const text = `${title}  ${money(value)}`, badgeW = Math.max(110, text.length * 7.1 + 22);
    const badgeX = focusX + badgeW + 20 < width - 3 ? focusX + 15 : Math.max(pad.left + 5, focusX - badgeW - 15);
    out += `<circle cx="${focusX}" cy="${yy}" r="10" fill="${color}" opacity=".13"/><circle cx="${focusX}" cy="${yy}" r="5.5" fill="${color}" stroke="white" stroke-width="2.5"/><line x1="${focusX}" y1="${yy}" x2="${badgeX > focusX ? badgeX : badgeX + badgeW}" y2="${labelY + 14}" stroke="${color}" opacity=".25"/><rect x="${badgeX}" y="${labelY}" width="${badgeW}" height="28" rx="6" fill="white" stroke="${color}" stroke-opacity=".2"/><text x="${badgeX + 11}" y="${labelY + 19}" fill="${color}" font-size="12" font-weight="600">${text}</text>`;
  }
  svg.innerHTML = out;
}

let previousView = 'controller';
$('presentation-button').addEventListener('click', () => {
  if (view === 'display') setView(previousView);
  else { previousView = view; setView('display'); if (!remoteActive) connectRoom(); }
});
$('hospital-slider').addEventListener('input', e => { $('hospital-number').value = e.target.value; update({ hospitals: e.target.value }); });
$('hospital-number').addEventListener('input', e => { if (e.target.value !== '') { update({ hospitals: e.target.value }); $('hospital-slider').value = state.hospitals; } });
$('hospital-number').addEventListener('change', () => $('hospital-number').value = state.hospitals);
$('decrement').addEventListener('click', () => update({ hospitals: state.hospitals - 1 }));
$('increment').addEventListener('click', () => update({ hospitals: state.hospitals + 1 }));
document.querySelectorAll('[data-count]').forEach(b => b.addEventListener('click', () => update({ hospitals: Number(b.dataset.count) })));
$('cost-mode').addEventListener('change', e => update({ mode: e.target.value }));
$('years').addEventListener('input', e => { if (e.target.value !== '') update({ years: e.target.value }); });
$('years').addEventListener('change', () => $('years').value = state.years);
$('state-list').addEventListener('change', () => update({ selected: [...state.selected.filter(id => ['BY', 'SN'].includes(id)), ...[...document.querySelectorAll('.state-option input:checked')].map(el => el.value)] }));
document.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.state; update({ selected: state.selected.includes(id) ? state.selected.filter(s => s !== id) : [...state.selected, id] }); }));
$('select-all').addEventListener('click', () => update({ selected: state.selected.length === STATES.length ? [] : STATES.map(s => s[0]) }));
$('clear-states').addEventListener('click', () => update({ selected: [] }));
$('use-region').addEventListener('click', () => update({ hospitals: regionTotal(state) }));
document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); }));
$('references-button').addEventListener('click', () => $('references-dialog').showModal());
function fillAssumptions(values) { for (const input of $('assumptions-form').querySelectorAll('input[name]')) input.value = values[input.name]; }
$('assumptions-button').addEventListener('click', () => { fillAssumptions(state); $('assumptions-dialog').showModal(); });
$('reset-assumptions').addEventListener('click', () => fillAssumptions(DEFAULTS));
$('assumptions-form').addEventListener('submit', e => { e.preventDefault(); if (!$('assumptions-form').reportValidity()) return; const values = Object.fromEntries(new FormData(e.currentTarget)); update(values); $('assumptions-dialog').close(); toast(remoteActive ? 'Model assumptions updated. Sending to the other screen…' : 'Model assumptions updated.'); });
function otherView() { return view === 'display' ? 'controller' : 'display'; }
function roomURL(targetView = otherView(), remote = true) { const u = new URL(location.href); u.search = ''; u.searchParams.set('view', targetView); u.hash = `room=${room}&${remote ? 'join=1' : 'local=1'}`; return u.href; }
function renderPair() {
  $('room-code').textContent = room.match(/.{4}/g).join(' '); const url = roomURL();
  $('pair-instructions').textContent = view === 'display' ? 'Scan this code with your iPad to open the controller, or enter the room code on the iPad.' : 'Open this page on the presentation device and enter the room code, or use the link below.';
  if (typeof window.qrcode === 'function') { const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 4, scalable: true }); }
  else $('qr-code').textContent = 'Use the room code to connect.';
  refreshStatus();
}
function stopRemote() { roomClient?.stop(); roomClient = null; }
function connectRoom() {
  stopRemote(); remoteActive = true;
  const outboxKey = `gain-outbox-${room}`;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(outboxKey)) || {}; } catch {}
  roomClient = createRoomClient({
    room, endpoint: SYNC_ENDPOINT, getState: () => state, getRole: () => view, saved,
    save: outbox => { try { sessionStorage.setItem(outboxKey, JSON.stringify(outbox)); } catch {} },
    onState: remote => { state = remote; storageSave(); scheduleRender(); },
    onStatus: status => { peerStateMessage = status.message; refreshStatus(status); },
  });
  roomClient.start();
}
$('retry-sync').addEventListener('click', connectRoom);
$('retry-pair').addEventListener('click', () => { connectRoom(); renderPair(); });
$('copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomURL()); toast('Link copied. Open it on the other screen.'); } catch { const input = $('join-code'); input.value = room; input.select(); toast('Clipboard unavailable. Enter the room code on the other device.'); } });
$('join-room').addEventListener('click', () => {
  const code = $('join-code').value.replace(/\s/g, '').toUpperCase();
  if (!validRoom(code)) { toast('Enter the 16-character room code, or scan the QR code.'); return; }
  room = code;
  const u = new URL(location.href); u.hash = `room=${room}&join=1`; history.replaceState(null, '', u);
  connectRoom(); renderPair();
});
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join-room').click(); });
window.addEventListener('pagehide', stopRemote);
window.addEventListener('pageshow', e => { if (e.persisted) connectRoom(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) roomClient?.flush(); });
new ResizeObserver(() => scheduleRender()).observe($('cost-chart'));
setView(view); render(); connectRoom();
if (params.get('setup') === '1') { renderPair(); $('pair-dialog').showModal(); }
