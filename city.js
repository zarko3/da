'use strict';

// =====================================================================
// CITY PAGE: the map, buying land, and construction. Running a finished
// building happens on the Company page; here it only gets a short summary.
// =====================================================================

let currentCity = Number(uiGet('city-current', 0));
if (!(currentCity >= 0 && currentCity < WORLD_CITY_COUNT)) currentCity = 0;
let selected = uiGet('city-selected', null);
let expandedBuild = null;
let multiSelectMode = false;
if (!isValidPlotId(selected) || cityOfPlot(selected) !== currentCity) selected = null;

const mapController = new WorldMapController({ width: CITY_WIDTH, height: CITY_HEIGHT });
const mapCells = new Map();
const viewport = $('map-viewport');
const mapElement = $('map');
const minimap = $('map-minimap');
let pointerStart = null;
let lastPointer = null;
let dragged = false;

function localIdOf(globalId) { return globalId - currentCity * CITY_PLOT_COUNT; }
function globalIdOf(localId) { return currentCity * CITY_PLOT_COUNT + localId; }
function selectedIds() { return mapController.getSelection().map(globalIdOf); }

function rememberSelection() {
  const ids = selectedIds();
  selected = ids.length ? globalIdOf(mapController.primaryId) : null;
  uiSet('city-selected', selected);
  uiSet('city-current', currentCity);
}

function selectPlot(globalId, additive = false) {
  const localId = localIdOf(globalId);
  if (additive || multiSelectMode) mapController.toggleSelection(localId);
  else mapController.selectOne(localId);
  rememberSelection();
}

function travelToCity(cityId) {
  if (!Number.isInteger(cityId) || cityId < 0 || cityId >= WORLD_CITY_COUNT) return;
  currentCity = cityId;
  uiSet('city-current', currentCity);
  $('city-select').value = String(currentCity);
  mapController.clearSelection();
  selected = null;
  uiSet('city-selected', null);
  mapCells.forEach(cell => cell.remove());
  mapCells.clear();
  mapCache.clear();
  mapController.setCamera(0, 0, 1.25);
  mapController.centerOn(7, 7);
  render(true);
}

function showWorldOverview() {
  const cards = gameService.getWorldOverview().map(city => {
    const current = city.id === currentCity;
    const cheapest = city.cheapestLand === null ? 'Sold out' : `Land from ${money(city.cheapestLand)}`;
    return `<article class="world-city-card${current ? ' current' : ''}">
      <div class="world-city-name"><b>${city.id + 1}. ${city.name}</b>${current ? '<span class="pill ok">You are here</span>' : ''}</div>
      <span><em>Available</em><b class="num">${city.available}</b></span>
      <span><em>Your land</em><b class="num">${city.owned}</b></span>
      <span><em>Buildings</em><b class="num">${city.buildings}</b></span>
      <span><em>Average</em><b class="num">${money(city.averageLandPrice)}</b></span>
      <span class="world-city-price">${cheapest}</span>
      <button class="small" data-travel-city="${city.id}" ${current ? 'disabled' : ''}>${current ? 'Current city' : 'Travel'}</button>
    </article>`;
  }).join('');
  openModal('World overview', `<p class="muted world-intro">Twenty cities share one economy. Travel is instant and free.</p><div class="world-grid">${cards}</div>`, [{ label: 'Close' }]);
}

// ---- The map ----

function buildMap() {
  $('city-select').innerHTML = CITIES.map((name, id) => `<option value="${id}" ${id === currentCity ? 'selected' : ''}>${id + 1}. ${name}</option>`).join('');
  mapElement.style.width = `${CITY_WIDTH * mapController.tileSize}px`;
  mapElement.style.height = `${CITY_HEIGHT * mapController.tileSize}px`;
  if (selected !== null) mapController.selectOne(localIdOf(selected));
  resizeMap();
  mapController.centerOn(7, 7);
  renderMap();
}

