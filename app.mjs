import { STATES, TOTAL, DEFAULTS, sanitize, costs, regionTotal } from './model.mjs';

const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('en-GB');
const money = n => euro.format(n);
const number = n => integer.format(n);
const shortMoney = n => n >= 1e9 ? `€${(n / 1e9).toFixed(1)}bn` : n >= 1e6 ? `€${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}m` : n >= 1e3 ? `€${(n / 1e3).toFixed(n % 1000 === 0 ? 0 : 1)}k` : money(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const validRoom = value => /^[A-HJ-NP-Z2-9]{8}$/.test(value || '');
function randomRoom() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(8))].map(x => alphabet[x % alphabet.length]).join(''); }
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.slice(1));
let view = ['explore', 'controller', 'display'].includes(params.get('view')) ? params.get('view') : 'explore';
let room = validRoom(hash.get('room')) ? hash.get('room') : randomRoom();
let state = sanitize(DEFAULTS);
try { state = sanitize(JSON.parse(localStorage.getItem(`gain-scenario-${room}`)) || DEFAULTS); } catch {}
let channel, peer, connections = new Set(), host = false, remoteActive = false, remoteConnected = false;
let generation = 0, reconnectTimer, connectTimeout, toastTimer, renderFrame = 0;
let lastLocalSeen = 0, peerStateMessage = 'Not connected';
const tabId = crypto.randomUUID();
const seenUpdates = new Set();
function remember(id) { seenUpdates.add(id); if (seenUpdates.size > 300) seenUpdates.delete(seenUpdates.values().next().value); }
function statePacket() { const packet = { type: 'state', id: crypto.randomUUID(), state }; remember(packet.id); return packet; }
function acceptState(packet, viaLocal = false, except) {
  if (!packet || packet.type !== 'state' || typeof packet.id !== 'string' || packet.id.length > 80 || seenUpdates.has(packet.id)) return;
  remember(packet.id); state = sanitize(packet.state); storageSave(); scheduleRender();
  const safe = { type: 'state', id: packet.id, state };
  if (!viaLocal) postLocal('state', safe);
  sendRemote(safe, except);
}

$('state-list').innerHTML = STATES.map(([id, label, count]) => `<label class="state-option"><input type="checkbox" value="${id}"><span class="state-name">${label}</span><span class="state-count">${number(count)}</span></label>`).join('');

function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4300); }
function storageSave() { try { localStorage.setItem(`gain-scenario-${room}`, JSON.stringify(state)); } catch {} }
function postLocal(type, payload = {}) { channel?.postMessage({ type, ...payload, tabId }); }
function refreshStatus() {
  const local = Date.now() - lastLocalSeen < 6500;
  const label = remoteConnected ? 'Screens connected' : local ? 'Same-browser sync' : remoteActive ? peerStateMessage : 'Standalone';
  $('connection-status').classList.toggle('connected', remoteConnected || local);
  $('connection-status').innerHTML = `<i></i>${esc(label)}`;
  $('pair-status').textContent = remoteConnected ? 'Connected. Changes update the other screen live.' : peerStateMessage;
}
function startLocalChannel() {
  channel?.close();
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(`gain-hospitals-${room}`);
    channel.onmessage = ({ data }) => {
      if (!data || data.tabId === tabId) return;
      lastLocalSeen = Date.now();
      if (data.type === 'hello') postLocal('state', statePacket());
      if (data.type === 'state') acceptState(data, true);
      refreshStatus();
    };
    postLocal('hello');
  }
}
window.addEventListener('storage', event => { if (event.key === `gain-scenario-${room}` && event.newValue) { try { state = sanitize(JSON.parse(event.newValue)); lastLocalSeen = Date.now(); scheduleRender(); refreshStatus(); } catch {} } });
startLocalChannel();
setInterval(() => { postLocal('heartbeat'); refreshStatus(); }, 2000);

