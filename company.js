'use strict';

// =====================================================================
// COMPANY PAGE: every building you own, with its workers, inventory and upgrades,
// and the deliveries moving goods between them.
// =====================================================================

const TABS = [['overview', 'Overview'], ['workers', 'Workers'], ['inventory', 'Inventory'], ['upgrades', 'Upgrades']];
let selected = null;                  // the building being looked at
let tab = 'overview';
let hireRole = null;                  // role picked in the hire dropdown
let contractForm = { supplier: null, item: null, destination: null, qty: null, fee: null, days: null };   // the delivery contract form

// Links from other pages say which building and tab to open, e.g. company.html#plot=12&tab=workers.
function readStart() {
  const h = hashParams();
  selected = h.plot !== undefined && h.plot !== '' ? Number(h.plot) : uiGet('company-selected', null);
  tab = TABS.some(t => t[0] === h.tab) ? h.tab : uiGet('company-tab', 'overview');
}

function choose(i) {
  selected = i;
  hireRole = null;
  uiSet('company-selected', i);
}
function chooseTab(name) {
  tab = name;
  uiSet('company-tab', name);
}

// ---- The list of buildings ----

function renderCompanyProfile() {
  const company = state.company;
  if (!company) {
    $('company-profile').innerHTML = '<p class="muted">Create your company identity to continue.</p>';
    return;
  }
  $('company-profile').innerHTML = `<div class="company-profile-main">
      ${companyMark(company, 'company-mark-large')}
      <div><h2 id="company-profile-name">${escapeHtml(company.name)}</h2><p class="muted">${COMPANY_SYMBOLS[company.symbol]} symbol Â· ${company.color} color</p></div>
    </div><button id="edit-company">Edit company identity</button>`;
}

function renderList() {
  const owned = state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => plot.building);
  const workers = owned.reduce((sum, { plot }) => sum + plot.workers.length, 0);
  const rows = owned.map(({ plot, i }) => {
    const status = plotStatus(plot), profit = dayProfit(plot.last);
    const stock = hasInventory(plot) && usedSpace(plot) > 0 ? ` · ${Math.round(usedSpace(plot) / capacityOf(plot) * 100)}% full` : '';
    return `<button class="co-row${i === selected ? ' selected' : ''}" data-select="${i}">
      <span class="badge b-${plot.building}">${icon(plot.building)}</span>
      <span class="co-main"><b>${BUILDINGS[plot.building].name}, level ${plot.level}</b>
        <small>${DISTRICTS[districtOf(i)].name} · plot ${plotLabel(i)} · ${plot.workers.length}/${slotsOf(plot)} workers${stock}</small></span>
      <span class="co-side"><b class="num ${profit < 0 ? 'neg' : 'pos'}">${signedWhole(profit)}</b><small><i class="dot ${status}"></i>${STATUS[status]}</small></span></button>`;
  }).join('');
  $('company-list').innerHTML = `<h2>Your buildings</h2>` + (owned.length
    ? `<p class="muted">${owned.length} building${owned.length === 1 ? '' : 's'}, ${workers} worker${workers === 1 ? '' : 's'}</p><div class="co-list">${rows}</div>`
    : `<div class="empty-state">${icon('plot')}<b>No buildings yet</b>Buy a plot and build on the <a href="${pageLink('city')}">City page</a>.</div>`);
}

// ---- One building ----

// Trucks, drivers and cargo: what a depot is all about.
function depotSummary(plot, i) {
  const level = plot.level, trucks = trucksAt(level), running = operableTrucks(plot), busy = busyTrucks(i);
  return `<h3>Trucks</h3>
    ${row('Trucks running', `<span>${running} of ${trucks} (${busy} on the road)</span>`)}
    ${row('Each truck carries', `<span>${truckLoadAt(level)} items</span>`)}
    ${row('How far a truck drives', `<span>${Math.round(TILES_PER_DAY * speedAt(level))} tiles a day</span>`)}
    ${row('Cargo waiting or riding', `<span>${usedSpace(plot)} of ${capacityOf(plot)} items</span>`)}
    ${plot.workers.length < trucks ? `<p class="muted small-note">Every truck needs a driver. Hire ${trucks - plot.workers.length} more to run all ${trucks}.</p>` : ''}`;
}

