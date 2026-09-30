'use strict';

// =====================================================================
// SHARED UI: what every page has in common. game.js holds the rules and the
// saved game; this file draws the toolbar, dashboard and dialogs, keeps the
// pages in sync, and runs the daily clock. Each page script builds on it.
// =====================================================================

// Throws a clear error if a page and its script ever disagree on an id.
const $ = id => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`This page has no element with id "${id}"`);
  return el;
};

// ---- Formatting ----

const money = n => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString();
const cents = n => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price2 = n => (n < 0 ? '-$' : '$') + cents(n);
const signed = n => (n < 0 ? '-' : '+') + '$' + cents(n);
const signedWhole = n => (n < 0 ? '-' : '+') + '$' + Math.round(Math.abs(n)).toLocaleString();
const pct = n => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
const shortMoney = n => n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
const itemList = obj => Object.entries(obj).filter(([, n]) => n > 0)
  .map(([item, n]) => `${n} ${itemName(item)}`).join(', ');
const plusMinus = n => `<b class="num ${n < 0 ? 'neg' : 'pos'}">${signed(n)}</b>`;
const row = (label, value, cls = '') => `<div class="row ${cls}"><span class="muted">${label}</span>${value}</div>`;
const unitsOf = obj => Object.values(obj).reduce((sum, n) => sum + n, 0);
const plainProfit = n => n >= 0 ? `a profit of about ${money(n)}` : `a loss of about ${money(-n)}`;

// ---- Icons: simple line drawings, 24x24, drawn with currentColor ----