function cellLook(i) {
  const plot = state.plots[i], d = districtOf(i);
  const localId = localIdOf(i);
  const chosen = mapController.selection.has(localId);
  const primary = chosen && mapController.primaryId === localId;
  const base = `cell d-${d}${plot.owned ? ' company-owned' : ''}${chosen ? ' selected' : ''}${primary ? ' primary-selected' : ''}`;
  if (plot.building) {
    const status = plotStatus(plot);
    return {
      cls: `${base} b-${plot.building}`,
      html: `${icon(plot.building)}<span class="dot ${status}"></span><span class="lv">L${plot.level}</span>`,
      label: `${BUILDINGS[plot.building].name}, level ${plot.level}, ${STATUS[status]}`,
    };
  }
  if (plot.owned) return { cls: `${base} empty`, html: '<span class="plus">+</span>', label: 'Your empty plot' };
  return { cls: `${base} forsale`, html: `<span class="price">${shortMoney(plotPrice(i))}</span>`, label: `Plot for sale, ${DISTRICTS[d].name}` };
}

const mapCache = new Map();
function renderMap() {
  mapController.setViewportSize(viewport.clientWidth, viewport.clientHeight);
  const range = mapController.visibleRange();
  const visible = new Set();
  for (let y = range.minY; y <= range.maxY; y++) for (let x = range.minX; x <= range.maxX; x++) {
    const localId = y * CITY_WIDTH + x, i = globalIdOf(localId);
    visible.add(localId);
    let cell = mapCells.get(localId);
    if (!cell) {
      cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.plot = i;
      cell.setAttribute('role', 'gridcell');
      cell.style.left = `${x * mapController.tileSize + 1}px`;
      cell.style.top = `${y * mapController.tileSize + 1}px`;
      mapElement.appendChild(cell);
      mapCells.set(localId, cell);
    }
    const look = cellLook(i), key = look.cls + look.html;
    if (mapCache.get(localId) === key) continue;
    mapCache.set(localId, key);
    cell.className = look.cls;
    cell.innerHTML = look.html;
    cell.setAttribute('aria-label', look.label);
  }
  [...mapCells.entries()].forEach(([localId, cell]) => {
    if (visible.has(localId)) return;
    cell.remove();
    mapCells.delete(localId);
    mapCache.delete(localId);
  });
  const { x, y, zoom } = mapController.camera;
  mapElement.style.transform = `translate(${-x * zoom}px, ${-y * zoom}px) scale(${zoom})`;
  $('map-zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  const count = mapController.selection.size;
  $('map-selection').textContent = count ? `${count} plot${count === 1 ? '' : 's'} selected` : `${CITIES[currentCity]} · no plots selected`;
  drawMinimap();
}

function resizeMap() {
  const rect = viewport.getBoundingClientRect();
  mapController.setViewportSize(rect.width || 720, rect.height || 560);
  renderMap();
}

function drawMinimap() {
  const context = minimap.getContext('2d');
  if (!context) return;
  const width = minimap.width, height = minimap.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#eef0f2';
  context.fillRect(0, 0, width, height);
  const sx = width / CITY_WIDTH, sy = height / CITY_HEIGHT;
  for (let localId = 0; localId < CITY_PLOT_COUNT; localId++) {
    const plot = state.plots[globalIdOf(localId)];
    if (!plot.owned) continue;
    context.fillStyle = plot.building ? '#1c2129' : '#7d9a58';
    context.fillRect(localId % CITY_WIDTH * sx, Math.floor(localId / CITY_WIDTH) * sy, Math.max(1, sx), Math.max(1, sy));
  }
  context.strokeStyle = '#8a70b8';
  context.lineWidth = 2;
  context.strokeRect(6 * sx, 6 * sy, 3 * sx, 3 * sy);
  const view = mapController.minimapViewport();
  context.strokeStyle = '#b83232';
  context.lineWidth = 2;
  context.strokeRect(view.x * width, view.y * height, view.width * width, view.height * height);
}

function renderLegend() {
  const swatch = (bg, strip, text) => `<span><i class="sw" style="--sw:${bg};--sw-strip:${strip}"></i>${text}</span>`;
  $('legend').innerHTML =
    Object.entries(DISTRICTS).map(([key, d]) => swatch(`var(--${key})`, `var(--${key}-strip)`, `${d.name} from ${shortMoney(d.price)}`)).join('') +
    '<span><i class="dot ok"></i>Running</span><span><i class="dot waiting"></i>Delivery on the way</span><span><i class="dot nostock"></i>Needs attention</span><span><i class="dot nostaff"></i>No workers</span>';
}

// What the hover tooltip says about a plot.
function tooltipFor(i) {
  const plot = state.plots[i], d = DISTRICTS[districtOf(i)];
  if (plot.building) {
    const def = BUILDINGS[plot.building], n = plot.workers.length;
    return { title: `${def.name}, level ${plot.level}`, lines: [
      `${d.name} · plot ${plotLabel(i)}`,
      `${STATUS[plotStatus(plot)]} · ${n}/${slotsOf(plot)} workers`,
      `Today: ${signedWhole(dayProfit(plot.last))}`,
    ] };
  }
  if (plot.owned) return { title: 'Empty plot', lines: [`${d.name} · plot ${plotLabel(i)}`, 'Click to build here'] };
  return { title: `For sale: ${money(plotPrice(i))}`, lines: [`${d.name} · plot ${plotLabel(i)}`, districtPerks(districtOf(i))] };
}

// ---- The side panel: buy land, build, or glance at a finished building ----

// A build option: cost and one line about what it should earn. Full numbers are one click away.
function buildCard(type, i) {
  const def = BUILDINGS[type], cost = buildCost(type), need = cost - state.cash;
  const { crew, est } = bestCrew(type, i);
  const startup = startupCost(type, crew);
  const open = expandedBuild === type;
  const tag = def.tag ? `<span class="tag ${def.tag.kind}">${def.tag.text}</span>` : '';
  const outlook = type === 'depot'
    ? `Costs about ${money(-est.net)} a day to run. It earns the delivery prices you set on contracts between your buildings.`
    : est.net > 0
      ? `Should earn about ${money(est.net)} a day, paid back in ${paybackText(startup, est.net)}.`
      : `Expected to lose about ${money(-est.net)} a day until you trade or upgrade.`;
  return `<div class="build-card">
    <div class="build-top"><span class="badge b-${type}">${icon(type)}</span>
      <span><b>${def.name}${tag}</b><small>${def.desc}</small></span><span class="cost">${money(cost)}</span></div>
    <p class="outlook">${outlook}</p>
    ${open ? `${estimateBlock(est, `Expected per day with ${crew.length} average worker${crew.length === 1 ? '' : 's'}`)}
      <p class="muted small-note">Payback counts ${money(startup - cost)} in hiring fees.</p>` : ''}
    <div class="build-foot">
      <button class="link" data-details="${type}">${open ? 'Hide details' : 'Details'}</button>
      <button class="primary" data-build="${type}" ${need > 0 ? 'disabled' : ''}>${need > 0 ? `Need ${money(need)} more` : 'Build'}</button></div></div>`;
}

function plotPanel(i) {
  const plot = state.plots[i], key = districtOf(i), d = DISTRICTS[key];
  const head = `<div class="insp-head"><span class="badge d-${key} ${plot.owned ? 'empty' : 'forsale'}">${icon('plot')}</span>
    <div><h2>${plot.owned ? 'Empty plot' : 'Plot for sale'}</h2><small>${d.name} · plot ${plotLabel(i)}</small></div></div>`;
  if (plot.owned) {
    return `${head}<p class="muted" style="margin-top:12px">Choose what to build. ${d.name}: ${districtPerks(key)}.</p>
      <div class="build-list">${Object.keys(BUILDINGS).map(type => buildCard(type, i)).join('')}</div>`;
  }
  const price = plotPrice(i), need = price - state.cash;
  return `${head}<div style="margin-top:12px">
    ${row('Price', `<b class="num">${money(price)}</b>`)}
    ${row('Cash after buying', `<span class="num ${state.cash - price < 0 ? 'neg' : ''}">${money(state.cash - price)}</span>`)}
    ${row(d.name, `<span>${districtPerks(key)}</span>`)}</div>
    <p class="notice">Land is priciest in the Town Center and cheapest on the Outskirts. A farm is the cheapest way to start.</p>
    <div class="build-actions"><button class="primary" id="buy-plot" ${need > 0 ? 'disabled' : ''}>${need > 0 ? `Need ${money(need)} more` : `Buy plot for ${money(price)}`}</button></div>`;
}

// A finished building: status, any alert, today's numbers, and links to the pages that run it.
function builtPanel(i) {
  const plot = state.plots[i], def = BUILDINGS[plot.building], status = plotStatus(plot);
  const trades = LISTERS.includes(plot.building) || RETAIL[plot.building];
  return `<div class="insp-head"><span class="badge b-${plot.building}">${icon(plot.building)}</span>
      <div><h2>${def.name}, level ${plot.level}</h2><small>${DISTRICTS[districtOf(i)].name} · plot ${plotLabel(i)}</small></div>
      <span class="status"><i class="dot ${status}"></i>${STATUS[status]}</span></div>
    ${alertBox(alertFor(plot))}
    <p class="muted" style="margin-top:12px">${def.desc}</p>
    ${todaySummary(plot)}
    <div class="actions-row">
      <a class="button primary" href="${pageLink('company', { plot: i })}">Manage building</a>
      ${trades ? `<a class="button" href="${pageLink('market', { plot: i })}">Market</a>` : ''}
    </div>`;
}

function multiPlotPanel(ids) {
  const plots = ids.map(id => state.plots[id]);
  const available = plots.filter(plot => !plot.owned).length;
  const empty = plots.filter(plot => plot.owned && !plot.building).length;
  const built = plots.filter(plot => plot.building).length;
  const districts = [...new Set(ids.map(districtOf))].map(key => DISTRICTS[key].name).join(', ');
  const allAvailable = available === ids.length;
  const allEmpty = empty === ids.length;
  const landTotal = ids.reduce((sum, id) => sum + (!state.plots[id].owned ? plotPrice(id) : 0), 0);
  const landNeed = landTotal - state.cash;
  const buildOptions = allEmpty ? Object.entries(BUILDINGS).map(([type, def]) => {
    const total = buildCost(type) * ids.length;
    return `<button data-bulk-build="${type}" ${state.cash < total ? 'disabled' : ''}>${def.name} · ${money(total)}</button>`;
  }).join('') : '';
  return `<div class="insp-head"><span class="badge d-midtown">${icon('plot')}</span>
      <div><h2>${ids.length} plots selected</h2><small>${CITIES[currentCity]} · ${districts}</small></div></div>
    <div style="margin-top:12px">
      ${row('For sale', `<b class="num">${available}</b>`)}
      ${row('Your empty land', `<b class="num">${empty}</b>`)}
      ${row('Buildings', `<b class="num">${built}</b>`)}
    </div>
    ${allAvailable ? `<div class="notice">Total land price: <b>${money(landTotal)}</b></div>
      <div class="build-actions"><button class="primary" id="buy-plots" ${landNeed > 0 ? 'disabled' : ''}>${landNeed > 0 ? `Need ${money(landNeed)} more` : `Buy all ${ids.length} plots`}</button></div>` : ''}
    ${allEmpty ? `<h3>Build on all selected plots</h3><div class="bulk-builds">${buildOptions}</div>` : ''}
    ${!allAvailable && !allEmpty ? '<p class="notice">Choose only available land to buy together, or only your empty plots to build together.</p>' : ''}
    <div class="actions-row"><button id="clear-selection">Clear selection</button></div>`;
}

function renderInspector() {
  const box = $('inspector');
  const ids = selectedIds();
  if (ids.length > 1) {
    box.innerHTML = multiPlotPanel(ids);
    return;
  }
  if (selected === null) {
    box.innerHTML = `<div class="empty-state">${icon('plot')}<b>No plot selected</b>Click a plot in ${CITIES[currentCity]} to buy land or build. Drag the map to move around.</div>`;
    return;
  }
  box.innerHTML = state.plots[selected].building ? builtPanel(selected) : plotPanel(selected);
}

// ---- Activity: just the newest three events, and a button for the rest ----

function renderLog() {
  $('log').innerHTML = state.log.slice(0, 3).map(t => `<li>${t}</li>`).join('') || '<li>Nothing has happened yet.</li>';
}

function showLog() {
  openModal('Activity', `<ul class="log-full">${state.log.map(t => `<li>${t}</li>`).join('') || '<li>Nothing has happened yet.</li>'}</ul>`, [{ label: 'Close' }]);
}

function renderPage() {
  renderMap();
  renderInspector();
  renderLog();
}

// ---- Map movement and selection ----

viewport.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return;
  const cell = e.target.closest('[data-plot]');
  pointerStart = { x: e.clientX, y: e.clientY, plot: cell ? Number(cell.dataset.plot) : null, shiftKey: e.shiftKey };
  lastPointer = { x: e.clientX, y: e.clientY };
  dragged = false;
  viewport.setPointerCapture(e.pointerId);
});

