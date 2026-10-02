'use strict';

// =====================================================================
// MARKET PAGE: supplier prices, buying and selling stock, listing it at your
// own price, and setting the prices your shops, cafes and hotels charge.
// =====================================================================

let tradePlot = null;                                            // the building shown in "Sell and buy stock"
let listForm = { plot: null, item: null, qty: 10, price: null }; // the "List inventory for sale" form

// Links from other pages say which building (and which item to list), e.g. market.html#plot=3&item=wheat&list=1.
function readStart() {
  const h = hashParams();
  tradePlot = h.plot !== undefined && h.plot !== '' ? Number(h.plot) : uiGet('market-plot', null);
  if (h.list && h.item) listForm = { plot: tradePlot, item: h.item, qty: 10, price: null };
}

// ---- Supplier prices ----

function renderSuppliers() {
  const groups = Object.keys(ITEMS).map(item => {
    const rows = state.market.filter(l => l.item === item).map(l => {
      const trend = l.price > l.prev ? '<i class="up">▲</i>' : l.price < l.prev ? '<i class="down">▼</i>' : '';
      return `<div class="listing"><span>${l.supplier}</span><span>${price2(l.price)} ${trend}</span><span class="muted">${l.stock} left</span></div>`;
    }).join('');
    const mine = state.listings.filter(l => l.item === item).map(l =>
      `<div class="listing"><span>Yours: ${buildingName(l.plot)}</span><span>${price2(l.price)}</span><span class="muted">${l.qty} left</span></div>`).join('');
    const players = (state.rivalListings || []).filter(l => l.item === item && l.avail > 0).sort((a, b) => a.price - b.price).map(l =>
      `<div class="listing"><span>${escapeHtml(l.owner)}</span><span>${price2(l.price)}</span><span class="muted">${Math.min(l.qty, l.avail)} left</span></div>`).join('');
    return `<div class="mk-item"><div class="row"><b>${ITEMS[item].name}</b><span class="muted">market pays ${price2(sellPrice(item))}</span></div>${rows}${players}${mine}</div>`;
  }).join('');
  $('suppliers').innerHTML = `<h2>Supplier prices</h2><p class="muted">AI suppliers${state.online ? ' and other players' : ''}. Prices change every day. Your listings appear too, and your own shops and factories buy the cheapest offer.</p>${groups}`;
}

// ---- Sell and buy stock (farms, factories and warehouses) ----

const tradeChoices = () => state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => LISTERS.includes(plot.building));

function renderTrade() {
  const choices = tradeChoices();
  if (!choices.length) {
    $('trade').innerHTML = `<h2>Sell and buy stock</h2><div class="empty-state">${icon('box')}<b>Nothing to trade yet</b>Build a farm, factory or warehouse on the <a href="${pageLink('city')}">City page</a>.</div>`;
    return;
  }
  if (!choices.some(({ i }) => i === tradePlot)) tradePlot = choices[0].i;
  const i = tradePlot, plot = state.plots[i], canBuy = plot.building === 'warehouse';
  const options = choices.map(c =>
    `<option value="${c.i}" ${c.i === i ? 'selected' : ''}>${BUILDINGS[c.plot.building].name} (${plotLabel(c.i)})</option>`).join('');
  const rows = Object.keys(ITEMS).filter(item => canBuy || (plot.inv[item] || 0) > 0).map(item => {
    const have = plot.inv[item] || 0;
    const cheapest = [...state.market.filter(l => l.item === item && l.stock > 0),
      ...(state.rivalListings || []).filter(l => l.item === item && l.avail > 0)].sort((a, b) => a.price - b.price)[0];
    const info = `${have} in stock · market pays ${price2(sellPrice(item))}` + (canBuy ? ` · supplier ${cheapest ? price2(cheapest.price) : 'sold out'}` : '');
    return `<div class="item-row"><span>${ITEMS[item].name}<small>${info}</small></span><span class="btns">
      ${canBuy ? `<button class="small" data-buy="${item}" data-qty="10" ${cheapest ? '' : 'disabled'}>Buy 10</button>` : ''}
      <button class="small" data-sell="${item}" data-qty="10" ${have ? '' : 'disabled'}>Sell 10</button>
      <button class="small" data-sell="${item}" data-qty="all" ${have ? '' : 'disabled'}>Sell all</button>
      <button class="small" data-list="${item}" ${have ? '' : 'disabled'}>List…</button></span></div>`;
  }).join('');
  const mine = state.listings.filter(l => l.plot === i).map(l =>
    `<div class="item-row"><span>${ITEMS[l.item].name}<small>${Math.min(l.qty, plot.inv[l.item] || 0)} for sale at ${price2(l.price)}</small></span>
      <button class="small" data-cancel="${l.id}">Cancel</button></div>`).join('');
  $('trade').innerHTML = `<h2>Sell and buy stock</h2>
    <div class="field"><label>Building</label><select id="tr-plot">${options}</select></div>
    ${!isStaffed(plot) ? '<div class="notice">Hire a worker first. Trading needs staff.</div>' : ''}
    ${incomingTo(i) > 0 ? `<div class="notice">${incomingTo(i)} items are on their way to this building.</div>` : ''}
    ${rows || `<div class="empty-state">${icon('box')}<b>Nothing to sell yet</b>Goods appear here once they are made.</div>`}
    ${mine ? `<h3>For sale</h3>${mine}` : ''}
    <p class="muted small-note">"Sell" dumps stock to the market at a discount. "List…" lets you set your own price below. "Buy" places an order that arrives tomorrow.</p>`;
}