function overviewTab(plot, i) {
  const type = plot.building, alert = alertFor(plot);
  const alertSells = alert && alert.button && alert.button.action === 'sell-all';
  const full = plot.workers.length >= slotsOf(plot), maxed = plot.level >= MAX_LEVEL;
  const buttons = [
    maxed ? '<button disabled>Fully upgraded</button>' : `<button class="primary" data-tab="upgrades">Upgrade · ${money(upgradeCost(plot))}</button>`,
    `<button data-tab="workers" ${full ? 'disabled' : ''}>${type === 'depot' ? 'Hire driver' : 'Hire worker'}</button>`,
  ];
  buttons.push('<button data-act="toggle-closed">' + (plot.closed ? 'Reopen building' : 'Temporarily close') + '</button>');
  buttons.push('<button data-act="sell-building">Sell building</button>', '<button data-act="sell-property">Sell property</button>');
  if (LISTERS.includes(type) && usedSpace(plot) > 0 && !alertSells) buttons.push('<button data-act="sell-all">Sell stock</button>');
  const trades = LISTERS.includes(type) || RETAIL[type];
  // Sending goods to another of your buildings, or asking for goods to be sent here.
  const canSend = canSupply(plot) && Object.keys(plot.inv).some(item => plot.inv[item] > 0);
  const canReceive = type !== 'depot' && Object.keys(ITEMS).some(item => accepts(plot, item));
  return `<p class="muted">${BUILDINGS[type].desc}</p>
    ${type === 'depot' ? depotSummary(plot, i) : ''}
    ${todaySummary(plot)}
    <div class="actions-row">${buttons.join('')}</div>
    <div class="actions-row">
      ${canSend ? '<button data-act="send-from">Send stock</button>' : ''}
      ${canReceive ? '<button data-act="order-to">Order a delivery</button>' : ''}
      ${trades ? `<a class="button" href="${pageLink('market', { plot: i })}">${RETAIL[type] ? 'Set prices' : 'Sell or list stock'}</a>` : ''}
      <a class="button" href="${pageLink('finance', { plot: i })}">Money details</a>
    </div>`;
}

function workerRow(w, index) {
  return `<div class="worker">
    <span><b>${w.name}</b><small>${w.role} · ${Math.round(w.efficiency * 100)}% efficient · ${money(w.wage)}/day</small></span>
    <button class="small" data-fire="${index}">Fire</button></div>`;
}

function workersTab(plot, i) {
  if (plot.closed) return '<p class="notice">This building is temporarily closed. Staff are retained and wages are paused. Reopen it from Overview before hiring.</p><div class="workers">' + plot.workers.map(workerRow).join('') + '</div>';
  const def = BUILDINGS[plot.building], slots = slotsOf(plot), full = plot.workers.length >= slots;
  const role = def.roles.find(r => r.role === hireRole) || def.roles[0];
  const options = def.roles.map(r => `<option value="${r.role}" ${r.role === role.role ? 'selected' : ''}>${r.role} (about ${money(wageOf(r.wage))}/day)</option>`).join('');
  const now = estimateNow(plot, i);
  const withOne = estimate(plot.building, plot.level, crewOf(plot).concat([{ efficiency: 1, wage: wageOf(role.wage) }]), i, plot.priceMult);
  const wages = plot.workers.reduce((sum, w) => sum + w.wage, 0);
  const gain = round2(withOne.net - now.net);
  const list = plot.workers.length
    ? `<div class="workers">${plot.workers.map(workerRow).join('')}</div>`
    : `<div class="empty-state">${icon('users')}<b>No workers yet</b>This ${def.name.toLowerCase()} earns nothing until you hire someone.</div>`;
  return `<div class="row"><b>${plot.workers.length} of ${slots} slots used</b><span class="muted">payroll ${money(wages)}/day</span></div>
    ${list}
    <h3>Hire a worker</h3>
    <div class="hire">
      <select id="hire-role" ${full ? 'disabled' : ''}>${options}</select>
      <button class="primary" id="hire-worker" ${full ? 'disabled' : ''}>Hire Worker</button>
    </div>
    <div class="notice">${full ? 'All slots are used. Upgrade the building for more.' :
      `A new worker costs about ${money(wageOf(role.wage))} a day, plus a one-time fee of about ${money(wageOf(role.wage) * HIRE_FEE_DAYS)}. ${gain >= 0 ? `They should add about ${money(gain)} a day.` : `They would lose about ${money(-gain)} a day.`}`}</div>`;
}