function sendRemote(message, except) { for (const conn of connections) if (conn !== except && conn.open) { try { conn.send(message); } catch {} } }
function update(changes) { state = sanitize({ ...state, ...changes }); storageSave(); scheduleRender(); const packet = statePacket(); postLocal('state', packet); sendRemote(packet); }
function scheduleRender() { if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); }); }
function setView(next) {
  view = next; document.body.dataset.view = view;
  document.querySelectorAll('[data-view]').forEach(button => { if (button.tagName === 'BUTTON') { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); } });
  const url = new URL(location.href); url.searchParams.set('view', view); if (!url.hash) url.hash = `room=${room}`; history.replaceState(null, '', url);
  document.title = `gAIn — ${view === 'controller' ? 'iPad controller' : view === 'display' ? 'Live cost projection' : 'Hospital deployment explorer'}`;
  scheduleRender();
}
function inputValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
function render() {
  const c = costs(state), per = costs(state, 1), sum = regionTotal(state);
  inputValue('hospital-number', state.hospitals); inputValue('hospital-slider', state.hospitals);
  $('hospital-slider').style.background = `linear-gradient(to right,var(--purple) ${state.hospitals / TOTAL * 100}%,#e9e8f0 ${state.hospitals / TOTAL * 100}%)`;
  $('hospital-slider').setAttribute('aria-valuetext', `${number(state.hospitals)} hospitals`);
  $('cost-mode').value = state.mode; inputValue('years', state.years); $('time-controls').hidden = state.mode === 'hardware';
  document.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.count) === state.hospitals)));
  document.querySelectorAll('.state-option input').forEach(el => el.checked = state.selected.includes(el.value));
  $('region-total').textContent = number(sum); $('region-count').textContent = `${state.selected.length} ${state.selected.length === 1 ? 'state' : 'states'}`;
  $('use-region').disabled = !state.selected.length;
  $('region-legend').hidden = !state.selected.length;
  $('quant-cost').textContent = money(c.quant); $('rtx-cost').textContent = money(c.rtx);
  $('quant-per').textContent = `${money(per.quant)} per hospital`; $('rtx-per').textContent = `${money(per.rtx)} per hospital`;
  $('saving-cost').textContent = money(Math.abs(c.difference));
  $('saving-percent').textContent = c.percent === null ? 'No RTX 3050 baseline cost' : Math.abs(c.percent) < 0.005 ? 'Equal costs in this scenario' : `${Math.abs(c.percent).toFixed(1)}% ${c.difference >= 0 ? 'lower' : 'higher'} for the quantized setup`;
  $('difference-label').textContent = c.difference >= 0 ? 'MODELLED DIFFERENCE' : 'QUANTIZED COST PREMIUM';
  $('selected-caption').textContent = `${number(state.hospitals)} hospitals`; $('focus-count').textContent = number(state.hospitals);
  $('cost-caption').textContent = state.mode === 'hardware' ? 'Hardware only · one-time cost' : `Hardware + ${state.years} ${state.years === 1 ? 'year' : 'years'} of electricity`;
  if (state.selected.length) {
    const names = STATES.filter(s => state.selected.includes(s[0])).map(s => s[1]);
    const regionCosts = costs(state, sum);
    $('scope-title').textContent = `${number(sum)} hospitals across ${state.selected.length === 16 ? 'all of Germany' : names.length > 2 ? `${names.length} selected states` : names.join(' + ')}`;
    $('scope-description').textContent = `Dashed marker: ${money(regionCosts.quant)} quantized · ${money(regionCosts.rtx)} RTX 3050. Your chosen deployment remains ${number(state.hospitals)} hospitals.`;
  } else {
    $('scope-title').textContent = 'One network. A clearer perspective.';
    $('scope-description').textContent = `${state.units} ${state.units === 1 ? 'setup' : 'setups'} per hospital${state.mode === 'total' ? ` · ${state.hours} hours/day · €${state.tariff.toFixed(3)}/kWh` : ' · hardware acquisition cost'}. Select states to add a regional benchmark.`;
  }
  drawChart();
}