// ---- Prices at shops, cafes and hotels ----

function renderShopPrices() {
  const shops = state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => RETAIL[plot.building]);
  if (!shops.length) {
    $('shop-prices').innerHTML = `<h2>Your shop prices</h2><div class="empty-state">${icon('box')}<b>No shops, cafes or hotels yet</b>Their prices are set here once you build one.</div>`;
    return;
  }
  const cards = shops.map(({ plot, i }) => {
    const rows = retailKeys(plot.building).map(key => {
      const label = key === 'room' ? 'Room (per guest)' : ITEMS[key].name;
      return `<div class="item-row"><span>${label}<small>${Math.round(demandFactor(plot, key) * 100)}% of the usual customers</small></span>
        <input class="price-input" type="number" min="0.1" step="0.1" data-price-plot="${i}" data-price="${key}" value="${salePrice(plot, key).toFixed(2)}"></div>`;
    }).join('');
    return `<h3>${BUILDINGS[plot.building].name} (${plotLabel(i)})</h3>${rows}`;
  }).join('');
  $('shop-prices').innerHTML = `<h2>Your shop prices</h2>${cards}
    <p class="muted small-note">A higher price earns more per sale but brings fewer customers. Stock is bought from the market for you.</p>`;
}

// ---- Listing stock at your own price ----

// The buildings and items the list form can offer right now.
function listChoices() {
  const plots = tradeChoices();
  if (!plots.length) return { plots, items: [] };
  if (!plots.some(({ i }) => i === listForm.plot)) listForm.plot = plots[0].i;
  const inv = state.plots[listForm.plot].inv;
  const items = Object.keys(ITEMS).filter(item => (inv[item] || 0) > 0);
  if (!items.includes(listForm.item)) { listForm.item = items[0] || null; listForm.price = null; }
  return { plots, items };
}