// Read-only: what is in storage, and what is on its way. Selling and pricing live on the Market page.
function inventoryTab(plot, i) {
  if (!hasInventory(plot)) {
    return `<div class="empty-state">${icon('box')}<b>No storage here</b>An ${BUILDINGS[plot.building].name.toLowerCase()} does not hold goods.</div>`;
  }
  const used = usedSpace(plot), cap = capacityOf(plot), sells = LISTERS.includes(plot.building), depot = plot.building === 'depot';
  const stock = stockOf(plot, i);
  const rows = Object.keys(ITEMS).filter(item => (stock[item] || 0) > 0).map(item => {
    const listed = state.listings.find(l => l.plot === i && l.item === item);
    const note = !sells ? '' : listed ? `${Math.min(listed.qty, stock[item])} listed for sale` : 'not for sale';
    return `<div class="item-row"><span>${ITEMS[item].name}<small>${note}</small></span><b class="num">${stock[item]}</b></div>`;
  }).join('');
  const coming = state.deliveries.filter(d => d.destination === i && inTransit(d)).sort((a, b) => (a.arriveDay || 1e9) - (b.arriveDay || 1e9));
  const comingRows = coming.map(d => `<div class="item-row"><span>${d.cargo} ${itemName(d.item)}<small>from ${d.source}</small></span>
    <small class="muted">${d.status === 'pending' ? 'waiting for a truck' : `arrives day ${d.arriveDay}`}</small></div>`).join('');
  const empty = depot ? 'No cargo. Goods appear here while a contract waits for a truck or is on the road.'
    : sells ? 'Goods appear here once they are made or delivered.' : 'This building orders its stock every evening. It arrives the next day.';
  return `<div class="row"><b>${used} of ${cap} items</b><span class="muted">${Math.round(used / cap * 100)}% full</span></div>
    <div class="bar"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div>
    ${rows || `<div class="empty-state">${icon('box')}<b>${depot ? 'No cargo' : 'Storage is empty'}</b>${empty}</div>`}
    ${comingRows ? `<h3>On the way to this building</h3>${comingRows}` : ''}
    ${sells ? `<div class="actions-row"><a class="button" href="${pageLink('market', { plot: i })}">Sell or list this stock</a></div>` : ''}`;
}

// The before-and-after rows for an upgrade.
function upgradeRows(plot) {
  const type = plot.building, L = plot.level, N = Math.min(L + 1, MAX_LEVEL);
  const retail = RETAIL[type], makes = type === 'farm' || type === 'factory';
  const rows = [];
  if (hasInventory(plot)) rows.push(['Storage', capacityAt(type, L), capacityAt(type, N)]);
  rows.push(['Worker slots', slotsAt(L), slotsAt(N)]);
  if (makes || retail || type === 'apartment') {
    rows.push([makes ? 'Production speed' : type === 'apartment' ? 'Rent income' : 'Service speed', `${Math.round(speedAt(L) * 100)}%`, `${Math.round(speedAt(N) * 100)}%`]);
  }
  if (retail) rows.push(['Customers', `${Math.round(demandAt(L) * 100)}%`, `${Math.round(demandAt(N) * 100)}%`]);
  if (type === 'depot') {
    rows.push(['Trucks', trucksAt(L), trucksAt(N)]);
    rows.push(['Truck load', truckLoadAt(L), truckLoadAt(N)]);
    rows.push(['Delivery speed', `${Math.round(speedAt(L) * 100)}%`, `${Math.round(speedAt(N) * 100)}%`]);
  }
  rows.push(['Building value', money(valueAt(type, L)), money(valueAt(type, N))]);
  return rows;
}