viewport.addEventListener('pointermove', e => {
  if (!pointerStart || !lastPointer) return;
  if (mapController.isDrag(pointerStart.x, pointerStart.y, e.clientX, e.clientY)) dragged = true;
  if (!dragged) return;
  mapController.panBy(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
  lastPointer = { x: e.clientX, y: e.clientY };
  viewport.classList.add('dragging');
  tooltip.hidden = true;
  renderMap();
});

viewport.addEventListener('pointerup', e => {
  const clickedPlot = !dragged && pointerStart ? pointerStart.plot : null;
  if (clickedPlot !== null) {
    selectPlot(clickedPlot, pointerStart.shiftKey);
    expandedBuild = null;
    render(true);
  }
  pointerStart = null;
  lastPointer = null;
  dragged = false;
  viewport.classList.remove('dragging');
  if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
});

viewport.addEventListener('pointercancel', () => {
  pointerStart = null;
  lastPointer = null;
  dragged = false;
  viewport.classList.remove('dragging');
});

viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const factor = Math.exp(-e.deltaY * 0.0015);
  mapController.zoomAt(mapController.camera.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  renderMap();
}, { passive: false });

viewport.addEventListener('keydown', e => {
  const moves = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
  if (moves[e.key]) {
    e.preventDefault();
    mapController.panBy(...moves[e.key]);
    renderMap();
  } else if (e.key === 'Escape') {
    mapController.clearSelection();
    rememberSelection();
    render(true);
  } else if (e.key === '+' || e.key === '=') {
    mapController.zoomAt(mapController.camera.zoom + 0.15);
    renderMap();
  } else if (e.key === '-') {
    mapController.zoomAt(mapController.camera.zoom - 0.15);
    renderMap();
  }
});