function niceMax(value) { if (value <= 0) return 100; const power = 10 ** Math.floor(Math.log10(value)); const fraction = value / power; return ([1, 2, 2.5, 4, 5, 8, 10].find(n => n >= fraction) || 10) * power; }
function drawChart() {
  const svg = $('cost-chart');
  const width = Math.max(600, svg.getBoundingClientRect().width || 1000), height = width > 1100 ? 460 : 430;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const pad = { left: 75, right: 30, top: 83, bottom: 59 };
  const plotW = width - pad.left - pad.right, bottom = height - pad.bottom;
  const c = costs(state), max = costs(state, TOTAL), sum = regionTotal(state);
  const ceiling = niceMax(Math.max(max.quant, max.rtx) * 1.12);
  const x = n => pad.left + n / TOTAL * plotW, y = v => bottom - v / ceiling * (bottom - pad.top);
  const focusX = x(state.hospitals), qY = y(c.quant), rY = y(c.rtx), tickFont = width < 700 ? 13 : 12;
  let out = `<title id="chart-title">Hospital deployment costs: ${number(state.hospitals)} hospitals</title><desc id="chart-desc">${state.mode === 'hardware' ? 'Hardware only' : `Hardware and ${state.years} years of electricity`}. Quantized setup ${money(c.quant)}. RTX 3050 ${money(c.rtx)}. ${state.selected.length ? `Selected states: ${sum} hospitals.` : ''} All cost inputs are illustrative assumptions.</desc><rect width="${width}" height="${height}" fill="#fff"/><text x="${pad.left}" y="20" fill="#828899" font-size="11" letter-spacing="1.2">COST (EUR)</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = ceiling * i / 4, yy = y(v);
    out += `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#e9ebf1" ${i === 0 ? '' : 'stroke-dasharray="3 5"'}/><text x="${pad.left - 13}" y="${yy + 4}" fill="#8b90a0" font-size="${tickFont}" text-anchor="end">${shortMoney(v)}</text>`;
  }
  const ticks = width < 700 ? [0, 500, 1000, 1500, TOTAL] : [0, 250, 500, 750, 1000, 1250, 1500, TOTAL];
  for (const n of ticks) out += `<line x1="${x(n)}" y1="${bottom}" x2="${x(n)}" y2="${bottom + 5}" stroke="#d7dbe6"/><text x="${x(n)}" y="${bottom + 24}" text-anchor="middle" fill="#8b90a0" font-size="${tickFont}">${number(n)}</text>`;
  out += `<text x="${pad.left + plotW / 2}" y="${height - 7}" text-anchor="middle" fill="#757c8f" font-size="12">Number of hospitals</text>`;
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
  for (const [yy, labelY, value, color, title] of [[rY, rLabelY, c.rtx, '#3c5868', 'RTX'], [qY, qLabelY, c.quant, '#7255cd', 'Q']]) {
    const text = `${title}  ${money(value)}`, badgeW = Math.max(110, text.length * 7.1 + 22);
    const badgeX = focusX + badgeW + 20 < width - 3 ? focusX + 15 : Math.max(pad.left + 5, focusX - badgeW - 15);
    out += `<circle cx="${focusX}" cy="${yy}" r="10" fill="${color}" opacity=".13"/><circle cx="${focusX}" cy="${yy}" r="5.5" fill="${color}" stroke="white" stroke-width="2.5"/><line x1="${focusX}" y1="${yy}" x2="${badgeX > focusX ? badgeX : badgeX + badgeW}" y2="${labelY + 14}" stroke="${color}" opacity=".25"/><rect x="${badgeX}" y="${labelY}" width="${badgeW}" height="28" rx="6" fill="white" stroke="${color}" stroke-opacity=".2"/><text x="${badgeX + 11}" y="${labelY + 19}" fill="${color}" font-size="12" font-weight="600">${text}</text>`;
  }
  svg.innerHTML = out;
}