function upgradesTab(plot, i) {
  const type = plot.building, L = plot.level, max = L >= MAX_LEVEL, N = Math.min(L + 1, MAX_LEVEL);
  const cost = upgradeCost(plot), now = estimateNow(plot, i);
  const next = estimate(type, N, crewOf(plot), i, plot.priceMult);
  const gain = round2(next.net - now.net), short = cost - state.cash;
  return `<div class="row"><b>Level ${L} of ${MAX_LEVEL}</b><span class="muted">worth ${money(buildingValue(plot))}</span></div>
    <div class="level-bar">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= L ? 'on' : ''}"></i>`).join('')}</div>
    <table class="compare">${upgradeRows(plot).map(([label, a, b]) => `<tr><td class="muted">${label}</td><td>${a}</td><td>${max ? '' : '→ ' + b}</td></tr>`).join('')}</table>
    ${max ? '<div class="notice">This building is fully upgraded.</div>' : `
      <p>You would go from ${plainProfit(now.net)} to ${plainProfit(next.net)} a day.
      ${gain > 0 ? `That pays back the ${money(cost)} in ${paybackText(cost, gain)}.` : 'This upgrade does not pay for itself here. It helps most in busy districts, or once you hire into the new slots.'}</p>
      <div class="build-actions"><button class="primary" data-act="upgrade" ${short > 0 ? 'disabled' : ''}>${short > 0 ? `Need ${money(short)} more` : `Upgrade for ${money(cost)}`}</button></div>`}`;
}

// Header, then any alert, then the tabs.
function renderDetail() {
  const box = $('company-detail');
  if (selected === null || !state.plots[selected] || !state.plots[selected].building) {
    box.innerHTML = `<div class="empty-state">${icon('plot')}<b>No building selected</b>Pick one from the list to see its workers, stock and upgrades.</div>`;
    return;
  }
  const i = selected, plot = state.plots[i], def = BUILDINGS[plot.building], status = plotStatus(plot);
  const tabs = { overview: overviewTab, workers: workersTab, inventory: inventoryTab, upgrades: upgradesTab };
  const body = (tabs[tab] || overviewTab)(plot, i);
  box.innerHTML = `<div class="insp-head"><span class="badge b-${plot.building}">${icon(plot.building)}</span>
      <div><h2>${def.name}, level ${plot.level}</h2><small>${DISTRICTS[districtOf(i)].name} · plot ${plotLabel(i)}</small></div>
      <span class="status"><i class="dot ${status}"></i>${STATUS[status]}</span></div>
    ${alertBox(alertFor(plot))}
    <nav class="tabs insp-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}" class="${id === tab ? 'active' : ''}">${label}</button>`).join('')}</nav>
    <div class="tab-body">${body}</div>`;
}

function renderPerks() {
  const perks = PERKS.map(p => {
    const unlocked = hasPerk(p.id);
    const need = p.cost - state.cash;
    const btn = unlocked
      ? '<span class="status"><i class="dot ok"></i>Unlocked</span>'
      : `<button class="primary small" data-unlock-perk="${p.id}" ${need > 0 ? 'disabled' : ''}>${need > 0 ? `Need ${money(need)} more` : `Unlock · ${money(p.cost)}`}</button>`;
    return `<div class="perk-card${unlocked ? ' unlocked' : ''}">
      <div class="perk-top">
        <b>${icon('perk')} ${escapeHtml(p.name)}</b>
        ${btn}
      </div>
      <small class="muted">${escapeHtml(p.desc)}</small>
    </div>`;
  }).join('');

  $('company-perks').innerHTML = `<h2>Company Perks & Upgrades</h2>
    <p class="muted">Research and unlock enterprise advantages to expand efficiency across your commercial empire.</p>
    <div class="perks-grid">${perks}</div>`;
}

function renderAchievements() {
  const completed = Array.isArray(state.achievements) ? state.achievements : [];
  const cards = MILESTONES.map(m => {
    const done = completed.includes(m.id);
    const badge = done
      ? `<span class="status"><i class="dot ok"></i>Completed · +${money(m.reward)}</span>`
      : `<span class="muted"><small>Reward: ${money(m.reward)}</small></span>`;
    return `<div class="achievement-card${done ? ' unlocked' : ''}">
      <div class="achievement-top">
        <b>${icon('trophy')} ${escapeHtml(m.name)}</b>
        ${badge}
      </div>
      <small class="muted">${escapeHtml(m.desc)}</small>
    </div>`;
  }).join('');

  const count = completed.length;
  $('company-achievements').innerHTML = `<h2>Milestones & Trophies</h2>
    <p class="muted">${count} of ${MILESTONES.length} milestones achieved &middot; One-time cash grants awarded directly to company funds.</p>
    <div class="achievements-grid">${cards}</div>`;
}

function renderPage() {
  // If the remembered building is gone (or nothing is chosen yet), show the first one you own.
  if (selected === null || !state.plots[selected] || !state.plots[selected].building) {
    const first = state.plots.findIndex(p => p.building);
    selected = first >= 0 ? first : null;
  }
  renderCompanyProfile();
  renderBusinessHealth();
  renderCustomerContracts();
  renderPropertySales();
  renderList();
  renderDetail();
  renderDeliveries();
  renderPerks();
  renderAchievements();
}

// ---- Deliveries: contracts, trucks and market orders ----

const DELIVERY_GROUPS = [['pending', 'Pending', 'Waiting for a truck and a driver.'], ['active', 'Active', 'On the road, or a market order on its way.'],
  ['completed', 'Completed', 'Delivered.'], ['failed', 'Failed', 'Did not arrive. Goods went back to the supplier where they could.']];