const ICONS = {
  farm: '<path d="M3 21V10l9-6 9 6v11"/><path d="M8 21v-7h8v7"/><path d="M8 14l8 7M16 14l-8 7"/>',
  factory: '<path d="M3 21V11l6 4v-4l6 4V6h4v15z"/>',
  shop: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.5 2.5 0 005 0 2.5 2.5 0 006 0 2.5 2.5 0 005 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>',
  cafe: '<path d="M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4z"/><path d="M16 9h2a2 2 0 010 4h-2"/><path d="M8 3v2M12 3v2"/>',
  warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M8 21v-8h8v8"/><path d="M8 17h8"/>',
  apartment: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9.5 7h1M13.5 7h1M9.5 11h1M13.5 11h1M9.5 15h1M13.5 15h1"/><path d="M10 21v-3h4v3"/>',
  hotel: '<rect x="4" y="4" width="16" height="17" rx="1"/><path d="M8 8h2M14 8h2M8 12h2M14 12h2"/><path d="M10 21v-4h4v4"/>',
  coins: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.7s1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.7-2.5 1.7c-1.1 0-2-.4-2.5-1.2M12 6.5v1.8M12 15.7v1.8"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-6M2 20h20"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 5a3.5 3.5 0 010 6.5M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  plot: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 9v6M9 12h6"/>',
  depot: '<path d="M2 16V7h11v9"/><path d="M13 10h4l4 4v2h-8"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const companyMark = (company, extraClass = '') => company
  ? `<span class="company-mark ${extraClass}" style="--mark-color:${COMPANY_COLORS[company.color]}">${icon(company.symbol)}</span>`
  : '';

// ---- Building status ----

const STATUS = {
  ok: 'Running', nostaff: 'Needs workers', nostock: 'Out of stock', full: 'Storage full', waiting: 'Delivery on the way',
};

// The live status of a building: no workers beats anything the last day reported.
function plotStatus(plot) {
  if (!plot.building) return null;
  if (!isStaffed(plot)) return 'nostaff';
  const stalled = plot.last.issue === 'stock' || plot.last.issue === 'waiting';
  if (stalled && incomingTo(state.plots.indexOf(plot)) > 0) return 'waiting';
  if (plot.last.issue === 'stock') return 'nostock';
  if (plot.last.issue === 'full' && usedSpace(plot) / capacityOf(plot) >= 0.85) return 'full';
  return 'ok';
}

// ---- What each page remembers between visits (not game data, so not in the saved game) ----

function uiGet(key, fallback) {
  try {
    const value = sessionStorage.getItem('pt-' + key);
    return value === null ? fallback : JSON.parse(value);
  } catch (e) { return fallback; }
}
function uiSet(key, value) {
  try { sessionStorage.setItem('pt-' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

// ---- Links between pages ----

const PAGES = [['city', 'index.html', 'City'], ['company', 'company.html', 'Company'], ['market', 'market.html', 'Market'], ['finance', 'finance.html', 'Finance'], ['bank', 'bank.html', 'Bank']];

// A link to a page, with details (which plot, which tab) after the # so the page can pick them up.
function pageLink(page, params = {}) {
  const file = PAGES.find(p => p[0] === page)[1];
  const query = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return query ? `${file}#${query}` : file;
}
function hashParams() {
  const out = {};
  String(location.hash || '').replace(/^#/, '').split('&').filter(Boolean).forEach(pair => {
    const [k, v] = pair.split('=');
    out[k] = decodeURIComponent(v || '');
  });
  return out;
}
const goTo = (page, params) => { location.href = pageLink(page, params); };

// ---- Toolbar and dashboard ----

function buildShell(page) {
  $('toolbar').innerHTML = `<div class="toolbar-inner">
    <h1><a href="index.html">Plot Tycoon</a></h1>
    <a class="toolbar-company" href="company.html" aria-label="Open company page"><span id="toolbar-company-mark"></span><span class="toolbar-company-name" id="toolbar-company-name"></span></a>
    <span class="date" id="date"></span>
    <nav class="tabs main-tabs" aria-label="Pages">${PAGES.map(([id, file, label]) =>
      `<a href="${file}"${id === page ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="toolbar-actions">
      <button id="btn-help">How to play</button>
    </div></div>`;
}

function renderCompanyShell() {
  const company = state.company;
  $('toolbar-company-mark').innerHTML = companyMark(company);
  $('toolbar-company-name').textContent = company ? company.name : 'Set up company';
  document.documentElement.style.setProperty('--company-color', company ? COMPANY_COLORS[company.color] : 'var(--ink)');
}

// Only two numbers stay on screen everywhere: cash, and how the last day went.
function renderDashboard() {
  renderCompanyShell();
  const d = state.lastDay;
  const item = (ic, label, value, cls) =>
    `<div class="sum-item">${icon(ic)}<div style="min-width:0"><span>${label}</span><b class="${cls}">${value}</b></div></div>`;
  $('dashboard').innerHTML =
    item('coins', 'Cash', money(state.cash), state.cash < 0 ? 'neg' : '') +
    item('chart', "Today's profit or loss", signedWhole(d.profit), d.profit < 0 ? 'neg' : d.profit > 0 ? 'pos' : '');
  $('date').textContent = `${dateOf(state.day)} · Day ${state.day}`;
}

// ---- Alerts: the one thing that needs attention in a building, with at most one button ----

function alertFor(plot) {
  const i = state.plots.indexOf(plot);
  const type = plot.building, cap = capacityOf(plot), used = usedSpace(plot);
  const makes = type === 'farm' || type === 'factory', canSell = LISTERS.includes(type);
  if (!isStaffed(plot)) {
    return { kind: 'bad', text: type === 'depot' ? 'No drivers. Trucks cannot leave until you hire someone.' : 'No workers. This building earns nothing until you hire someone.',
      button: { label: type === 'depot' ? 'Hire a driver' : 'Hire a worker', action: 'hire' } };
  }
  if (type === 'depot') {
    const waiting = state.deliveries.filter(d => d.kind === 'contract' && d.depot === i && d.status === 'pending').length;
    if (cap && used >= cap) return { kind: 'warn', text: 'The depot storage is full, so it cannot take new contracts.', button: null };
    if (waiting > 0 && freeTrucks(i) <= 0) {
      return { kind: 'info', text: `All trucks are busy. ${waiting} deliver${waiting === 1 ? 'y is' : 'ies are'} waiting for one.`, button: null };
    }
    return null;
  }
  // "Full" follows the real storage level, so selling stock clears the alert straight away.
  if (cap && (used >= cap || (plot.last.issue === 'full' && used / cap >= 0.85))) {
    return { kind: 'warn', text: makes ? 'Storage is full, so production has stopped.' : 'Storage is full.',
      button: canSell && used > 0 ? { label: 'Sell stock', action: 'sell-all' } : null };
  }
  if (cap && canSell && used / cap >= 0.85) {
    return { kind: 'warn', text: `Storage is almost full (${Math.round(used / cap * 100)}%).`,
      button: { label: 'List on market', action: 'list-top' } };
  }
  const issue = plot.last.issue;
  if ((issue === 'waiting' || issue === 'stock') && incomingTo(i) > 0) {
    return { kind: 'info', text: `Waiting for a delivery: ${incomingTo(i)} items are on their way.`, button: null };
  }
  if (issue === 'stock') {
    return type === 'factory'
      ? { kind: 'warn', text: 'Could not get ingredients. Buy crops on the market or list farm goods.', button: { label: 'Open market', action: 'goto-market' } }
      : { kind: 'warn', text: 'Out of stock. It orders stock every evening if you have the cash.', button: null };
  }
  return null;
}

const alertBox = a => !a ? '' :
  `<div class="alert ${a.kind}" role="alert"><span>${a.text}</span>${a.button ? `<button class="small" data-alert="${a.button.action}">${a.button.label}</button>` : ''}</div>`;

// What an alert button does for building `i`. Some stay on the page, some open another page.
function runAlert(action, i) {
  const plot = state.plots[i];
  if (action === 'sell-all') gameService.sellAllInventory(i);
  else if (action === 'hire') goTo('company', { plot: i, tab: 'workers' });
  else if (action === 'goto-market') goTo('market', { plot: i });
  else if (action === 'list-top') {                   // open the Market page with the biggest pile of stock ready to list
    const top = Object.keys(plot.inv).sort((a, b) => plot.inv[b] - plot.inv[a])[0];
    goTo('market', { plot: i, item: top, list: 1 });
  }
}

// ---- Small panels used by more than one page ----

// Expected daily figures as a small table.
function estimateBlock(e, title) {
  const line = (label, n, cost) => n ? row(label, `<span class="num ${cost ? 'neg' : 'pos'}">${cost ? '-' : '+'}${price2(n)}</span>`) : '';
  return `<div class="est"><div class="est-title">${title}</div>
    ${line('Income', e.income)}${line('Stock', e.stock, true)}${line('Wages', e.wages, true)}
    ${line('Maintenance', e.maintenance, true)}${line('Property tax', e.property, true)}${line('Profit tax', e.tax, true)}
    ${row('Net per day', plusMinus(e.net), 'total')}
    ${e.note ? `<p class="muted small-note">${e.note}</p>` : ''}</div>`;
}

// A short summary of the day that just finished. The full breakdown lives on the Finance page.
function todaySummary(plot) {
  const r = plot.last, type = plot.building, made = unitsOf(r.produced), sold = unitsOf(r.sold);
  if (!r.revenue && !r.wages && !r.property && !r.maintenance && !made) {
    return '<h3>Today</h3><p class="muted">Numbers appear after the first day.</p>';
  }
  const soldText = sold ? `${sold} items for ${money(r.revenue)}`
    : r.revenue ? `${money(r.revenue)} in ${type === 'apartment' ? 'rent' : type === 'depot' ? 'delivery prices' : 'contracts'}` : 'nothing';
  const profit = dayProfit(r);
  return `<h3>Today</h3>
    ${type === 'farm' || type === 'factory' ? row('Made', `<span>${made ? `${made} items` : 'nothing'}</span>`) : ''}
    ${row(type === 'apartment' || type === 'depot' ? 'Earned' : 'Sold', `<span>${soldText}</span>`)}
    ${row('Wages', `<span class="num">${money(r.wages)}</span>`)}
    ${row('Taxes', `<span class="num">${money(r.property + r.tax)}</span>`)}
    ${row('Profit', `<b class="num ${profit < 0 ? 'neg' : 'pos'}">${signedWhole(profit)}</b>`, 'total')}
    <p class="muted small-note">Profit counts every cost, including stock, upkeep and deliveries. Details are on the Finance page.</p>`;
}

function txRows(list) {
  return list.map(t => `<div class="tx"><span>Day ${t.day} · ${TX_LABEL[t.type]}<small>${t.note}</small></span>${plusMinus(t.amount)}</div>`).join('');
}

// Transactions from every building and the bank (or just building `only`, or just the bank when `only` is 'bank'), newest first.
function allTransactions(limit, only) {
  const fromBuildings = state.plots.flatMap((p, i) => only === undefined || only === i ? p.history.map(t => Object.assign({ where: i }, t)) : []);
  const fromBank = only === undefined || only === 'bank' ? state.bank.history.map(t => Object.assign({ where: 'bank' }, t)) : [];
  return fromBuildings.concat(fromBank)
    .sort((a, b) => b.id - a.id).slice(0, limit)
    .map(t => Object.assign({}, t, { note: `${t.where === 'bank' ? 'Bank' : plotLabel(t.where)} · ${t.note}` }));
}

// ---- Toasts and dialogs ----

// Show queued notices as toasts that fade after a moment.
function renderToasts() {
  const box = $('toasts');
  notices.splice(0).forEach(message => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    box.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  });
}

let modalButtons = [];
let modalDismissible = true;
function openModal(title, body, buttons, dismissible = true) {
  modalButtons = buttons;
  modalDismissible = dismissible;
  $('modal').innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h2>${title}</h2>${body}
    <div class="modal-actions">${buttons.map((b, k) => `<button data-modal="${k}" class="${b.kind || ''}">${b.label}</button>`).join('')}</div></div>`;
  $('modal').hidden = false;
}
function closeModal() {
  $('modal').hidden = true;
  $('modal').innerHTML = '';
  modalButtons = [];
  modalDismissible = true;
}
function onModalClick(e) {
  const button = e.target.closest('[data-modal]');
  if (!button && e.target !== $('modal')) return;
  if (!button && !modalDismissible) return;
  const chosen = button ? modalButtons[Number(button.dataset.modal)] : null;
  closeModal();
  if (chosen && chosen.onClick) chosen.onClick();
  render(true);
}

let companyDraft = null;
function companyIdentityForm(company) {
  const current = company || { name: '', symbol: 'plot', color: 'forest' };
  const symbols = Object.entries(COMPANY_SYMBOLS).map(([id, label]) => `<label class="company-symbol-option">
    <input type="radio" name="company-symbol" value="${id}" ${current.symbol === id ? 'checked' : ''}>
    ${companyMark({ symbol: id, color: current.color })}<span>${label}</span></label>`).join('');
  const colors = Object.entries(COMPANY_COLORS).map(([id, color]) => `<label class="company-color-option" title="${id}">
    <input type="radio" name="company-color" value="${id}" ${current.color === id ? 'checked' : ''}>
    <span style="--swatch:${color}"></span><span>${id}</span></label>`).join('');
  return `<div class="company-form">
    <label class="company-name-field" for="company-name">Company name</label>
    <input id="company-name" maxlength="30" autocomplete="organization" value="${escapeHtml(current.name)}" placeholder="Your company name">
    <fieldset><legend>Symbol</legend><div class="company-symbols">${symbols}</div></fieldset>
    <fieldset><legend>Color</legend><div class="company-colors">${colors}</div></fieldset>
    <p class="muted company-form-hint">Your color marks land you own on every city map.</p>
  </div>`;
}

function showCompanyIdentityEditor(required = false) {
  const company = state.company || { name: '', symbol: 'plot', color: 'forest' };
  companyDraft = Object.assign({}, company);
  const buttons = required ? [] : [{ label: 'Cancel' }];
  buttons.push({ label: required ? 'Create company' : 'Save changes', kind: 'primary', onClick: () => {
    const result = gameService.setCompanyIdentity(companyDraft.name, companyDraft.symbol, companyDraft.color);
    if (!result.ok) {
      notify('Use a company name with 2â€“30 letters or numbers.');
      showCompanyIdentityEditor(required);
      return;
    }
    render(true);
    if (required && !state.seenWelcome) showHelp();
  } });
  openModal(required ? 'Create your company' : 'Edit company identity', companyIdentityForm(companyDraft), buttons, !required);
  setTimeout(() => $('company-name').focus(), 0);
}

function onCompanyModalInput(e) {
  if (!companyDraft) return;
  if (e.target.id === 'company-name') companyDraft.name = e.target.value;
  else if (e.target.name === 'company-symbol') companyDraft.symbol = e.target.value;
  else if (e.target.name === 'company-color') companyDraft.color = e.target.value;
}

function showHelp() {
  state.seenWelcome = true;                               // so it only pops up by itself the first time
  saveGame();
  openModal('How to play',
    `<ul>
      <li><b>Start small.</b> You have $6,000. On the City page, buy a cheap Outskirts plot and build a farm: it is the cheapest way to earn.</li>
      <li><b>Nothing earns without workers.</b> Hire staff on the Company page. Shops, cafes and hotels also need stock, which they buy from the market each morning.</li>
      <li><b>Sell your goods.</b> Farms and factories fill up with stock. Sell it on the Market page, or list it there at your own price. Shop prices are set there too.</li>
      <li><b>Move goods.</b> Market orders arrive by themselves a day later. To send goods between your own buildings, build a Transport Depot, hire drivers, and make a delivery contract on the Company page. Stock on a truck cannot be sold or used until it arrives.</li>
      <li><b>Watch the costs.</b> Wages, upkeep and taxes come out every day. The Finance page shows where the money goes, plus taxes, inflation and every transaction.</li>
      <li><b>Borrow only if you need to.</b> The Bank page offers loans. You choose the amount and how many days to repay it. The payment comes out automatically every day, and a missed payment costs a late fee and lowers your credit score.</li>
      <li><b>Grow.</b> Upgrade buildings on the Company page, and save up for factories, warehouses and hotels. A day passes every few seconds and the game saves automatically.</li>
    </ul>`,
    [{ label: 'Start playing', kind: 'primary' }]);
}

// ---- Drawing ----

// While the player is typing in a field, the clock must not redraw it away.
function isEditing() {
  const a = document.activeElement;
  return Boolean(a && ['INPUT', 'SELECT'].includes(a.tagName) && a.closest && a.closest('.panel'));
}

function render(force) {
  renderDashboard();
  if (force || !isEditing()) PAGE.renderPage();
  renderToasts();
}

// ---- Keeping every page on the same game ----

// All pages read and write one saved game. Before anything else, take the newest copy from storage.
function reloadState() {
  state = loadGame();
}

// Use this instead of addEventListener for anything that changes the game. It takes the newest saved
// game first, so a page that was left open can never overwrite what another page did meanwhile.
function onAction(element, type, handler) {
  element.addEventListener(type, e => { reloadState(); handler(e); });
}

// Development-only local clock. In multiplayer, browsers will never run world days;
// a scheduled Cloudflare Worker will call the server-side runWorldDay instead.
function clockTick() {
  reloadState();
  if (!state.company) { render(false); return; }
  if (Date.now() - state.lastTick >= LOCAL_DEVELOPMENT_DAY_MS - 250) {
    state.lastTick = Date.now();
    gameService.runWorldDay(state.day);
  }
  render(false);
}

// ---- Starting a page ----

let PAGE = { name: '', renderPage() {} };

// Each page calls this once with its name and the function that draws the page.
function startPage(name, renderPage) {
  PAGE = { name, renderPage };
  buildShell(name);
  // Save right away. A brand new game must exist for the other pages, and a save from before the pages
  // were split has no clock time yet: until it is written down, every reload would think "now" and the
  // clock would never fire.
  saveGame();
  $('btn-help').addEventListener('click', showHelp);
  $('modal').addEventListener('click', onModalClick);
  $('modal').addEventListener('input', onCompanyModalInput);
  $('modal').addEventListener('change', onCompanyModalInput);
  render(true);
  if (!state.company) showCompanyIdentityEditor(true);
  else if (!state.seenWelcome) showHelp();
  setInterval(clockTick, 500);
  // Another tab changed the saved game: show it straight away.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => {
      if (e.key === SAVE_KEY) { reloadState(); render(false); }
    });
  }
}