document.querySelectorAll('button[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('hospital-slider').addEventListener('input', e => { $('hospital-number').value = e.target.value; update({ hospitals: e.target.value }); });
$('hospital-number').addEventListener('input', e => { if (e.target.value !== '') { update({ hospitals: e.target.value }); $('hospital-slider').value = state.hospitals; } });
$('hospital-number').addEventListener('change', () => $('hospital-number').value = state.hospitals);
$('decrement').addEventListener('click', () => update({ hospitals: state.hospitals - 1 }));
$('increment').addEventListener('click', () => update({ hospitals: state.hospitals + 1 }));
document.querySelectorAll('[data-count]').forEach(b => b.addEventListener('click', () => update({ hospitals: Number(b.dataset.count) })));
$('cost-mode').addEventListener('change', e => update({ mode: e.target.value }));
$('years').addEventListener('input', e => { if (e.target.value !== '') update({ years: e.target.value }); });
$('years').addEventListener('change', () => $('years').value = state.years);
$('state-list').addEventListener('change', () => update({ selected: [...document.querySelectorAll('.state-option input:checked')].map(el => el.value) }));
$('select-all').addEventListener('click', () => update({ selected: STATES.map(s => s[0]) }));
$('clear-states').addEventListener('click', () => update({ selected: [] }));
$('use-region').addEventListener('click', () => update({ hospitals: regionTotal(state) }));
document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); }));
$('references-button').addEventListener('click', () => $('references-dialog').showModal());
function fillAssumptions(values) { for (const input of $('assumptions-form').querySelectorAll('input[name]')) input.value = values[input.name]; }
$('assumptions-button').addEventListener('click', () => { fillAssumptions(state); $('assumptions-dialog').showModal(); });
$('reset-assumptions').addEventListener('click', () => fillAssumptions(DEFAULTS));
$('assumptions-form').addEventListener('submit', e => { e.preventDefault(); if (!$('assumptions-form').reportValidity()) return; const values = Object.fromEntries(new FormData(e.currentTarget)); update(values); $('assumptions-dialog').close(); toast('Model assumptions updated on both screens.'); });
$('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('Fullscreen is unavailable in this browser. Use Presentation view.'); } catch { toast('Fullscreen is unavailable. Use Presentation view.'); } });
$('download').addEventListener('click', () => {
  const svg = $('cost-chart').cloneNode(true); const box = $('cost-chart').viewBox.baseVal;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', box.width); svg.setAttribute('height', box.height + 62);
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height + 62}`); svg.setAttribute('style', 'background:white;font-family:Arial,sans-serif');
  const lines = ['gAIn hospital deployment explorer · Illustrative cost assumptions, not measured results.', `${state.mode === 'hardware' ? 'Hardware only' : `Hardware + ${state.years} years electricity`} · ${state.units} setup(s)/hospital · Q: €${state.quantHardware}, ${state.quantWatts} W · RTX: €${state.rtxHardware}, ${state.rtxWatts} W`, `${state.hours} h/day · €${state.tariff}/kWh · Hospital counts: Destatis 2024 · futurecomputing.ai`];
  lines.forEach((line, i) => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', '20'); t.setAttribute('y', box.height + 17 + i * 17); t.setAttribute('font-size', '11'); t.setAttribute('fill', '#6e7486'); t.textContent = line; svg.append(t); });
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  const a = document.createElement('a'); a.href = url; a.download = `gain-${state.hospitals}-hospitals-${state.mode}.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
});