function deliveryRow(d) {
  const contract = d.kind === 'contract';
  const from = contract ? buildingName(d.supplier) : d.source;
  const amount = d.status === 'completed' && d.delivered < d.qty ? `${d.delivered} of ${d.qty}` : d.qty;
  const when = d.status === 'pending' ? `Waiting for a truck. Deadline: day ${d.deadline}`
    : d.status === 'active' ? `${contract ? 'On the road' : 'On its way'}. Arrives day ${d.arriveDay}`
    : d.status === 'completed' ? `Delivered on day ${d.endedDay}` : `Failed on day ${d.endedDay}`;
  const money = contract ? `Delivery price ${price2(d.fee)}${d.status === 'completed' ? `, goods ${price2(d.delivered * d.unitPrice)}` : ''}${d.fuel && d.status !== 'pending' ? `, fuel ${price2(d.fuel)}` : ''}`
    : `Paid ${price2(d.paid)}`;
  const action = d.status === 'pending' && contract ? `<button class="small" data-cancel-delivery="${d.id}">Cancel</button>` : '';
  return `<div class="del-row">
    <span class="del-main"><b>${amount} ${itemName(d.item)} <span class="pill ${contract ? 'contract' : 'market'}">${contract ? 'Contract' : 'Market order'}</span></b>
      <small>${from} → ${buildingName(d.destination)}</small></span>
    <span class="del-mid"><small>${when}</small><small>${d.reason || money}</small></span>
    <span class="del-side">${action}</span></div>`;
}

// Market orders are many and small, so they are shown as one line per building and arrival (or finish) day.
function marketGroups(list) {
  const groups = new Map();
  list.forEach(d => {
    const key = `${d.destination}|${d.status === 'active' ? d.arriveDay : d.endedDay}`;
    if (!groups.has(key)) groups.set(key, { first: d, orders: [] });
    groups.get(key).orders.push(d);
  });
  return [...groups.values()];
}

function marketRow(g) {
  const first = g.first, status = first.status, items = {};
  g.orders.forEach(d => { items[d.item] = (items[d.item] || 0) + (status === 'completed' ? d.delivered : d.qty); });
  const total = Object.values(items).reduce((a, b) => a + b, 0);
  const paid = round2(g.orders.reduce((sum, d) => sum + d.paid, 0));
  const when = status === 'active' ? `On its way. Arrives day ${first.arriveDay}` : status === 'completed' ? `Delivered on day ${first.endedDay}` : `Failed on day ${first.endedDay}`;
  const note = status === 'failed' ? first.reason : `Paid ${price2(paid)}${g.orders.length > 1 ? ` in ${g.orders.length} orders` : ''}`;
  return `<div class="del-row">
    <span class="del-main"><b>${total} items <span class="pill market">Market order</span></b><small>${itemList(items)} → ${buildingName(first.destination)}</small></span>
    <span class="del-mid"><small>${when}</small><small>${note}</small></span><span class="del-side"></span></div>`;
}

// What the contract form can offer right now. Picks sensible defaults and drops choices that are no longer valid.
function contractChoices() {
  const suppliers = state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => plot.building && canSupply(plot) && Object.values(plot.inv).some(n => n > 0));
  if (!suppliers.some(s => s.i === contractForm.supplier)) contractForm = { supplier: suppliers.length ? suppliers[0].i : null, item: null, destination: null, qty: null, fee: null, days: null };
  const items = contractForm.supplier === null ? [] : Object.keys(ITEMS).filter(item => (state.plots[contractForm.supplier].inv[item] || 0) > 0);
  if (!items.includes(contractForm.item)) contractForm.item = items[0] || null;
  const destinations = contractForm.item === null ? [] : state.plots.map((plot, i) => ({ plot, i }))
    .filter(({ plot, i }) => plot.building && i !== contractForm.supplier && accepts(plot, contractForm.item));
  if (!destinations.some(d => d.i === contractForm.destination)) {
    const roomy = destinations.find(d => freeSpace(d.i) > 0);              // prefer a destination that can actually take goods
    contractForm.destination = roomy ? roomy.i : destinations.length ? destinations[0].i : null;
  }

  let plan = null, qty = contractForm.qty;
  if (contractForm.supplier !== null && contractForm.item !== null && contractForm.destination !== null) {
    if (qty === null) {                                                    // default: as much as the truck, the stock and the destination allow
      const have = state.plots[contractForm.supplier].inv[contractForm.item] || 0;
      const load = Math.max(TRUCK_LOAD, ...state.plots.filter(p => p.building === 'depot').map(p => truckLoadAt(p.level)));
      qty = Math.max(1, Math.min(have, Math.max(0, freeSpace(contractForm.destination)), load));
    }
    plan = contractPlan(contractForm.supplier, contractForm.destination, contractForm.item, qty);
  }
  const fee = contractForm.fee !== null ? contractForm.fee : plan && plan.ok ? plan.suggested : 0;
  const days = contractForm.days !== null ? contractForm.days : plan && plan.ok ? Math.min(MAX_CONTRACT_DAYS, plan.trip + 2) : 3;
  return { suppliers, items, destinations, plan, qty, fee, days };
}