$('map-zoom-in').addEventListener('click', () => { mapController.zoomAt(mapController.camera.zoom + 0.15); renderMap(); });
$('map-zoom-out').addEventListener('click', () => { mapController.zoomAt(mapController.camera.zoom - 0.15); renderMap(); });
$('map-fit').addEventListener('click', () => {
  mapController.setCamera(0, 0, 1.25);
  mapController.centerOn(7, 7);
  renderMap();
});
$('world-overview').addEventListener('click', showWorldOverview);
$('map-multi').addEventListener('click', e => {
  multiSelectMode = !multiSelectMode;
  e.currentTarget.setAttribute('aria-pressed', String(multiSelectMode));
  e.currentTarget.classList.toggle('primary', multiSelectMode);
});
$('city-select').addEventListener('change', e => {
  travelToCity(Number(e.target.value));
});

$('modal').addEventListener('click', e => {
  const travel = e.target.closest('[data-travel-city]');
  if (!travel) return;
  closeModal();
  travelToCity(Number(travel.dataset.travelCity));
});

// A tooltip that follows the pointer over the map.
const tooltip = $('tooltip');
$('map').addEventListener('mousemove', e => {
  const cell = e.target.closest('[data-plot]');
  if (!cell) { tooltip.hidden = true; return; }
  const tip = tooltipFor(Number(cell.dataset.plot));
  tooltip.innerHTML = `<b>${tip.title}</b>${tip.lines.map(l => `<span>${l}</span>`).join('')}`;
  tooltip.hidden = false;
  const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  tooltip.style.left = `${Math.min(e.clientX + 14, vw - width - 8)}px`;
  tooltip.style.top = `${e.clientY + 18 + height > vh ? e.clientY - height - 12 : e.clientY + 18}px`;
});
$('map').addEventListener('mouseleave', () => { tooltip.hidden = true; });

onAction($('inspector'), 'click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  const d = button.dataset;
  const ids = selectedIds();
  if (button.id === 'clear-selection') {
    mapController.clearSelection();
    rememberSelection();
  } else if (button.id === 'buy-plots') gameService.buyPlots(ids);
  else if (d.bulkBuild) gameService.buildMany(ids, d.bulkBuild);
  else if (selected === null) return;
  else if (d.alert) runAlert(d.alert, selected);
  else if (button.id === 'buy-plot') gameService.buyPlot(selected);
  else if (d.build) gameService.build(selected, d.build);
  else if (d.details) expandedBuild = expandedBuild === d.details ? null : d.details;
  render(true);
});

$('btn-log').addEventListener('click', showLog);

buildMap();
renderLegend();
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeMap).observe(viewport);
else window.addEventListener('resize', resizeMap);
startPage('city', renderPage);