function renderListForm() {
  const { plots, items } = listChoices();
  if (!plots.length) {
    $('list-form').innerHTML = `<h2>List inventory for sale</h2><div class="empty-state">${icon('box')}<b>Nothing to list yet</b>Build a farm, factory or warehouse first.</div>`;
    return;
  }
  const have = listForm.item ? state.plots[listForm.plot].inv[listForm.item] : 0;
  if (listForm.item && !(listForm.price > 0)) listForm.price = round2(marketPrice(listForm.item));
  const plotOptions = plots.map(({ plot, i }) =>
    `<option value="${i}" ${i === listForm.plot ? 'selected' : ''}>${BUILDINGS[plot.building].name} (${plotLabel(i)})</option>`).join('');
  const itemOptions = items.map(item =>
    `<option value="${item}" ${item === listForm.item ? 'selected' : ''}>${ITEMS[item].name} (${state.plots[listForm.plot].inv[item]} in stock)</option>`).join('');
  $('list-form').innerHTML = `<h2>List inventory for sale</h2>
    <div class="field"><label>Building</label><select id="lf-plot">${plotOptions}</select></div>
    ${items.length ? `
      <div class="field"><label>Item</label><select id="lf-item">${itemOptions}</select></div>
      <div class="field"><label>Quantity</label><input id="lf-qty" type="number" min="1" max="${have}" step="1" value="${Math.min(listForm.qty, have) || 1}"></div>
      <div class="field"><label>Price each</label><input id="lf-price" type="number" min="0.05" step="0.05" value="${listForm.price.toFixed(2)}"></div>
      <p class="muted" style="font-size:12px;margin-bottom:10px">Market price ${price2(marketPrice(listForm.item))}. Buyers avoid prices far above it. Goods stay in the building until they sell.</p>
      <button class="primary" id="list-goods">List for sale</button>`
      : `<div class="empty-state"><b>This building has no stock</b>Produce or buy goods first.</div>`}`;
}

function renderMyListings() {
  const rows = state.listings.map(l => {
    const have = Math.min(l.qty, state.plots[l.plot].inv[l.item] || 0);
    return `<div class="listing-row"><span>${buildingName(l.plot)}<small>${have} ${itemName(l.item)} at ${price2(l.price)} (market ${price2(marketPrice(l.item))})</small></span>
      <button class="small" data-cancel="${l.id}">Cancel</button></div>`;
  }).join('');
  $('my-listings').innerHTML = `<h2>Your listings</h2>${rows || '<div class="empty-state"><b>Nothing listed</b>Listed goods appear here.</div>'}`;
}

function renderPage() {
  renderSuppliers();
  renderTrade();
  renderShopPrices();
  renderListForm();
  renderMyListings();
}

// ---- Clicks ----

onAction($('trade'), 'click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  const d = button.dataset, qty = d.qty === 'all' ? 'all' : Number(d.qty);
  if (d.buy) gameService.buyInventory(tradePlot, d.buy, qty);
  else if (d.sell) gameService.sellInventory(tradePlot, d.sell, qty);
  else if (d.list) {                                             // fill in the list form and take the player to it
    listForm = { plot: tradePlot, item: d.list, qty: 10, price: null };
    render(true);
    const form = $('list-form');
    if (form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  else if (d.cancel) gameService.cancelListing(Number(d.cancel));
  render(true);
});

$('trade').addEventListener('change', e => {
  if (e.target.id !== 'tr-plot') return;
  tradePlot = Number(e.target.value);
  uiSet('market-plot', tradePlot);
  render(true);
});

onAction($('shop-prices'), 'change', e => {
  const d = e.target.dataset;
  if (d.price === undefined) return;
  gameService.setRetailPrice(Number(d.pricePlot), d.price, Number(e.target.value));
  render(true);
});

// The list form remembers what was typed, so a redraw never loses it.
$('list-form').addEventListener('input', e => {
  if (e.target.id === 'lf-qty') listForm.qty = Number(e.target.value);
  if (e.target.id === 'lf-price') listForm.price = Number(e.target.value);
});

$('list-form').addEventListener('change', e => {
  if (e.target.id === 'lf-plot') listForm = { plot: Number(e.target.value), item: null, qty: 10, price: null };
  else if (e.target.id === 'lf-item') listForm = { plot: listForm.plot, item: e.target.value, qty: listForm.qty, price: null };
  render(true);
});

onAction($('list-form'), 'click', e => {
  if (e.target.id !== 'list-goods') return;
  if (gameService.createListing(listForm.plot, listForm.item, listForm.qty, listForm.price)) listForm.price = null;
  render(true);
});

onAction($('my-listings'), 'click', e => {
  const button = e.target.closest('[data-cancel]');
  if (!button) return;
  gameService.cancelListing(Number(button.dataset.cancel));
  render(true);
});

readStart();
startPage('market', renderPage);
if (hashParams().list) {                                         // arrived from a "List on market" button
  const form = $('list-form');
  if (form.scrollIntoView) form.scrollIntoView({ block: 'start' });
}