function contractFormHtml() {
  const c = contractChoices();
  if (!c.suppliers.length) {
    return `<div class="empty-state">${icon('box')}<b>Nothing to send yet</b>A contract moves stock that one of your buildings already holds. Goods that are on a truck or on their way cannot be sent again.</div>`;
  }
  const opt = (value, label, on) => `<option value="${value}" ${on ? 'selected' : ''}>${label}</option>`;
  const supplierOptions = c.suppliers.map(s => opt(s.i, `${BUILDINGS[s.plot.building].name} (${plotLabel(s.i)})`, s.i === contractForm.supplier)).join('');
  const itemOptions = c.items.map(item => opt(item, `${ITEMS[item].name} (${state.plots[contractForm.supplier].inv[item]} in stock)`, item === contractForm.item)).join('');
  const destOptions = c.destinations.map(d => opt(d.i, `${BUILDINGS[d.plot.building].name} (${plotLabel(d.i)}), room for ${Math.max(0, freeSpace(d.i))}`, d.i === contractForm.destination)).join('');
  const p = c.plan;
  const summary = !p ? '<div class="notice">No building can use this item.</div>'
    : !p.ok ? `<div class="notice bad">${p.message}</div>`
    : `<div class="notice">${buildingName(p.depot)} takes it. ${p.distance} tiles: the trip takes ${p.trip} day${p.trip === 1 ? '' : 's'}, fuel costs about ${money(p.fuel)}, and a truck carries up to ${p.load}.
        The destination pays the depot the delivery price, and pays the supplier ${price2(sellPrice(contractForm.item))} an item when the goods arrive. Suggested delivery price: ${price2(p.suggested)}.</div>`;
  return `<div class="contract-form">
      <div class="field"><label>From</label><select id="cf-supplier">${supplierOptions}</select></div>
      <div class="field"><label>Item</label><select id="cf-item">${itemOptions}</select></div>
      <div class="field"><label>To</label><select id="cf-dest">${destOptions || '<option value="">Nowhere can use this</option>'}</select></div>
      <div class="field"><label>Quantity</label><input id="cf-qty" type="number" min="1" step="1" value="${c.qty}"></div>
      <div class="field"><label>Delivery price</label><input id="cf-fee" type="number" min="0" step="0.5" value="${Number(c.fee).toFixed(2)}"></div>
      <div class="field"><label>Delivery time (days)</label><input id="cf-days" type="number" min="1" max="${MAX_CONTRACT_DAYS}" step="1" value="${c.days}"></div>
    </div>${summary}
    <button class="primary" id="create-contract" ${p && p.ok ? '' : 'disabled'}>Create contract</button>`;
}

function renderDeliveries() {
  const all = state.deliveries;
  const count = s => all.filter(d => d.status === s).length;
  const groups = DELIVERY_GROUPS.map(([status, label, hint]) => {
    const list = all.filter(d => d.status === status).sort((a, b) => b.id - a.id);
    const ended = status === 'completed' || status === 'failed';
    const allContracts = list.filter(d => d.kind === 'contract'), contracts = allContracts.slice(0, ended ? 8 : 40);
    const allGroups = marketGroups(list.filter(d => d.kind === 'market')), groups = allGroups.slice(0, ended ? 3 : 8);
    const shown = contracts.map(deliveryRow).concat(groups.map(marketRow));
    const hidden = (allContracts.length - contracts.length) + (allGroups.length - groups.length);
    return `<div class="del-group"><h3>${label} <span class="muted">(${list.length})</span></h3>
      ${shown.join('') || `<p class="muted small-note" style="margin-top:0">${status === 'pending' ? 'No contracts are waiting.' : status === 'active' ? 'Nothing is on the road.' : status === 'completed' ? 'No deliveries have arrived yet.' : 'No deliveries have failed.'}</p>`}
      ${hidden > 0 ? `<p class="muted small-note">…and ${hidden} more.</p>` : `<p class="muted small-note del-hint">${hint}</p>`}</div>`;
  }).join('');
  $('deliveries').innerHTML = `<h2>Deliveries</h2>
    <p class="muted">Goods move between your buildings on trucks from a Transport Depot. Market orders arrive by themselves a day after you order them. Stock that is on its way cannot be sold or used until it arrives.</p>
    <div class="del-counts">${DELIVERY_GROUPS.map(([s, label]) => `<span>${label} <b>${count(s)}</b></span>`).join('')}</div>
    <h3>New delivery contract</h3>
    ${state.plots.some(p => p.building === 'depot') ? '' : `<div class="notice">You need a Transport Depot first. Build one on the <a href="${pageLink('city')}">City page</a> and hire drivers.</div>`}
    ${contractFormHtml()}
    <div class="del-lists">${groups}</div>`;
}