function otherView() { return view === 'display' ? 'controller' : 'display'; }
function roomURL(targetView = otherView(), remote = true) { const u = new URL(location.href); u.search = ''; u.searchParams.set('view', targetView); u.hash = `room=${room}&${remote ? 'join=1' : 'local=1'}`; return u.href; }
$('open-display').addEventListener('click', () => { storageSave(); window.open(roomURL('display', false), '_blank'); });
function renderPair() {
  $('room-code').textContent = room; const url = roomURL();
  $('pair-instructions').textContent = view === 'display' ? 'Scan this code with your iPad to open the controller, or enter the room code on the iPad.' : 'Open this page on the presentation device and enter the room code, or use the link below.';
  if (typeof window.qrcode === 'function') { const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 4, scalable: true }); }
  else $('qr-code').textContent = 'Use the room code to connect.';
  refreshStatus();
}
function peerMessage(message) { peerStateMessage = message; refreshStatus(); }
function stopRemote() {
  generation++; clearTimeout(reconnectTimer); clearTimeout(connectTimeout);
  for (const conn of connections) conn.close(); connections.clear();
  peer?.destroy(); peer = null; remoteConnected = false;
}
function wireConnection(conn, token) {
  connections.add(conn);
  conn.on('open', () => { if (token !== generation) return; clearTimeout(connectTimeout); remoteConnected = true; refreshStatus(); if (host) conn.send(statePacket()); });
  conn.on('data', data => { if (token === generation) acceptState(data, false, conn); });
  conn.on('close', () => { connections.delete(conn); if (token !== generation) return; remoteConnected = [...connections].some(c => c.open); if (!remoteConnected) { peerMessage('Connection lost · retrying'); if (!host) { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => connectRoom(false), 3500); } else peerMessage('Waiting for the other screen'); } });
  conn.on('error', () => { if (token !== generation) return; connections.delete(conn); remoteConnected = [...connections].some(c => c.open); if (!remoteConnected) peerMessage('Connection interrupted · use Retry connection'); });
}
function connectRoom(asHost) {
  stopRemote(); host = asHost; remoteActive = true;
  if (!window.Peer) { peerMessage('Connection library unavailable'); return; }
  const token = generation; peerMessage(asHost ? 'Starting room…' : 'Connecting to room…');
  const options = { debug: 0 };
  try { peer = asHost ? new window.Peer(`gain-hospital-v1-${room}`, options) : new window.Peer(options); }
  catch { peerMessage('This browser cannot create a peer connection'); return; }
  connectTimeout = setTimeout(() => { if (token === generation && !remoteConnected) peerMessage(host ? 'Room ready · waiting for another screen' : 'Not connected · check the room or retry'); }, 20000);
  peer.on('open', () => {
    if (token !== generation) return;
    if (host) { clearTimeout(connectTimeout); peerMessage('Room ready · scan or enter the code'); }
    else wireConnection(peer.connect(`gain-hospital-v1-${room}`, { reliable: true, serialization: 'json' }), token);
  });
  peer.on('connection', conn => { if (token === generation) wireConnection(conn, token); });
  peer.on('disconnected', () => { if (token !== generation) return; if (!remoteConnected) peerMessage('Signalling interrupted · reconnecting'); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 2500); });
  peer.on('error', error => {
    if (token !== generation) return;
    if (error.type === 'unavailable-id' && host) { connectRoom(false); return; }
    if (!remoteConnected) peerMessage(error.type === 'peer-unavailable' ? 'Room not found · keep the host screen open' : 'Connection unavailable · check network and retry');
    clearTimeout(connectTimeout);
  });
}
$('pair-button').addEventListener('click', () => { $('pair-dialog').showModal(); if (!remoteActive) connectRoom(true); renderPair(); });
$('retry-pair').addEventListener('click', () => { connectRoom(host); renderPair(); });
$('copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomURL()); toast('Link copied. Open it on the other screen.'); } catch { const input = $('join-code'); input.value = room; input.select(); toast('Clipboard unavailable. Enter the room code on the other device.'); } });
$('join-room').addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (!validRoom(code)) { toast('Enter the 8-character room code shown on the other screen.'); return; }
  room = code; lastLocalSeen = 0; startLocalChannel();
  const u = new URL(location.href); u.hash = `room=${room}&join=1`; history.replaceState(null, '', u);
  connectRoom(false); renderPair();
});
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join-room').click(); });
window.addEventListener('pagehide', () => { postLocal('bye'); stopRemote(); });
window.addEventListener('pageshow', e => { if (e.persisted && remoteActive) connectRoom(host); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && remoteActive && !remoteConnected) connectRoom(host); });
new ResizeObserver(() => scheduleRender()).observe($('cost-chart'));
setView(view); render();
if (hash.get('join') === '1' && validRoom(hash.get('room'))) { connectRoom(false); renderPair(); }