// ---- Clicks ----

onAction($('company-profile'), 'click', e => {
  if (!e.target.closest('#edit-company')) return;
  showCompanyIdentityEditor(false);
});

$('company-list').addEventListener('click', e => {
  const button = e.target.closest('[data-select]');
  if (!button) return;
  choose(Number(button.dataset.select));
  render(true);
});

onAction($('company-detail'), 'click', e => {
  const button = e.target.closest('button');
  if (!button || selected === null) return;
  const plot = state.plots[selected], d = button.dataset;
  if (d.tab) chooseTab(d.tab);
  else if (d.alert) runAlert(d.alert, selected);
  else if (button.id === 'hire-worker') gameService.hireWorker(selected, hireRole || BUILDINGS[plot.building].roles[0].role);
  else if (d.fire !== undefined) gameService.fireWorker(selected, Number(d.fire));
  else if (d.act === 'toggle-closed') { const r = gameService.setBuildingClosed(selected, !plot.closed); if (!r.ok) notify(r.reason); }
  else if (d.act === 'sell-building' || d.act === 'sell-property') { reviewPropertySale(selected, d.act === 'sell-property'); return; }
  else if (d.act === 'sell-all') gameService.sellAllInventory(selected);
  else if (d.act === 'upgrade') gameService.upgradeBuilding(selected);
  else if (d.act === 'send-from') { sendFrom(selected); return; }
  else if (d.act === 'order-to') { orderTo(selected); return; }
  render(true);
});

onAction($('company-detail'), 'change', e => {
  if (e.target.id === 'hire-role') { hireRole = e.target.value; render(true); }
});

// Picks a supplier, item and destination for the contract form, then takes the player to it.
function prefillContract(supplier, destination) {
  contractForm = { supplier, item: null, destination, qty: null, fee: null, days: null };
  render(true);
  const box = $('deliveries');
  if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// "Send stock" from a building: it becomes the supplier.
function sendFrom(i) {
  prefillContract(i, null);
}

// "Order a delivery" to a building: find another building holding something it can use.
function orderTo(i) {
  const dest = state.plots[i];
  const source = state.plots.findIndex((p, k) => k !== i && p.building && canSupply(p) && Object.keys(ITEMS).some(item => (p.inv[item] || 0) > 0 && accepts(dest, item)));
  if (source < 0) { notify('No other building has stock this one can use.'); render(true); return; }
  const item = Object.keys(ITEMS).find(it => (state.plots[source].inv[it] || 0) > 0 && accepts(dest, it));
  contractForm = { supplier: source, item, destination: i, qty: null, fee: null, days: null };
  render(true);
  const box = $('deliveries');
  if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onAction($('deliveries'), 'click', e => {
  const cancel = e.target.closest('[data-cancel-delivery]');
  if (cancel) gameService.cancelDelivery(Number(cancel.dataset.cancelDelivery));
  else if (e.target.id === 'create-contract') {
    const c = contractChoices();
    const result = gameService.createDelivery(contractForm.supplier, contractForm.destination, contractForm.item, c.qty, c.fee, c.days);
    if (result.ok) contractForm = { supplier: contractForm.supplier, item: null, destination: contractForm.destination, qty: null, fee: null, days: null };
  } else return;
  render(true);
});

// The form remembers what was typed, so a redraw never loses it.
$('deliveries').addEventListener('input', e => {
  const value = e.target.value === '' ? null : Number(e.target.value);
  if (e.target.id === 'cf-qty') contractForm.qty = value;
  if (e.target.id === 'cf-fee') contractForm.fee = value;
  if (e.target.id === 'cf-days') contractForm.days = value;
});

$('deliveries').addEventListener('change', e => {
  if (e.target.id === 'cf-supplier') contractForm = { supplier: Number(e.target.value), item: null, destination: null, qty: null, fee: null, days: null };
  else if (e.target.id === 'cf-item') contractForm = { supplier: contractForm.supplier, item: e.target.value, destination: null, qty: null, fee: null, days: null };
  else if (e.target.id === 'cf-dest') contractForm = { supplier: contractForm.supplier, item: contractForm.item, destination: Number(e.target.value), qty: null, fee: null, days: null };
  else return;
  render(true);
});

onAction($('company-perks'), 'click', e => {
  const btn = e.target.closest('[data-unlock-perk]');
  if (!btn) return;
  gameService.unlockPerk(btn.dataset.unlockPerk);
  render(true);
});


function renderBusinessHealth() {
  const health = businessHealth();
  $('business-health').innerHTML = '<h2>Business health</h2><p class="muted">Problems and suggested actions across your company. Losses refer to the last completed day.</p>' +
    (state.cash < 0 ? '<div class="notice">Cash is negative. Close losing businesses, sell property, or review <a href="bank.html">loan restructuring</a>.</div>' : '') +
    (health.map(h => '<div class="perk-card"><b>' + buildingName(h.plot) + '</b>' + h.issues.map(issue => '<p>' + escapeHtml(issue.text) + ' <a href="' + pageLink(issue.page, { plot: h.plot, tab: issue.tab }) + '">Review</a></p>').join('') + '</div>').join('') || '<p>No current building problems detected.</p>') +
    '<p class="muted small-note">Closing retains workers and inventory, pauses wages and operations, and reduces upkeep to 25%. Property tax continues.</p>';
}
function renderCustomerContracts() {
  const c = state.customers;
  const choices = state.plots.flatMap((p, i) => p.owned && LISTERS.includes(p.building) && isStaffed(p) ? [i] : []);
  const rows = c.orders.map(o => {
    let action = '';
    if (o.status === 'offered' && o.offerUntil >= state.day) action = '<label>Supply from <select id="customer-source-' + o.id + '">' + choices.map(i => '<option value="' + i + '">' + buildingName(i) + '</option>').join('') + '</select></label> <button data-accept-customer="' + o.id + '" ' + (choices.length ? '' : 'disabled') + '>Accept</button>';
    if (o.status === 'active') action = '<button data-cancel-customer="' + o.id + '">Cancel (-5 reputation)</button>';
    return '<div class="perk-card"><b>' + o.customer + ': ' + o.qty + ' ' + itemName(o.item) + '</b><p>' + o.status + ' &middot; ' + o.delivered + '/' + o.qty + ' supplied &middot; ' + price2(o.unitPrice) + '/unit + ' + money(o.bonus) + ' completion bonus</p><p class="muted">' + (o.status === 'offered' ? 'Accept by day ' + o.offerUntil + '; supply within ' + o.duration + ' days.' : 'Deadline: day ' + o.deadline + (o.plot !== null ? ' &middot; ' + buildingName(o.plot) : '')) + '</p>' + action + '</div>';
  }).join('');
  $('customer-contracts').innerHTML = '<h2>Customer contracts</h2><p>Reputation: ' + c.reputation + '/100</p><p class="muted">Assigned buildings automatically supply available stock each day before retail and market sales. Units supplied are paid immediately. Completion earns a bonus and +5 reputation; failure loses 10 reputation. Offers refresh every five days.</p>' + (rows || '<p>Build a farm, factory, or warehouse to receive offers on the next day.</p>');
}
function renderPropertySales() {
  const rows = state.plots.flatMap((p, i) => p.owned && !p.building ? ['<div class="row"><span>Empty land: ' + plotLabel(i) + '</span><button data-sell-land="' + i + '">Review sale</button></div>'] : []);
  $('property-sales').innerHTML = '<h2>Land sales</h2>' + (rows.join('') || '<p class="muted">No empty owned plots. Building sales are available in each building overview.</p>');
}
onAction($('property-sales'), 'click', e => { const b = e.target.closest('[data-sell-land]'); if (b) reviewPropertySale(Number(b.dataset.sellLand)); });
onAction($('customer-contracts'), 'click', e => {
  const b = e.target.closest('button'); if (!b) return;
  let r;
  if (b.dataset.acceptCustomer) { const id = Number(b.dataset.acceptCustomer); r = gameService.acceptCustomerOrder(id, Number($('customer-source-' + id).value)); }
  else if (b.dataset.cancelCustomer) r = gameService.cancelCustomerOrder(Number(b.dataset.cancelCustomer));
  if (r && !r.ok) notify(r.reason); render(true);
});
readStart();
startPage('company', renderPage);
