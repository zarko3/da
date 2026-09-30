'use strict';

// =====================================================================
// GAME STATE: data, rules, and saving. Nothing here touches the page.
// =====================================================================

const CITY_WIDTH = 15;
const CITY_HEIGHT = 15;
const WORLD_CITY_COUNT = 20;
const CITY_PLOT_COUNT = CITY_WIDTH * CITY_HEIGHT;
const WORLD_PLOT_COUNT = WORLD_CITY_COUNT * CITY_PLOT_COUNT;
const SIZE = CITY_WIDTH;              // one City page displays one 15x15 city
const LEGACY_WORLD_SIZE = 10;
const LEGACY_WORLD_OFFSET = 2;
const SAVE_SCHEMA_VERSION = 3;
const START_CASH = 6000;
const MAX_LEVEL = 5;
const PROFIT_TAX = 0.18;              // of each business's positive daily profit
const PROPERTY_TAX = 0.0025;          // of each plot's property value, per day
const MAINT_RATE = 0.005;             // building upkeep per day, as a share of building value
const STORAGE_FEE = 0.04;             // per stored unit per day (at inflation 1.00)
const HIRE_FEE_DAYS = 4;              // hiring fee = this many days of the worker's wage
const SELL_RATIO = 0.85;              // the AI buyer pays this share of the market price
const FARM_YIELD = 3;                 // units of each crop per worker-efficiency per day
const BATCHES_PER_EFFICIENCY = 5;     // factory batches per worker-efficiency per day
const APARTMENT_RENT = 110;           // per worker-efficiency (max 4) per day
const WAREHOUSE_RATE = 0.25;          // storage-contract income per unit of capacity per day, when staffed
const PRICE_SENSITIVITY = 1.8;        // demand falls as (price multiplier) ^ -this
const HISTORY_LIMIT = 60;             // transactions kept per building
const LOCAL_DEVELOPMENT_DAY_MS = 4000;
const MULTIPLAYER_WORLD_DAY_MS = 3600000;
const DAY_MS = LOCAL_DEVELOPMENT_DAY_MS; // compatibility for UI countdowns
const SAVE_KEY = 'plot-tycoon-v3';
const LEGACY_SAVE_BACKUP_KEY = 'plot-tycoon-v3-backup-schema-1';
const CITIES = [
  'Founders City', 'Riverside', 'Northgate', 'Pinehaven', 'Lakeside',
  'Stonebridge', 'Westfield', 'Harborview', 'Oakridge', 'Brighton',
  'Hillcrest', 'Fairview', 'Brookside', 'Maplewood', 'Eastport',
  'Cedar Grove', 'Silverton', 'Meadow Park', 'Redwood', 'Grand Junction',
];
const COMPANY_SYMBOLS = {
  plot: 'Plot', farm: 'Farm', factory: 'Factory', shop: 'Shop', hotel: 'Hotel', depot: 'Transport',
};
const COMPANY_COLORS = {
  forest: '#23784b', plum: '#8a70b8', teal: '#4f9aa3', olive: '#7d9a58',
  gold: '#a86a0a', brick: '#8f3a3a', navy: '#3b4f6e', copper: '#8a4520',
};

// Transport and deliveries
const AI_DELIVERY_DAYS = 1;           // market orders arrive after this many days; no truck is needed
const RESTOCK_LUCK = 1.15;            // shops and factories order a little more than an average day needs
const TRUCK_LOAD = 40;                // items one level-1 truck carries
const TILES_PER_DAY = 6;              // how far a level-1 truck drives in a day
const TRUCK_UPKEEP = 6;               // per truck per day (at inflation 1.00)
const FUEL_PER_TILE = 1.5;            // per tile driven (at inflation 1.00)
const FUEL_MIN = 3;                   // least a trip can cost in fuel
const MAX_CONTRACT_DAYS = 10;         // longest delivery time a contract can allow
const DELIVERY_HISTORY = 120;         // finished contracts kept in the save
const MARKET_HISTORY = 30;
const LOAN_MIN = 500;                 // smallest loan
const LOAN_TERMS = [10, 20, 30, 60, 90, 120];   // repayment periods the bank offers, in game days
const MAX_LOANS = 4;                  // loans open at once
const RATE_PERIOD = 30;               // interest rates are quoted per this many days (one game month)
const BASE_RATE = 0.02;               // the bank's own margin, per period, before inflation and credit
const INFLATION_PASS = 0.75;          // share of recent inflation the bank passes on to borrowers
const MAX_SPREAD = 0.05;              // extra rate per period for the worst credit score
const LATE_FEE = 0.05;                // of the payment that was missed
const LATE_FEE_MIN = 10;              // least a late fee can be (at inflation 1.00)
const SCORE_MIN = 300, SCORE_MAX = 850, SCORE_NO_LOANS = 500;   // credit score range, and the score below which the bank says no
const BANK_HISTORY = 100;             // bank transactions kept
const BANK_WINDOW = 30;               // days of profit and inflation the bank looks back over            // finished market orders kept (there are many more of these, so fewer are kept)

// Districts by distance from the middle of the map. Cheap land is far out.
// traffic = customers and rent multiplier; fertility = farm yield multiplier.
const DISTRICTS = {
  center:    { name: 'Town Center', price: 6500, traffic: 1.35, fertility: 0.85 },
  midtown:   { name: 'Midtown',     price: 3800, traffic: 1.15, fertility: 0.95 },
  suburbs:   { name: 'Suburbs',     price: 2200, traffic: 1.0,  fertility: 1.05 },
  outskirts: { name: 'Outskirts',   price: 1200, traffic: 0.8,  fertility: 1.2 },
};

// base = fair price at inflation 1.00
const ITEMS = {
  wheat:  { name: 'Wheat',  base: 5 },
  milk:   { name: 'Milk',   base: 6 },
  fruit:  { name: 'Fruit',  base: 5 },
  bread:  { name: 'Bread',  base: 13 },
  juice:  { name: 'Juice',  base: 12 },
  snacks: { name: 'Snacks', base: 11 },
};
const FARM_ITEMS = ['wheat', 'milk', 'fruit'];
const FACTORY_ITEMS = ['bread', 'juice', 'snacks'];
const LISTERS = ['farm', 'factory', 'warehouse'];   // buildings that can list stock on the market
const SUPPLIERS = ['Green Valley Co-op', 'Metro Wholesale', 'Sunrise Foods', 'Harbor Trading'];

// A factory buys the inputs it lacks from the market and makes `qty` of `out`.
const RECIPES = [
  { out: 'bread',  qty: 4, in: { wheat: 2, milk: 1 } },
  { out: 'juice',  qty: 4, in: { fruit: 3 } },
  { out: 'snacks', qty: 4, in: { wheat: 1, fruit: 1 } },
];

// Shops, cafes and hotels buy stock from the market and use it up each day.
// perEff = customers served per worker-efficiency, demand = customers per day.
// Shops/cafes charge base price x markup per item; hotels charge a flat fee per guest ("room").
const RETAIL = {
  shop:  { items: ['bread', 'juice', 'snacks'], perEff: 8, demand: 24, markup: 1.9 },
  cafe:  { items: ['bread', 'milk', 'juice'],   perEff: 6, demand: 18, markup: 2.6 },
  hotel: { items: ['bread', 'milk', 'fruit'],   perEff: 3, demand: 8,  fee: 90 },
};

// Item capacity at level 1. Apartments hold nothing.
// A depot's storage is the cargo waiting for or riding on its trucks.
const CAPACITY = { farm: 200, factory: 250, warehouse: 600, shop: 100, cafe: 100, hotel: 100, depot: 400 };

// cost = price to build. Farms are the cheap start; factories, warehouses and hotels
// need savings first. wage = daily base pay for that role.
const BUILDINGS = {
  farm: { name: 'Farm', cost: 2200, tag: { text: 'Cheapest start', kind: 'good' },
    desc: 'Grows wheat, milk and fruit when staffed.',
    roles: [{ role: 'Farmhand', wage: 20 }, { role: 'Tractor Driver', wage: 28 }, { role: 'Agronomist', wage: 40 }] },
  shop: { name: 'Shop', cost: 5500,
    desc: 'Sells bread, juice and snacks to customers.',
    roles: [{ role: 'Cashier', wage: 22 }, { role: 'Stocker', wage: 20 }, { role: 'Manager', wage: 38 }] },
  cafe: { name: 'Cafe', cost: 7000,
    desc: 'Serves bread, milk and juice at high margins.',
    roles: [{ role: 'Barista', wage: 22 }, { role: 'Cook', wage: 28 }, { role: 'Manager', wage: 38 }] },
  apartment: { name: 'Apartment', cost: 10500,
    desc: 'Collects rent when staffed. Best in busy districts.',
    roles: [{ role: 'Janitor', wage: 18 }, { role: 'Maintenance', wage: 28 }, { role: 'Property Manager', wage: 40 }] },
  warehouse: { name: 'Warehouse', cost: 7500, tag: { text: 'Save up first', kind: 'warn' },
    desc: 'Earns storage contracts, and can buy, store and resell any item.',
    roles: [{ role: 'Loader', wage: 20 }, { role: 'Forklift Driver', wage: 27 }, { role: 'Inventory Clerk', wage: 32 }] },
  factory: { name: 'Factory', cost: 14000, tag: { text: 'Save up first', kind: 'warn' },
    desc: 'Buys farm goods, makes bread, juice and snacks.',
    roles: [{ role: 'Line Worker', wage: 24 }, { role: 'Machinist', wage: 34 }, { role: 'Supervisor', wage: 44 }] },
  hotel: { name: 'Hotel', cost: 22000, tag: { text: 'Save up first', kind: 'warn' },
    desc: 'Guests pay per night and eat breakfast from stock.',
    roles: [{ role: 'Housekeeper', wage: 21 }, { role: 'Receptionist', wage: 27 }, { role: 'Concierge', wage: 34 }, { role: 'Manager', wage: 46 }] },
  depot: { name: 'Transport Depot', cost: 9500, tag: { text: 'Moves goods', kind: 'warn' },
    desc: 'Trucks and drivers carry goods between your buildings under delivery contracts.',
    roles: [{ role: 'Driver', wage: 21 }, { role: 'Dispatcher', wage: 27 }, { role: 'Mechanic', wage: 30 }] },
};

const FIRST_NAMES = ['Alex', 'Sam', 'Jo', 'Robin', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Riley', 'Quinn', 'Drew', 'Avery'];
const LAST_NAMES = ['Ward', 'Novak', 'Reyes', 'Kim', 'Okafor', 'Silva', 'Berg', 'Haddad', 'Lopez', 'Ivanov'];

// Company level is set by net worth (cash + property + stock).
const COMPANY_LEVELS = [
  { name: 'Startup', from: 0 }, { name: 'Small Business', from: 15000 }, { name: 'Local Chain', from: 35000 },
  { name: 'Regional Company', from: 80000 }, { name: 'Corporation', from: 160000 }, { name: 'Tycoon', from: 320000 },
];

// Transaction types. Income adds to cash, the rest take from it.
// Build/upgrade spending is "capital": tracked, but not part of profit.
const TX_LABEL = {
  sale: 'Sale', rent: 'Rent and contracts', purchase: 'Stock purchase', wages: 'Wages', hiring: 'Hiring fee',
  maintenance: 'Maintenance', propertyTax: 'Property tax', profitTax: 'Profit tax', capital: 'Build / upgrade',
  delivery: 'Delivery costs', freight: 'Delivery income',
  loanIn: 'Loan received', loanPayment: 'Loan payment', lateFee: 'Late fee',
};
const INCOME_TYPES = ['sale', 'rent', 'freight'];

// state = { cash, day, inflation (price index), inflationRate (today's change), market: [supplier listing],
//           listings: [player listing], listingSeq, deliveries: [delivery], deliverySeq, txSeq, seenWelcome,
//           lastTick (ms, when the last day ran), log: [text], lastDay, bank, plots: [plot] }
// bank = { loans: [loan], loanSeq, misses: [day a payment was missed], profits: [recent daily profit], inflation: [recent daily inflation],
//          history: [transaction], totals: { borrowed, principal, interest, fees } }
// loan = { id, day (taken), principal, rate (per 30 days), term (days), payment (per day), balance (still owed), due (last scheduled day),
//          nextPay, paid, interestPaid, fees, missed, behind (last payment was missed), status: 'active' | 'paid', closedDay }
// delivery = { id, kind: 'contract' | 'market', supplier, source, destination, item, qty, cargo (units still travelling),
//              delivered, unitPrice, paid, fee, depot, days, deadline, createdDay, pickupDay, arriveDay, tripDays, fuel,
//              status: 'pending' | 'active' | 'completed' | 'failed', reason, endedDay }
// plot = { owned, building, level (1-5), workers, inv: {item: n}, priceMult: {item|'room': n},
//          totals: {type: $}, history: [transaction], today: report, last: report }
// worker = { name, role, wage (per day), efficiency (1 = average) }
// supplier listing = { supplier, item, price, prev, bias, stock }
// player listing = { id, plot, item, qty, price }
// transaction = { id, day, type, amount (+ income, - cost), note }
// report = { produced, sold: {item: n}, revenue, stock, wages, hiring, maintenance, property, tax, note, issue }
let state;                            // assigned below, once the save helpers exist
let notices = [];                     // messages waiting to be shown as toasts (not saved)
let processing = false;               // true while a day is being worked out (decides when new deliveries arrive)

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const round2 = n => Math.round(n * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = list => list[Math.floor(Math.random() * list.length)];

function blankLastDay() {
  return { profit: 0, wages: 0, maintenance: 0, delivery: 0, propertyTax: 0, profitTax: 0, interest: 0, lateFees: 0, principal: 0 };
}

function blankReport() {
  return { produced: {}, sold: {}, revenue: 0, stock: 0, wages: 0, hiring: 0, maintenance: 0, delivery: 0, property: 0, tax: 0, note: '', issue: '' };
}

function blankBank() {
  return { loans: [], loanSeq: 0, misses: [], profits: [], inflation: [], history: [], totals: { borrowed: 0, principal: 0, interest: 0, fees: 0 } };
}

function blankTotals() {
  return { sale: 0, rent: 0, freight: 0, purchase: 0, wages: 0, hiring: 0, maintenance: 0, delivery: 0, propertyTax: 0, profitTax: 0, capital: 0 };
}

function blankPlot() {
  return {
    owned: false, building: null, level: 1, workers: [], inv: {}, priceMult: {},
    totals: blankTotals(), history: [], today: blankReport(), last: blankReport(),
  };
}

function newMarket() {
  const listings = [];
  Object.keys(ITEMS).forEach(item => {
    const two = [...SUPPLIERS].sort(() => Math.random() - 0.5).slice(0, 2);
    two.forEach(supplier => {
      const bias = round2(rand(0.85, 1.25));
      const price = round2(ITEMS[item].base * bias);
      listings.push({ supplier, item, price, prev: price, bias, stock: randInt(60, 120) });
    });
  });
  return listings;
}

function newGame() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    company: null,
    cash: START_CASH,
    day: 1,
    inflation: 1,
    inflationRate: 0,
    market: newMarket(),
    listings: [],
    listingSeq: 0,
    deliveries: [],
    deliverySeq: 0,
    txSeq: 0,
    seenWelcome: false,
    lastTick: Date.now(),
    log: ['Welcome. Buy a plot, build a farm, hire workers. A day passes every few seconds.'],
    lastDay: blankLastDay(),
    bank: blankBank(),
    plots: Array.from({ length: WORLD_PLOT_COUNT }, blankPlot),
  };
}

function normalizePlot(plot) {
  const source = plot && typeof plot === 'object' ? plot : {};
  return Object.assign(blankPlot(), source, {
    workers: Array.isArray(source.workers) ? source.workers : [],
    inv: source.inv && typeof source.inv === 'object' ? source.inv : {},
    priceMult: source.priceMult && typeof source.priceMult === 'object' ? source.priceMult : {},
    history: Array.isArray(source.history) ? source.history : [],
    totals: Object.assign(blankTotals(), source.totals),
    today: Object.assign(blankReport(), source.today),
    last: Object.assign(blankReport(), source.last),
  });
}

const isValidPlotId = id => Number.isInteger(id) && id >= 0 && id < WORLD_PLOT_COUNT;
const plotIdAt = (city, x, y) => Number.isInteger(city) && city >= 0 && city < WORLD_CITY_COUNT
  && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < CITY_WIDTH && y >= 0 && y < CITY_HEIGHT
  ? city * CITY_PLOT_COUNT + y * CITY_WIDTH + x : null;
const plotCoords = id => isValidPlotId(id) ? {
  city: Math.floor(id / CITY_PLOT_COUNT),
  x: id % CITY_PLOT_COUNT % CITY_WIDTH,
  y: Math.floor(id % CITY_PLOT_COUNT / CITY_WIDTH),
} : null;
const cityOfPlot = id => { const point = plotCoords(id); return point ? point.city : null; };

function migrateLegacyPlotId(id) {
  if (!Number.isInteger(id) || id < 0 || id >= LEGACY_WORLD_SIZE * LEGACY_WORLD_SIZE) return null;
  return plotIdAt(0, id % LEGACY_WORLD_SIZE + LEGACY_WORLD_OFFSET, Math.floor(id / LEGACY_WORLD_SIZE) + LEGACY_WORLD_OFFSET);
}

function migrateTemporaryWorldId(id) {
  if (!Number.isInteger(id) || id < 0 || id >= 4096) return null;
  const x = id % 64, y = Math.floor(id / 64);
  if (x >= 27 && x <= 36 && y >= 27 && y <= 36) return plotIdAt(0, x - 25, y - 25);
  const city = Math.min(WORLD_CITY_COUNT - 1, Math.floor(y / 16) * 4 + Math.floor(x / 16));
  return plotIdAt(city, x % CITY_WIDTH, y % CITY_HEIGHT);
}

function migrateLegacyReferences(saved) {
  saved.listings.forEach(listing => { listing.plot = migrateLegacyPlotId(listing.plot); });
  saved.listings = saved.listings.filter(listing => listing.plot !== null);
  saved.deliveries.forEach(delivery => {
    if (Number.isInteger(delivery.supplier)) delivery.supplier = migrateLegacyPlotId(delivery.supplier);
    if (Number.isInteger(delivery.destination)) delivery.destination = migrateLegacyPlotId(delivery.destination);
    if (Number.isInteger(delivery.depot)) delivery.depot = migrateLegacyPlotId(delivery.depot);
  });
}

function hydrateGame(saved) {
  if (!saved || typeof saved !== 'object' || !Number.isFinite(saved.cash) || !Array.isArray(saved.plots)) return null;
  const legacy = !saved.schemaVersion && saved.plots.length === LEGACY_WORLD_SIZE * LEGACY_WORLD_SIZE;
  const temporaryV2 = saved.schemaVersion === 2;
  const denseCurrent = saved.schemaVersion !== SAVE_SCHEMA_VERSION && saved.plots.length === WORLD_PLOT_COUNT;
  if (!legacy && !temporaryV2 && !denseCurrent && saved.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  saved.day = Number.isInteger(saved.day) && saved.day > 0 ? saved.day : 1;
  saved.schemaVersion = SAVE_SCHEMA_VERSION;
  saved.company = normalizeCompany(saved.company);
  saved.inflation = Number.isFinite(saved.inflation) && saved.inflation > 0 ? saved.inflation : 1;
  saved.inflationRate = Number.isFinite(saved.inflationRate) ? saved.inflationRate : 0;
  saved.listingSeq = saved.listingSeq || 0;
  saved.deliverySeq = saved.deliverySeq || 0;
  saved.txSeq = saved.txSeq || 0;
  saved.lastTick = saved.lastTick || Date.now();
  if (!Array.isArray(saved.market) || !saved.market.length) saved.market = newMarket();
  if (!Array.isArray(saved.listings)) saved.listings = [];
  if (!Array.isArray(saved.deliveries)) saved.deliveries = [];
  if (!Array.isArray(saved.log)) saved.log = [];
  saved.lastDay = Object.assign(blankLastDay(), saved.lastDay);
  const bank = Object.assign(blankBank(), saved.bank);
  ['loans', 'misses', 'profits', 'inflation', 'history'].forEach(key => { if (!Array.isArray(bank[key])) bank[key] = []; });
  bank.totals = Object.assign(blankBank().totals, bank.totals);
  bank.loanSeq = bank.loanSeq || 0;
  saved.bank = bank;

  const plots = Array.from({ length: WORLD_PLOT_COUNT }, blankPlot);
  if (legacy) {
    saved.plots.forEach((plot, oldId) => { plots[migrateLegacyPlotId(oldId)] = normalizePlot(plot); });
    migrateLegacyReferences(saved);
  } else if (temporaryV2) {
    saved.plots.forEach((record, denseId) => {
      const oldId = record && Number.isInteger(record.id) ? record.id : denseId;
      const newId = migrateTemporaryWorldId(oldId);
      if (newId === null || !record) return;
      const copy = Object.assign({}, record);
      delete copy.id;
      plots[newId] = normalizePlot(copy);
    });
    const remap = value => Number.isInteger(value) ? migrateTemporaryWorldId(value) : value;
    saved.listings.forEach(listing => { listing.plot = remap(listing.plot); });
    saved.deliveries.forEach(delivery => {
      delivery.supplier = remap(delivery.supplier);
      delivery.destination = remap(delivery.destination);
      delivery.depot = remap(delivery.depot);
    });
  } else if (denseCurrent) {
    saved.plots.forEach((plot, id) => { plots[id] = normalizePlot(plot); });
  } else {
    saved.plots.forEach(record => {
      if (!record || !isValidPlotId(record.id)) return;
      const copy = Object.assign({}, record);
      delete copy.id;
      plots[record.id] = normalizePlot(copy);
    });
  }
  saved.plots = plots;
  return saved;
}

function plotHasSavedData(plot) {
  return Boolean(plot.owned || plot.building || plot.level !== 1 || plot.workers.length || Object.keys(plot.inv).length
    || Object.keys(plot.priceMult).length || plot.history.length
    || Object.values(plot.totals).some(Boolean) || Object.values(plot.today).some(value => typeof value === 'object' ? Object.keys(value).length : Boolean(value))
    || Object.values(plot.last).some(value => typeof value === 'object' ? Object.keys(value).length : Boolean(value)));
}

function serializeGame(game) {
  const saved = Object.assign({}, game, { schemaVersion: SAVE_SCHEMA_VERSION });
  saved.plots = game.plots.reduce((records, plot, id) => {
    if (plotHasSavedData(plot)) records.push(Object.assign({ id }, plot));
    return records;
  }, []);
  return saved;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const legacy = parsed && parsed.schemaVersion !== SAVE_SCHEMA_VERSION && Array.isArray(parsed.plots)
        && parsed.plots.length === LEGACY_WORLD_SIZE * LEGACY_WORLD_SIZE;
      const loaded = hydrateGame(parsed);
      if (loaded) {
        if (legacy && !localStorage.getItem(LEGACY_SAVE_BACKUP_KEY)) localStorage.setItem(LEGACY_SAVE_BACKUP_KEY, raw);
        return loaded;
      }
    }
  } catch (e) { /* no save, invalid save, or storage unavailable */ }
  return newGame();
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(state))); } catch (e) { /* ignore */ }
}

function normalizeCompany(company) {
  if (!company || typeof company !== 'object') return null;
  const name = normalizeCompanyName(company.name);
  if (!name || !COMPANY_SYMBOLS[company.symbol] || !COMPANY_COLORS[company.color]) return null;
  return { name, symbol: company.symbol, color: company.color };
}

function normalizeCompanyName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  const length = Array.from(name).length;
  return length >= 2 && length <= 30 && /^[\p{L}\p{N} &'.-]+$/u.test(name) ? name : null;
}

function setCompanyIdentity(name, symbol, color) {
  const company = normalizeCompany({ name, symbol, color });
  if (!company) return { ok: false, reason: 'invalid-company' };
  state.company = company;
  saveGame();
  return { ok: true, company: Object.assign({}, company) };
}

state = loadGame();

function log(message) {
  state.log.unshift(`Day ${state.day}: ${message}`);
  if (state.log.length > 60) state.log.pop();
}

// A message the page shows as a toast. State code only queues it.
function notify(message) { notices.push(message); }

// ---- Districts and land ----

function districtOf(i) {
  const { x, y } = plotCoords(i) || { x: 0, y: 0 };
  const d = Math.max(Math.abs(x - 7), Math.abs(y - 7));
  return d <= 1.5 ? 'center' : d <= 2.5 ? 'midtown' : d <= 3.5 ? 'suburbs' : 'outskirts';
}
const plotPrice = i => Math.round(DISTRICTS[districtOf(i)].price * state.inflation / 10) * 10;
const plotLabel = i => {
  const point = plotCoords(i);
  return point ? `${CITIES[point.city]} ${point.x + 1},${point.y + 1}` : 'unknown';
};

function citySummary(cityId) {
  if (!Number.isInteger(cityId) || cityId < 0 || cityId >= WORLD_CITY_COUNT) return null;
  const start = cityId * CITY_PLOT_COUNT;
  let owned = 0, empty = 0, buildings = 0, totalPrice = 0, cheapestLand = Infinity;
  for (let offset = 0; offset < CITY_PLOT_COUNT; offset++) {
    const id = start + offset, plot = state.plots[id], price = plotPrice(id);
    totalPrice += price;
    if (plot.owned) {
      owned++;
      if (plot.building) buildings++;
      else empty++;
    } else cheapestLand = Math.min(cheapestLand, price);
  }
  return {
    id: cityId,
    name: CITIES[cityId],
    plots: CITY_PLOT_COUNT,
    available: CITY_PLOT_COUNT - owned,
    owned,
    empty,
    buildings,
    averageLandPrice: Math.round(totalPrice / CITY_PLOT_COUNT),
    cheapestLand: Number.isFinite(cheapestLand) ? cheapestLand : null,
  };
}

function districtPerks(key) {
  const d = DISTRICTS[key], perks = [];
  const show = (n, what) => { if (Math.abs(n - 1) > 0.001) perks.push(`${n > 1 ? '+' : '-'}${Math.round(Math.abs(n - 1) * 100)}% ${what}`); };
  show(d.traffic, 'customers and rent');
  show(d.fertility, 'farm yield');
  return perks.join(', ') || 'no bonuses';
}

// ---- Levels: one table drives every upgrade effect ----

const slotsAt = level => 2 + level;                              // worker slots
const speedAt = level => 1 + 0.25 * (level - 1);                 // production / service speed
const demandAt = level => 1 + 0.2 * (level - 1);                 // customer demand
const capacityAt = (type, level) => CAPACITY[type] ? Math.round(CAPACITY[type] * (1 + 0.5 * (level - 1))) : 0;
const upgradeStep = (type, level) => BUILDINGS[type].cost * (0.8 + 0.7 * level);   // cost at inflation 1.00

function valueMultiplier(level) {                                // 1, 2.5, 4.7, 7.6, 11.3
  let m = 1;
  for (let l = 1; l < level; l++) m += 0.8 + 0.7 * l;
  return m;
}
const valueAt = (type, level) => Math.round(BUILDINGS[type].cost * valueMultiplier(level) * state.inflation);

const slotsOf = plot => slotsAt(plot.level);
const speedOf = plot => speedAt(plot.level);
const demandOf = plot => demandAt(plot.level);
const capacityOf = plot => capacityAt(plot.building, plot.level);
const buildingValue = plot => plot.building ? valueAt(plot.building, plot.level) : 0;
const upgradeCost = plot => Math.round(upgradeStep(plot.building, plot.level) * state.inflation);
const buildCost = type => Math.round(BUILDINGS[type].cost * state.inflation);
const propertyValueAt = i => state.plots[i].owned ? plotPrice(i) + buildingValue(state.plots[i]) : 0;

// Upkeep and property tax grow more gently with level than the building's worth does,
// so an upgrade can still pay for itself.
const upkeepValueAt = (type, level) => Math.round(BUILDINGS[type].cost * (1 + 0.35 * (level - 1)) * state.inflation);
const upkeepValue = plot => plot.building ? upkeepValueAt(plot.building, plot.level) : 0;
const propertyTaxPerDay = i => state.plots[i].owned ? round2((plotPrice(i) + upkeepValue(state.plots[i])) * PROPERTY_TAX) : 0;
const storageFee = () => STORAGE_FEE * state.inflation;

// ---- Items, prices, lookups ----

const buildingName = i => `${BUILDINGS[state.plots[i].building].name} (${plotLabel(i)})`;
const itemName = item => ITEMS[item].name.toLowerCase();

function marketPrice(item) {
  const listings = state.market.filter(l => l.item === item);
  return listings.reduce((sum, l) => sum + l.price, 0) / listings.length;
}
const sellPrice = item => round2(marketPrice(item) * SELL_RATIO);

const isStaffed = plot => plot.workers.length > 0;
const totalEfficiency = plot => plot.workers.reduce((sum, w) => sum + w.efficiency, 0);
// Items held in a building. A depot "holds" the cargo waiting for or riding on its trucks.
const usedSpace = plot => Object.values(plot.inv).reduce((sum, n) => sum + n, 0)
  + (plot.building === 'depot' ? cargoAboard(state.plots.indexOf(plot)) : 0);
const hasInventory = plot => Boolean(CAPACITY[plot.building]);

const allWorkers = () => state.plots.flatMap(p => p.workers);
const wagesPerDay = () => allWorkers().reduce((sum, w) => sum + w.wage, 0);

// ---- Transport: depots, trucks and drivers ----

const trucksAt = level => 1 + level;                                       // trucks a depot owns
const truckLoadAt = level => Math.round(TRUCK_LOAD * speedAt(level));      // items one truck carries
const tripDaysAt = (distance, level) => 1 + Math.floor(distance / (TILES_PER_DAY * speedAt(level)));
const distanceBetween = (a, b) => {
  const first = plotCoords(a), second = plotCoords(b);
  return first && second ? Math.abs(first.x - second.x) + Math.abs(first.y - second.y) + Math.abs(first.city - second.city) * CITY_WIDTH : Infinity;
};
const fuelCost = distance => round2(Math.max(FUEL_MIN, distance * FUEL_PER_TILE) * state.inflation);
const truckUpkeep = plot => plot.building === 'depot' ? round2(trucksAt(plot.level) * TRUCK_UPKEEP * state.inflation) : 0;

// A truck only runs with a driver, so the crew limits how many trucks can go out.
const operableTrucks = plot => Math.min(trucksAt(plot.level), plot.workers.length);
const busyTrucks = i => state.deliveries.filter(d => d.kind === 'contract' && d.depot === i && d.status === 'active').length;
const freeTrucks = i => Math.max(0, operableTrucks(state.plots[i]) - busyTrucks(i));

// ---- Deliveries in flight ----
// While goods travel they belong to the delivery (its `cargo`), not to any building. That is what stops
// the same stock being sold, used or sent twice: it is simply no longer in an inventory.

const inTransit = d => d.status === 'pending' || d.status === 'active';
const cargoAboard = i => state.deliveries.filter(d => d.kind === 'contract' && d.depot === i && inTransit(d))
  .reduce((sum, d) => sum + d.cargo, 0);
const incomingTo = (i, item) => state.deliveries.filter(d => d.destination === i && inTransit(d) && (item === undefined || d.item === item))
  .reduce((sum, d) => sum + d.cargo, 0);
// Room left for new goods, counting what is already on its way.
const freeSpace = i => capacityOf(state.plots[i]) - usedSpace(state.plots[i]) - incomingTo(i);

// What a building holds, by item. For a depot that is the cargo it is carrying.
function stockOf(plot, i) {
  const stock = Object.assign({}, plot.inv);
  if (plot.building === 'depot') {
    state.deliveries.filter(d => d.kind === 'contract' && d.depot === i && inTransit(d))
      .forEach(d => { stock[d.item] = (stock[d.item] || 0) + d.cargo; });
  }
  return stock;
}

// The day a delivery that leaves now and takes `days` days arrives (it is checked at the start of that day).
// While a day is being worked out the next day is state.day + 1; between days state.day is already the next one.
const arrivalDay = days => state.day + days - (processing ? 0 : 1);

// Which buildings can take an item: a warehouse takes anything, a factory its ingredients, shops what they sell.
function accepts(plot, item) {
  if (plot.building === 'warehouse') return true;
  if (plot.building === 'factory') return RECIPES.some(r => item in r.in);
  if (RETAIL[plot.building]) return RETAIL[plot.building].items.includes(item);
  return false;
}
const canSupply = plot => hasInventory(plot) && plot.building !== 'depot';

// Retail prices: the player sets a multiplier of the standard price, so prices follow inflation.
function standardPriceOf(type, key) {
  const cfg = RETAIL[type];
  return key === 'room' ? cfg.fee * state.inflation : ITEMS[key].base * cfg.markup * state.inflation;
}
const multOf = (mults, key) => mults[key] || 1;
const salePriceOf = (type, key, mults) => round2(standardPriceOf(type, key) * multOf(mults, key));
// Higher price = fewer customers (and lower price = more, up to a cap).
const demandFactorOf = (mults, key) => clamp(Math.pow(multOf(mults, key), -PRICE_SENSITIVITY), 0, 2.5);
const retailKeys = type => RETAIL[type].fee ? ['room'] : RETAIL[type].items;

const standardPrice = (plot, key) => standardPriceOf(plot.building, key);
const salePrice = (plot, key) => salePriceOf(plot.building, key, plot.priceMult);
const demandFactor = (plot, key) => demandFactorOf(plot.priceMult, key);

function setPrice(i, key, dollars) {
  const plot = state.plots[i];
  if (!RETAIL[plot.building] || !retailKeys(plot.building).includes(key) || !(dollars > 0)) return;
  plot.priceMult[key] = Math.round(clamp(dollars / standardPrice(plot, key), 0.3, 3) * 1000) / 1000;
  log(`${buildingName(i)} now charges $${salePrice(plot, key).toFixed(2)} for ${key === 'room' ? 'a room' : itemName(key)}.`);
  saveGame();
}

// ---- Production formulas, shared by the daily simulation and the estimates ----

const farmYield = (level, eff, i) => Math.floor(eff * speedAt(level) * FARM_YIELD * DISTRICTS[districtOf(i)].fertility);
const factoryBatches = (level, eff) => Math.floor(eff * speedAt(level) * BATCHES_PER_EFFICIENCY);
const rentPerDay = (level, eff, i) => APARTMENT_RENT * state.inflation * Math.min(4, eff) * speedAt(level) * DISTRICTS[districtOf(i)].traffic;
const storageContracts = level => capacityAt('warehouse', level) * WAREHOUSE_RATE * state.inflation;

// How many customers a shop/cafe/hotel gets. `luck` is ~1 (random in the real day, exactly 1 in estimates).
function retailWants(type, level, eff, i, mults, luck) {
  const cfg = RETAIL[type];
  const capacity = Math.floor(eff * cfg.perEff * speedAt(level));
  const demand = cfg.demand * demandAt(level) * DISTRICTS[districtOf(i)].traffic * luck;
  if (cfg.fee) return { capacity, guests: Math.min(capacity, Math.round(demand * demandFactorOf(mults, 'room'))) };
  const want = {};
  let sum = 0;
  cfg.items.forEach(item => {
    want[item] = Math.round(demand / cfg.items.length * demandFactorOf(mults, item));
    sum += want[item];
  });
  const scale = sum > capacity ? capacity / sum : 1;               // staff can only serve so many
  cfg.items.forEach(item => { want[item] = Math.floor(want[item] * scale); });
  return { capacity, want };
}

const maintenanceOf = plot => round2(upkeepValue(plot) * MAINT_RATE + usedSpace(plot) * storageFee() + truckUpkeep(plot));

// ---- Estimates: what a building should earn per day, shown before you commit ----

const crewOf = plot => plot.workers.map(w => ({ efficiency: w.efficiency, wage: w.wage }));

// Wholesale cost used in estimates: buyers usually get a price a bit under the average.
function wholesalePrice(item) {
  const cheapest = Math.min(...state.market.filter(l => l.item === item).map(l => l.price));
  return (cheapest + marketPrice(item)) / 2;
}

// Expected daily figures for a building of `type` and `level` on plot `i` with this crew.
// Mirrors the real daily simulation, using average luck.
function estimate(type, level, crew, i, mults) {
  const eff = crew.reduce((sum, w) => sum + w.efficiency, 0);
  const e = { income: 0, stock: 0, wages: crew.reduce((sum, w) => sum + w.wage, 0), maintenance: 0, property: 0, tax: 0, net: 0, note: '' };
  let stored = 0;                                                  // units sitting in storage when upkeep is charged

  if (!crew.length) e.note = 'No workers: it would earn nothing.';
  else if (type === 'farm') {
    const n = farmYield(level, eff, i);
    FARM_ITEMS.forEach(item => { e.income += n * sellPrice(item); });
    stored = n * FARM_ITEMS.length;
  } else if (type === 'factory') {
    const batches = factoryBatches(level, eff);
    let gain = 0, cost = 0;
    RECIPES.forEach(r => {
      gain += r.qty * sellPrice(r.out);
      cost += Object.entries(r.in).reduce((sum, [item, q]) => sum + q * wholesalePrice(item), 0);
    });
    e.income = batches * gain / RECIPES.length;
    e.stock = batches * cost / RECIPES.length;
    stored = batches * RECIPES[0].qty;
  } else if (RETAIL[type]) {
    // Customers vary from day to day, so average over the range instead of one exact day.
    const cfg = RETAIL[type], lucks = [0.7, 0.85, 1, 1.15, 1.3];
    lucks.forEach(luck => {
      const r = retailWants(type, level, eff, i, mults || {}, luck);
      if (cfg.fee) {
        e.income += r.guests * salePriceOf(type, 'room', mults || {});
        e.stock += r.guests * cfg.items.reduce((sum, item) => sum + wholesalePrice(item), 0) / cfg.items.length;
      } else {
        cfg.items.forEach(item => {
          e.income += r.want[item] * salePriceOf(type, item, mults || {});
          e.stock += r.want[item] * wholesalePrice(item);
        });
      }
    });
    e.income /= lucks.length;
    e.stock /= lucks.length;
  } else if (type === 'apartment') e.income = rentPerDay(level, eff, i);
  else if (type === 'warehouse') {
    e.income = storageContracts(level);
    e.note = 'Trading (buy low, sell or list high) earns extra on top of the contracts.';
  } else if (type === 'depot') {
    e.note = 'A depot earns the delivery prices you set on contracts. It costs wages, truck upkeep and fuel to run.';
  }

  e.maintenance = upkeepValueAt(type, level) * MAINT_RATE + stored * storageFee()
    + (type === 'depot' ? trucksAt(level) * TRUCK_UPKEEP * state.inflation : 0);
  e.property = (plotPrice(i) + upkeepValueAt(type, level)) * PROPERTY_TAX;
  const pretax = e.income - e.stock - e.wages - e.maintenance - e.property;
  e.tax = pretax > 0 ? pretax * PROFIT_TAX : 0;
  e.net = pretax - e.tax;
  Object.keys(e).forEach(k => { if (typeof e[k] === 'number') e[k] = round2(e[k]); });
  return e;
}

const estimateNow = (plot, i) => estimate(plot.building, plot.level, crewOf(plot), i, plot.priceMult);

// The crew size (average cheapest-role workers) that earns the most on a new building here.
function bestCrew(type, i) {
  const wage = wageOf(BUILDINGS[type].roles[0].wage);
  let best = null;
  for (let n = 1; n <= slotsAt(1); n++) {
    const crew = Array.from({ length: n }, () => ({ efficiency: 1, wage }));
    const est = estimate(type, 1, crew, i, {});
    if (!best || est.net > best.est.net + 0.5) best = { crew, est };
  }
  return best;
}
const hiringFees = crew => crew.reduce((sum, w) => sum + w.wage * HIRE_FEE_DAYS, 0);
const startupCost = (type, crew) => buildCost(type) + hiringFees(crew);
const paybackText = (cost, net) => net > 0 ? `about ${Math.ceil(cost / net)} days` : 'never at this rate';

// ---- Money: every movement goes through earn() or spend() ----

function record(plot, type, amount, note) {
  plot.totals[type] = round2(plot.totals[type] + amount);
  plot.history.unshift({ id: ++state.txSeq, day: state.day, type, amount: INCOME_TYPES.includes(type) ? amount : -amount, note });
  if (plot.history.length > HISTORY_LIMIT) plot.history.pop();
}

function earn(plot, type, amount, note) {
  amount = round2(amount);
  state.cash = round2(state.cash + amount);
  plot.today.revenue = round2(plot.today.revenue + amount);
  record(plot, type, amount, note);
}

function spend(plot, type, amount, note) {
  amount = round2(amount);
  state.cash = round2(state.cash - amount);
  const field = { purchase: 'stock', wages: 'wages', hiring: 'hiring', maintenance: 'maintenance', delivery: 'delivery', propertyTax: 'property', profitTax: 'tax' }[type];
  if (field) plot.today[field] = round2(plot.today[field] + amount);
  record(plot, type, amount, note);
}

const profitOf = t => round2(t.sale + t.rent + t.freight - t.purchase - t.wages - t.hiring - t.maintenance - t.delivery - t.propertyTax - t.profitTax);
const dayCosts = r => round2(r.stock + r.wages + r.hiring + r.maintenance + r.delivery + r.property);
const dayProfit = r => round2(r.revenue - dayCosts(r) - r.tax);

// ---- The bank: loans and credit ----

const activeLoans = () => state.bank.loans.filter(l => l.status === 'active');
const totalDebt = () => round2(activeLoans().reduce((sum, l) => sum + l.balance, 0));
const loanPaymentsPerDay = () => round2(activeLoans().reduce((sum, l) => sum + Math.min(l.payment, l.balance), 0));
const lateFeeFor = amount => round2(Math.max(LATE_FEE_MIN * state.inflation, amount * LATE_FEE));

// One bank transaction (a loan taken, a payment, a fee). Positive money in, negative money out.
function bankRecord(type, amount, note) {
  state.bank.history.unshift({ id: ++state.txSeq, day: state.day, type, amount: type === 'loanIn' ? amount : -amount, note });
  if (state.bank.history.length > BANK_HISTORY) state.bank.history.pop();
}

// The bank looks at these four things. Each gives points; together they make a score from 300 to 850.
function creditReport() {
  const profits = state.bank.profits;
  const avgProfit = profits.length >= 3 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
  const scale = 200 * state.inflation;
  const profitPts = clamp(75 + 125 * (avgProfit / scale), 0, 200);                         // no history counts as a modest start
  const recentMisses = state.bank.misses.filter(d => state.day - d < 90).length;
  const historyPts = Math.max(0, 250 - 55 * recentMisses);
  const cashPts = 100 * clamp(state.cash / (15000 * state.inflation), 0, 1);
  const debt = totalDebt(), assets = netWorth() + debt;
  const ratio = debt > 0 ? debt / Math.max(1, assets) : 0;
  const debtPts = 250 * (1 - clamp(ratio / 0.8, 0, 1));
  const points = profitPts + historyPts + cashPts + debtPts;
  const score = Math.round(SCORE_MIN + points / 800 * (SCORE_MAX - SCORE_MIN));
  const rating = score < 500 ? 'Poor' : score < 620 ? 'Fair' : score < 740 ? 'Good' : score < 800 ? 'Very good' : 'Excellent';
  return {
    score, rating, avgProfit, days: profits.length, recentMisses, debt, ratio,
    parts: {
      profit: { points: Math.round(profitPts), max: 200 },
      history: { points: Math.round(historyPts), max: 250 },
      cash: { points: Math.round(cashPts), max: 100 },
      debt: { points: Math.round(debtPts), max: 250 },
    },
  };
}

// Recent inflation, as a change over one interest period. Days not seen yet count as the usual 0.15%,
// so the rate does not lurch around in the first days of a game.
function periodInflation() {
  const list = state.bank.inflation;
  const total = list.reduce((a, b) => a + b, 0) + (BANK_WINDOW - list.length) * 0.0015;
  return Math.max(0, total / BANK_WINDOW * RATE_PERIOD);
}

// Interest rate per 30 days: a base margin, plus most of recent inflation, plus a spread for weaker credit.
function loanRate(score) {
  const spread = (SCORE_MAX - score) / (SCORE_MAX - SCORE_MIN) * MAX_SPREAD;
  return Math.round(clamp(BASE_RATE + INFLATION_PASS * periodInflation() + spread, 0.01, 0.15) * 10000) / 10000;
}

// How much more the bank will lend: total debt is kept under a share of what you own, and a better score raises that share.
function loanLimit(report) {
  const c = report || creditReport();
  if (c.score < SCORE_NO_LOANS) return 0;
  const share = 0.3 + 0.7 * (c.score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  const room = (netWorth() + c.debt) * share - c.debt;
  return Math.max(0, Math.floor(room / 100) * 100);
}

// Pays a loan off day by day: the schedule this returns is exactly what the daily payments will be if none are missed.
function loanSchedule(amount, rate, term, payment) {
  const daily = rate / RATE_PERIOD;
  let balance = amount, total = 0, interest = 0;
  for (let k = 1; k <= term && balance > 0; k++) {
    const due = round2(balance * daily);
    const pay = Math.min(round2(balance + due), payment);
    total = round2(total + pay); interest = round2(interest + due);
    balance = round2(balance - (pay - due));
  }
  return { total, interest };
}

// What the bank would offer for this amount and period right now, and why not if it would refuse.
function loanQuote(amount, term) {
  const c = creditReport(), rate = loanRate(c.score), limit = loanLimit(c);
  const q = { ok: false, reason: '', amount, term, rate, score: c.score, limit, payment: 0, total: 0, interest: 0, firstPay: state.day + 1, due: state.day + term };
  if (!Number.isInteger(amount) || amount < LOAN_MIN) q.reason = Number.isFinite(amount) && amount >= LOAN_MIN ? 'Use a whole dollar amount.' : `The smallest loan is $${LOAN_MIN.toLocaleString()}.`;
  else if (!LOAN_TERMS.includes(term)) q.reason = 'Choose one of the repayment periods.';
  else if (activeLoans().length >= MAX_LOANS) q.reason = `You can have ${MAX_LOANS} loans open at once. Pay one off first.`;
  else if (activeLoans().some(l => l.behind)) q.reason = 'The bank will not lend while you are behind on a loan.';
  else if (c.score < SCORE_NO_LOANS) q.reason = 'Your credit score is too low for a new loan.';
  else if (amount > limit) q.reason = limit >= LOAN_MIN ? `The bank will lend you up to $${limit.toLocaleString()} right now.` : 'You already owe as much as the bank will allow.';
  const daily = rate / RATE_PERIOD;
  if (Number.isFinite(amount) && amount > 0 && LOAN_TERMS.includes(term)) {
    q.payment = Math.ceil(amount * daily / (1 - Math.pow(1 + daily, -term)) * 100) / 100;   // rounded up, so the last payment is never more
    const s = loanSchedule(amount, rate, term, q.payment);
    q.total = s.total; q.interest = s.interest;
  }
  q.ok = !q.reason;
  return q;
}

// Take out a loan. `expectedRate` is the rate the player was shown; if it moved meanwhile, nothing is signed.
function takeLoan(amount, term, expectedRate) {
  const q = loanQuote(amount, term);
  if (!q.ok) { notify(q.reason); return { ok: false, reason: q.reason }; }
  if (expectedRate !== undefined && Math.abs(q.rate - expectedRate) > 1e-9) {
    const reason = 'The interest rate changed while you were reading. Check the new offer and try again.';
    notify(reason);
    return { ok: false, reason };
  }
  const bank = state.bank, id = ++bank.loanSeq;
  bank.loans.push({
    id, day: state.day, principal: amount, rate: q.rate, term, payment: q.payment, balance: amount, due: q.due, nextPay: q.firstPay,
    paid: 0, interestPaid: 0, fees: 0, missed: 0, behind: false, status: 'active', closedDay: 0,
  });
  state.cash = round2(state.cash + amount);
  bank.totals.borrowed = round2(bank.totals.borrowed + amount);
  bankRecord('loanIn', amount, `Loan ${id}: ${term} days at ${(q.rate * 100).toFixed(2)}% per ${RATE_PERIOD} days`);
  saveGame();
  return { ok: true, loan: bank.loans[bank.loans.length - 1], quote: q };
}

// Pay a loan off in full ahead of time. No penalty, and no more interest after that.
function repayLoan(id) {
  const loan = state.bank.loans.find(l => l.id === id && l.status === 'active');
  if (!loan) return { ok: false, reason: 'That loan is already paid.' };
  if (state.cash < loan.balance) {
    const reason = `You need $${Math.ceil(loan.balance - state.cash).toLocaleString()} more to pay this loan off.`;
    notify(reason);
    return { ok: false, reason };
  }
  const amount = loan.balance;
  state.cash = round2(state.cash - amount);
  state.bank.totals.principal = round2(state.bank.totals.principal + amount);
  loan.paid = round2(loan.paid + amount);
  loan.balance = 0; loan.status = 'paid'; loan.behind = false; loan.closedDay = state.day;
  bankRecord('loanPayment', amount, `Loan ${id} paid off early: $${amount.toFixed(2)} principal`);
  saveGame();
  return { ok: true, amount };
}

// Once a day, after sales: every loan takes its payment. Not enough cash means a late fee and a lower credit score,
// the unpaid interest is added to what is owed, and the loan carries on. Nothing is deleted.
function payLoans() {
  const out = { principal: 0, interest: 0, fees: 0 };
  const bank = state.bank;
  activeLoans().forEach(loan => {
    if (state.day < loan.nextPay) return;
    const interest = round2(loan.balance * loan.rate / RATE_PERIOD);
    const owed = Math.min(round2(loan.balance + interest), Math.max(loan.payment, round2(interest + 1)));
    if (state.cash >= owed) {
      const principal = round2(owed - interest);
      state.cash = round2(state.cash - owed);
      loan.balance = round2(loan.balance - principal);
      loan.paid = round2(loan.paid + owed);
      loan.interestPaid = round2(loan.interestPaid + interest);
      loan.behind = false;
      bank.totals.principal = round2(bank.totals.principal + principal);
      bank.totals.interest = round2(bank.totals.interest + interest);
      out.principal = round2(out.principal + principal);
      out.interest = round2(out.interest + interest);
      const closed = loan.balance <= 0.004;
      if (closed) { loan.balance = 0; loan.status = 'paid'; loan.closedDay = state.day; notify(`Loan ${loan.id} is paid off.`); }
      bankRecord('loanPayment', owed, `Loan ${loan.id}: $${principal.toFixed(2)} principal + $${interest.toFixed(2)} interest${closed ? ', paid off' : ''}`);
    } else {
      const fee = lateFeeFor(owed);
      state.cash = round2(state.cash - fee);
      loan.balance = round2(loan.balance + interest);          // the interest nobody paid is added to what is owed
      loan.fees = round2(loan.fees + fee);
      loan.missed++;
      loan.behind = true;
      bank.misses.push(state.day);
      if (bank.misses.length > 60) bank.misses.shift();
      bank.totals.fees = round2(bank.totals.fees + fee);
      out.fees = round2(out.fees + fee);
      bankRecord('lateFee', fee, `Loan ${loan.id}: missed the $${owed.toFixed(2)} payment (cash was $${Math.max(0, state.cash + fee).toFixed(2)})`);
      log(`Missed the payment on loan ${loan.id}. A late fee of $${fee.toFixed(2)} was charged.`);
      notify(`Missed the payment on loan ${loan.id}. Late fee $${fee.toFixed(2)}, and your credit score dropped.`);
    }
  });
  return out;
}

// ---- Company level ----

function netWorth() {
  const stock = state.plots.reduce((sum, p) => sum + Object.entries(p.inv).reduce((s, [item, n]) => s + n * sellPrice(item), 0), 0);
  const travelling = state.deliveries.filter(inTransit).reduce((sum, d) => sum + d.cargo * sellPrice(d.item), 0);   // goods on the road still count
  return Math.round(state.cash + stock + travelling + state.plots.reduce((sum, _plot, i) => sum + propertyValueAt(i), 0) - totalDebt());
}

function companyLevel() {
  const worth = netWorth();
  let index = 0;
  COMPANY_LEVELS.forEach((l, k) => { if (worth >= l.from) index = k; });
  const next = COMPANY_LEVELS[index + 1];
  return {
    level: index + 1, name: COMPANY_LEVELS[index].name, worth, next,
    progress: next ? (worth - COMPANY_LEVELS[index].from) / (next.from - COMPANY_LEVELS[index].from) : 1,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateOf(day) {
  const n = day - 1;
  return `${MONTHS[Math.floor(n % 360 / 30)]} ${n % 30 + 1}, Year ${Math.floor(n / 360) + 1}`;
}

// ---- Buying land, building, staff, upgrades ----

function normalizePlotIds(plotIds) {
  if (!Array.isArray(plotIds)) return null;
  const ids = [...new Set(plotIds)];
  return ids.every(isValidPlotId) ? ids.sort((a, b) => a - b) : null;
}

function buyPlots(plotIds) {
  const ids = normalizePlotIds(plotIds);
  if (!ids || !ids.length) return { ok: false, reason: 'invalid-plots' };
  if (ids.some(id => state.plots[id].owned)) return { ok: false, reason: 'unavailable' };
  const total = ids.reduce((sum, id) => sum + plotPrice(id), 0);
  if (state.cash < total) {
    notify(`You need $${(total - state.cash).toLocaleString()} more to buy the selected land.`);
    return { ok: false, reason: 'cash', total };
  }
  ids.forEach(id => {
    const plot = state.plots[id], price = plotPrice(id);
    plot.owned = true;
    spend(plot, 'capital', price, `Bought the plot (${DISTRICTS[districtOf(id)].name})`);
    log(`Bought plot ${plotLabel(id)} in the ${DISTRICTS[districtOf(id)].name} for $${price.toLocaleString()}.`);
  });
  saveGame();
  return { ok: true, plotIds: ids, total };
}

function buyPlot(i) { return buyPlots([i]); }

function buildMany(plotIds, type) {
  const ids = normalizePlotIds(plotIds), def = BUILDINGS[type];
  if (!ids || !ids.length || !def) return { ok: false, reason: 'invalid-request' };
  if (ids.some(id => !state.plots[id].owned || state.plots[id].building)) return { ok: false, reason: 'unavailable' };
  const cost = buildCost(type), total = cost * ids.length;
  if (state.cash < total) {
    notify(`You need $${(total - state.cash).toLocaleString()} more to build ${ids.length === 1 ? `a ${def.name}` : `${ids.length} ${def.name} buildings`}.`);
    return { ok: false, reason: 'cash', total };
  }
  ids.forEach(id => {
    const plot = state.plots[id];
    plot.building = type;
    plot.level = 1;
    spend(plot, 'capital', cost, `Built a ${def.name}`);
    log(`Built a ${def.name} on plot ${plotLabel(id)} for $${cost.toLocaleString()}.`);
  });
  saveGame();
  return { ok: true, plotIds: ids, total };
}

function build(i, type) { return buildMany([i], type); }

function upgradeBuilding(i) {
  const plot = state.plots[i];
  if (!plot.building || plot.level >= MAX_LEVEL) return;
  const cost = upgradeCost(plot);
  if (state.cash < cost) { notify(`You need $${(cost - state.cash).toLocaleString()} more to upgrade.`); return; }
  plot.level++;
  spend(plot, 'capital', cost, `Upgraded to level ${plot.level}`);
  log(`Upgraded ${buildingName(i)} to level ${plot.level} for $${cost.toLocaleString()}.`);
  saveGame();
}

// Wages rise with inflation: a role's base wage scaled to today's prices.
const wageOf = baseWage => Math.round(baseWage * state.inflation);

// Better workers cost more: wage = the role's wage x efficiency.
function makeWorker(role, baseWage) {
  const efficiency = Math.round(rand(0.6, 1.4) * 100) / 100;
  return {
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    role,
    wage: Math.max(1, Math.round(wageOf(baseWage) * efficiency)),
    efficiency,
  };
}

function hireWorker(i, role) {
  const plot = state.plots[i];
  if (!plot.building) return;
  if (plot.workers.length >= slotsOf(plot)) { notify('No free worker slots. Upgrade the building for more.'); return; }
  const def = BUILDINGS[plot.building].roles.find(r => r.role === role);
  if (!def) return;
  const worker = makeWorker(def.role, def.wage);
  const fee = worker.wage * HIRE_FEE_DAYS;
  if (state.cash < fee) { notify(`You need $${(fee - state.cash).toLocaleString()} more for the hiring fee.`); return; }
  plot.workers.push(worker);
  spend(plot, 'hiring', fee, `Hired ${worker.name} as ${worker.role}`);
  log(`Hired ${worker.name} as ${worker.role} at ${buildingName(i)}: $${worker.wage}/day plus a $${fee} fee.`);
  saveGame();
}

function fireWorker(i, index) {
  const plot = state.plots[i], worker = plot.workers[index];
  if (!worker) return;
  plot.workers.splice(index, 1);
  log(`Fired ${worker.name} from ${buildingName(i)}.`);
  saveGame();
}

// ---- Trading: AI suppliers, AI buyers, and the player's own listings ----

// Orders up to `qty` of an item for a building from the cheapest offers: AI suppliers and other
// player buildings' listings. The goods are paid for now and arrive as a delivery a day later.
// Limited by stock, room (counting what is already on its way) and cash.
function buyInventory(i, item, qty) {
  const plot = state.plots[i];
  let want = Math.min(qty, freeSpace(i));
  let bought = 0, spent = 0;
  const offers = [
    ...state.market.filter(l => l.item === item && l.stock > 0)
      .map(l => ({ ai: true, l, price: l.price, avail: l.stock })),
    ...state.listings.filter(l => l.item === item && l.plot !== i)
      .map(l => ({ ai: false, l, price: l.price, avail: Math.min(l.qty, state.plots[l.plot].inv[item] || 0) }))
      .filter(o => o.avail > 0),
  ].sort((a, b) => a.price - b.price);

  for (const o of offers) {
    if (want <= 0) break;
    const n = Math.min(want, o.avail, Math.floor(state.cash / o.price));
    if (n <= 0) break;
    const cost = round2(n * o.price);
    if (o.ai) {
      o.l.stock -= n;
      spend(plot, 'purchase', cost, `Ordered ${n} ${itemName(item)} from ${o.l.supplier}`);
      orderMarketDelivery(i, item, n, o.l.supplier, cost, null);
    } else {
      const seller = state.plots[o.l.plot];
      seller.inv[item] -= n;                                   // the goods leave the seller now
      if (!seller.inv[item]) delete seller.inv[item];
      o.l.qty -= n;
      seller.today.sold[item] = (seller.today.sold[item] || 0) + n;
      earn(seller, 'sale', cost, `Sold ${n} ${itemName(item)} to ${buildingName(i)}`);
      spend(plot, 'purchase', cost, `Ordered ${n} ${itemName(item)} from ${buildingName(o.l.plot)}`);
      orderMarketDelivery(i, item, n, buildingName(o.l.plot), cost, o.l.plot);
    }
    bought += n; spent += cost; want -= n;
  }
  pruneListings();
  return { bought, spent };
}

// Sells items from a building's inventory straight to the AI buyer. qty can be 'all'.
function sellGoods(i, item, qty) {
  const plot = state.plots[i], have = plot.inv[item] || 0;
  const n = qty === 'all' ? have : Math.min(qty, have);
  if (n <= 0) return { sold: 0, revenue: 0 };
  const revenue = round2(n * sellPrice(item));
  plot.inv[item] = have - n;
  plot.today.sold[item] = (plot.today.sold[item] || 0) + n;
  earn(plot, 'sale', revenue, `Sold ${n} ${itemName(item)} to the market`);
  pruneListings();
  return { sold: n, revenue };
}

// Manual trades from the inspector. Only staffed buildings can trade.
function tradeManually(i, mode, item, qty) {
  const plot = state.plots[i];
  if (!plot.building || !ITEMS[item] || !LISTERS.includes(plot.building)) return;
  if (!isStaffed(plot)) { log(`${buildingName(i)} needs staff before it can trade.`); notify('Hire a worker first: trading needs staff.'); saveGame(); return; }
  if (mode === 'buy') {
    const r = buyInventory(i, item, qty);
    if (r.bought) log(`${buildingName(i)} ordered ${r.bought} ${itemName(item)} for $${r.spent.toFixed(2)}. They arrive tomorrow.`);
    else { log(`${buildingName(i)} could not order ${itemName(item)} (no cash, room or stock).`); notify(`Could not order ${itemName(item)}: no cash, room or supplier stock.`); }
  } else {
    const r = sellGoods(i, item, qty);
    if (r.sold) log(`${buildingName(i)} sold ${r.sold} ${itemName(item)} for $${r.revenue.toFixed(2)}.`);
  }
  saveGame();
}

// Sells everything a building holds to the market in one go.
function sellAllStock(i) {
  const plot = state.plots[i];
  if (!plot.building || !LISTERS.includes(plot.building)) return;
  if (!isStaffed(plot)) { notify('Hire a worker first: selling needs staff.'); return; }
  let units = 0, revenue = 0;
  Object.keys(plot.inv).forEach(item => {
    const r = sellGoods(i, item, 'all');
    units += r.sold; revenue += r.revenue;
  });
  if (!units) { notify('There is nothing to sell.'); return; }
  log(`${buildingName(i)} sold all its stock (${units} items) for $${revenue.toFixed(2)}.`);
  saveGame();
}

// Puts stock up for sale at your own price. It stays in the building until it sells.
function listGoods(i, item, qty, price) {
  const plot = state.plots[i];
  if (!plot || !LISTERS.includes(plot.building) || !ITEMS[item]) return false;
  if (!isStaffed(plot)) { log(`${buildingName(i)} needs staff before it can list goods.`); notify('Hire a worker first: listing needs staff.'); saveGame(); return false; }
  qty = Math.min(Math.floor(qty), plot.inv[item] || 0);
  price = round2(price);
  if (!(qty >= 1) || !(price > 0)) return false;
  const existing = state.listings.find(l => l.plot === i && l.item === item);
  if (existing) { existing.qty = qty; existing.price = price; }
  else state.listings.push({ id: ++state.listingSeq, plot: i, item, qty, price });
  log(`${buildingName(i)} listed ${qty} ${itemName(item)} at $${price.toFixed(2)}.`);
  saveGame();
  return true;
}

function cancelListing(id) {
  const l = state.listings.find(x => x.id === id);
  if (!l) return;
  state.listings = state.listings.filter(x => x.id !== id);
  log(`Cancelled the ${itemName(l.item)} listing at ${buildingName(l.plot)}.`);
  saveGame();
}

// Drops listings with nothing left to sell.
function pruneListings() {
  state.listings = state.listings.filter(l => {
    const plot = state.plots[l.plot];
    return plot.building && l.qty > 0 && (plot.inv[l.item] || 0) > 0;
  });
}

// AI buyers shop each day. The closer a price is to (or below) the fair market price,
// the more they buy; anything above 130% of fair sells nothing.
function aiBuyListings() {
  Object.keys(ITEMS).forEach(item => {
    let pool = randInt(15, 35);
    const fair = marketPrice(item);
    state.listings.filter(l => l.item === item).sort((a, b) => a.price - b.price).forEach(l => {
      const seller = state.plots[l.plot];
      const appetite = clamp((1.3 - l.price / fair) / 0.5, 0, 1);
      const n = Math.min(l.qty, seller.inv[item] || 0, Math.ceil(pool * appetite));
      if (pool <= 0 || n <= 0) return;
      seller.inv[item] -= n;
      l.qty -= n;
      pool -= n;
      seller.today.sold[item] = (seller.today.sold[item] || 0) + n;
      earn(seller, 'sale', n * l.price, `Market buyers bought ${n} ${itemName(item)} at $${l.price.toFixed(2)}`);
    });
  });
  pruneListings();
}

// ---- Delivery contracts and deliveries ----

// Works out whether a contract can go ahead and, if so, which depot carries it and what the trip costs.
function contractPlan(s, d, item, qty) {
  const fail = message => ({ ok: false, message });
  const sp = state.plots[s], dp = state.plots[d];
  if (!sp || !dp || !sp.building || !dp.building || s === d) return fail('Pick two different buildings.');
  if (!ITEMS[item]) return fail('Pick an item.');
  if (!canSupply(sp)) return fail(`${buildingName(s)} cannot send goods.`);
  if (!accepts(dp, item)) return fail(`${buildingName(d)} cannot use ${itemName(item)}.`);
  qty = Math.floor(qty);
  if (!(qty >= 1)) return fail('Enter how many to send.');
  const have = sp.inv[item] || 0;
  if (qty > have) return fail(`${buildingName(s)} only has ${have} ${itemName(item)}.`);
  if (qty > freeSpace(d)) return fail(`${buildingName(d)} only has room for ${Math.max(0, freeSpace(d))} more.`);
  const depots = state.plots.map((_p, k) => k).filter(k => state.plots[k].building === 'depot');
  if (!depots.length) return fail('Build a Transport Depot first. It supplies the trucks.');
  const staffed = depots.filter(k => operableTrucks(state.plots[k]) > 0);
  if (!staffed.length) return fail('Your Transport Depot needs a driver before trucks can leave.');
  const fits = staffed.filter(k => qty <= truckLoadAt(state.plots[k].level) && capacityOf(state.plots[k]) - usedSpace(state.plots[k]) >= qty);
  if (!fits.length) {
    const most = Math.max(...staffed.map(k => truckLoadAt(state.plots[k].level)));
    return fail(qty > most ? `A truck carries at most ${most} items. Send fewer, or upgrade the depot.` : 'The depot has no storage room left.');
  }
  fits.sort((a, b) => (freeTrucks(b) - freeTrucks(a)) || a - b);          // the depot with the most free trucks
  const depot = fits[0], level = state.plots[depot].level, distance = distanceBetween(s, d), fuel = fuelCost(distance);
  return { ok: true, depot, distance, trip: tripDaysAt(distance, level), fuel, load: truckLoadAt(level), qty,
    suggested: round2(fuel * 1.5 + qty * 0.25) };
}

// A contract: `qty` of `item` from the supplier to the destination, carried by a depot's truck.
// `fee` is the delivery price the destination pays the depot; `days` is how long the trip may take.
// The goods leave the supplier straight away and wait in the depot until a truck is free.
function createContract(s, d, item, qty, fee, days) {
  const refuse = message => { notify(message); return { ok: false, message }; };
  const plan = contractPlan(s, d, item, qty);
  if (!plan.ok) return refuse(plan.message);
  days = Math.floor(days);
  fee = round2(fee);
  if (!(days >= plan.trip)) return refuse(`The trip takes ${plan.trip} day${plan.trip === 1 ? '' : 's'}, so allow at least that long.`);
  if (days > MAX_CONTRACT_DAYS) return refuse(`A contract can allow at most ${MAX_CONTRACT_DAYS} days.`);
  if (!(fee >= 0)) return refuse('The delivery price cannot be negative.');

  const sp = state.plots[s];
  sp.inv[item] -= plan.qty;
  if (!sp.inv[item]) delete sp.inv[item];
  const delivery = {
    id: ++state.deliverySeq, kind: 'contract', supplier: s, source: buildingName(s), destination: d, item,
    qty: plan.qty, cargo: plan.qty, delivered: 0, unitPrice: sellPrice(item), paid: 0, fee, depot: plan.depot,
    days, deadline: arrivalDay(days), createdDay: state.day, pickupDay: null, arriveDay: null,
    tripDays: plan.trip, fuel: plan.fuel, status: 'pending', reason: '', endedDay: null,
  };
  state.deliveries.push(delivery);
  pruneListings();
  log(`New contract: ${plan.qty} ${itemName(item)} from ${buildingName(s)} to ${buildingName(d)} for a delivery price of $${fee.toFixed(2)}.`);
  dispatchPending();
  saveGame();
  return { ok: true, delivery };
}

// A contract still waiting for a truck can be cancelled. Its goods go back to the supplier.
function cancelContract(id) {
  const d = state.deliveries.find(x => x.id === id);
  if (!d || d.kind !== 'contract' || d.status !== 'pending') return false;
  failDelivery(d, 'You cancelled it.');
  saveGame();
  return true;
}

// Sends waiting contracts out, oldest first, as far as free trucks and drivers allow.
function dispatchPending() {
  state.deliveries.filter(d => d.kind === 'contract' && d.status === 'pending').sort((a, b) => a.id - b.id).forEach(d => {
    const depot = state.plots[d.depot];
    if (freeTrucks(d.depot) <= 0) return;                                  // wait for a free truck and driver
    const trip = tripDaysAt(distanceBetween(d.supplier, d.destination), depot.level);
    if (arrivalDay(trip) > d.deadline) { failDelivery(d, 'It could not reach its destination in time.'); return; }
    d.status = 'active';
    d.pickupDay = state.day;
    d.tripDays = trip;
    d.arriveDay = arrivalDay(trip);
    d.fuel = fuelCost(distanceBetween(d.supplier, d.destination));
    spend(depot, 'delivery', d.fuel, `Fuel to deliver ${d.qty} ${itemName(d.item)}`);
  });
}

// Puts goods back with the supplier as far as its storage allows. Returns how many had to be thrown away.
function returnCargo(i, item, n) {
  if (n <= 0) return 0;
  const plot = state.plots[i], back = Math.min(n, Math.max(0, capacityOf(plot) - usedSpace(plot)));
  if (back > 0) plot.inv[item] = (plot.inv[item] || 0) + back;
  return n - back;
}

function failDelivery(d, reason) {
  const lost = d.kind === 'contract' ? returnCargo(d.supplier, d.item, d.cargo) : 0;
  d.cargo = 0;
  d.status = 'failed';
  d.reason = lost ? `${reason} ${lost} items were lost because the supplier had no room to take them back.` : reason;
  d.endedDay = state.day;
  log(`Delivery failed: ${d.qty} ${itemName(d.item)} to ${buildingName(d.destination)}. ${reason}`);
}

// A truck has arrived: unload what fits, send the rest back, and settle the money.
function completeContract(d) {
  const dest = state.plots[d.destination], supplier = state.plots[d.supplier], depot = state.plots[d.depot];
  const n = Math.min(d.cargo, Math.max(0, capacityOf(dest) - usedSpace(dest)));
  const rest = d.cargo - n;
  if (n > 0) dest.inv[d.item] = (dest.inv[d.item] || 0) + n;
  const lost = returnCargo(d.supplier, d.item, rest);
  d.cargo = 0;
  d.delivered = n;
  d.endedDay = state.day;
  if (n === 0) {
    d.status = 'failed';
    d.reason = lost ? 'The destination had no room, and the goods were lost.' : 'The destination had no room, so the goods went back.';
    log(`Delivery failed: ${d.qty} ${itemName(d.item)} to ${buildingName(d.destination)}. ${d.reason}`);
    return;
  }
  const goods = round2(n * d.unitPrice);
  spend(dest, 'purchase', goods, `Received ${n} ${itemName(d.item)} from ${buildingName(d.supplier)}`);
  supplier.today.sold[d.item] = (supplier.today.sold[d.item] || 0) + n;
  earn(supplier, 'sale', goods, `Delivered ${n} ${itemName(d.item)} to ${buildingName(d.destination)}`);
  spend(dest, 'delivery', d.fee, `Delivery price for ${n} ${itemName(d.item)}`);
  earn(depot, 'freight', d.fee, `Delivery price from ${buildingName(d.destination)}`);
  d.status = 'completed';
  if (rest) d.reason = `Only ${n} of ${d.qty} fit. ${rest - lost} went back to the supplier${lost ? ` and ${lost} were lost` : ''}.`;
  log(`Delivered ${n} ${itemName(d.item)} from ${buildingName(d.supplier)} to ${buildingName(d.destination)}.`);
}

// Market orders arrive by themselves after a day. No truck is needed (for now).
function orderMarketDelivery(dest, item, qty, source, paid, sourcePlot) {
  const arrive = arrivalDay(AI_DELIVERY_DAYS);
  const same = state.deliveries.find(d => d.kind === 'market' && d.status === 'active' && d.destination === dest
    && d.item === item && d.source === source && d.arriveDay === arrive);
  if (same) { same.qty += qty; same.cargo += qty; same.paid = round2(same.paid + paid); return same; }
  const delivery = {
    id: ++state.deliverySeq, kind: 'market', supplier: sourcePlot, source, destination: dest, item, qty, cargo: qty,
    delivered: 0, unitPrice: 0, paid, fee: 0, depot: null, days: AI_DELIVERY_DAYS, deadline: arrive, createdDay: state.day,
    pickupDay: state.day, arriveDay: arrive, tripDays: AI_DELIVERY_DAYS, fuel: 0, status: 'active', reason: '', endedDay: null,
  };
  state.deliveries.push(delivery);
  return delivery;
}

function arriveMarket(d) {
  const dest = state.plots[d.destination];
  const n = Math.min(d.cargo, Math.max(0, capacityOf(dest) - usedSpace(dest)));
  if (n > 0) dest.inv[d.item] = (dest.inv[d.item] || 0) + n;
  d.delivered = n;
  d.cargo = 0;
  d.endedDay = state.day;
  d.status = n > 0 ? 'completed' : 'failed';
  if (n < d.qty) d.reason = n > 0 ? `Only ${n} of ${d.qty} fit in storage.` : 'There was no room in storage.';
}

// Keeps everything still travelling, plus the newest finished contracts and the newest finished market
// orders. They are counted separately so a flood of daily market orders never pushes contracts out.
function pruneDeliveries() {
  const drop = new Set();
  [['contract', DELIVERY_HISTORY], ['market', MARKET_HISTORY]].forEach(([kind, keep]) => {
    const ended = state.deliveries.filter(d => d.kind === kind && !inTransit(d)).sort((a, b) => a.id - b.id);
    ended.slice(0, Math.max(0, ended.length - keep)).forEach(d => drop.add(d.id));
  });
  if (drop.size) state.deliveries = state.deliveries.filter(d => !drop.has(d.id));
}

// Start of every day: unload what has arrived, give up on contracts that ran out of time, and send trucks out.
function processDeliveries() {
  state.deliveries.filter(d => d.status === 'active' && d.arriveDay <= state.day).sort((a, b) => a.id - b.id)
    .forEach(d => { if (d.kind === 'contract') completeContract(d); else arriveMarket(d); });
  state.deliveries.filter(d => d.kind === 'contract' && d.status === 'pending' && arrivalDay(1) > d.deadline)
    .forEach(d => failDelivery(d, 'No truck was free in time.'));
  dispatchPending();
  pruneDeliveries();
}

// ---- The daily simulation ----

// Farms grow crops; factories make products from ingredients on hand. Unstaffed = nothing.
function produceGoods(plot, i) {
  if (plot.building !== 'farm' && plot.building !== 'factory') return;
  const report = plot.today;
  if (!isStaffed(plot)) { report.note = 'No workers: produced nothing.'; report.issue = 'staff'; return; }
  const eff = totalEfficiency(plot), cap = capacityOf(plot);

  if (plot.building === 'farm') {
    const amount = farmYield(plot.level, eff, i);
    FARM_ITEMS.forEach(item => {
      const n = Math.min(amount, cap - usedSpace(plot));
      if (n <= 0) { report.note = 'Storage full: sell or list some stock.'; report.issue = 'full'; return; }
      plot.inv[item] = (plot.inv[item] || 0) + n;
      report.produced[item] = n;
    });
    return;
  }

  // Factory: rotate through recipes, skipping any whose ingredients are not on hand.
  const batches = factoryBatches(plot.level, eff);
  const blocked = new Set();
  let turn = 0;
  for (let n = 0; n < batches; n++) {
    const options = RECIPES.filter(r => !blocked.has(r.out));
    if (!options.length) break;
    const recipe = options[turn++ % options.length];
    if (!hasInputs(plot, recipe)) { blocked.add(recipe.out); continue; }
    const inputs = Object.values(recipe.in).reduce((a, b) => a + b, 0);
    if (recipe.qty > inputs && usedSpace(plot) + recipe.qty - inputs > cap) { report.note = 'Storage full: sell or list some stock.'; report.issue = 'full'; break; }
    Object.entries(recipe.in).forEach(([item, need]) => { plot.inv[item] -= need; });
    plot.inv[recipe.out] = (plot.inv[recipe.out] || 0) + recipe.qty;
    report.produced[recipe.out] = (report.produced[recipe.out] || 0) + recipe.qty;
  }
  restockFactory(plot, i);                                                 // order tomorrow's ingredients
  if (!Object.keys(report.produced).length && !report.issue) {
    report.issue = incomingTo(i) > 0 ? 'waiting' : 'stock';
    report.note = report.issue === 'waiting' ? 'Waiting for ingredients to arrive.' : 'No ingredients on hand, and none could be ordered (no cash?).';
  }
}

const hasInputs = (plot, recipe) => Object.entries(recipe.in).every(([item, need]) => (plot.inv[item] || 0) >= need);

// Orders whatever is short of `need` (item -> units), counting stock already here or already on its way.
function orderShortfall(plot, i, need) {
  Object.entries(need).forEach(([item, n]) => {
    const short = n - (plot.inv[item] || 0) - incomingTo(i, item);
    if (short > 0) buyInventory(i, item, short);
  });
}

// A factory orders the ingredients for tomorrow's batches.
function restockFactory(plot, i) {
  const batches = factoryBatches(plot.level, totalEfficiency(plot));
  const need = {};
  for (let n = 0; n < batches; n++) {
    Object.entries(RECIPES[n % RECIPES.length].in).forEach(([item, q]) => { need[item] = (need[item] || 0) + q; });
  }
  orderShortfall(plot, i, need);
}

// A shop, cafe or hotel orders the stock it expects to need tomorrow (a little extra, since customers vary).
function restockRetail(plot, i) {
  const cfg = RETAIL[plot.building];
  const r = retailWants(plot.building, plot.level, totalEfficiency(plot), i, plot.priceMult, RESTOCK_LUCK);
  const need = {};
  cfg.items.forEach(item => { need[item] = cfg.fee ? Math.ceil(r.guests / cfg.items.length) : r.want[item]; });
  orderShortfall(plot, i, need);
}

// Shops, cafes and hotels: sell/consume the stock on hand for the day's customers, then order
// tomorrow's stock. Nothing is earned without workers and stock that has actually arrived.
function serveCustomers(plot, i) {
  const cfg = RETAIL[plot.building];
  if (!cfg) return;
  const report = plot.today;
  if (!isStaffed(plot)) { report.note = 'No workers: earned nothing.'; report.issue = 'staff'; return; }

  const r = retailWants(plot.building, plot.level, totalEfficiency(plot), i, plot.priceMult, rand(0.7, 1.3));
  if (cfg.fee) serveGuests(plot, cfg, r.guests);
  else sellItems(plot, cfg, r.want);
  restockRetail(plot, i);

  if (!Object.keys(report.sold).length) {
    report.issue = incomingTo(i) > 0 ? 'waiting' : 'stock';
    report.note = r.capacity < 1 ? 'Staff too slow to serve anyone.'
      : report.issue === 'waiting' ? 'Waiting for stock to arrive.' : 'No stock and none ordered: earned nothing.';
  }
}

function sellItems(plot, cfg, want) {
  cfg.items.forEach(item => {
    const n = Math.min(want[item], plot.inv[item] || 0);
    if (n <= 0) return;
    plot.inv[item] -= n;
    plot.today.sold[item] = n;
    earn(plot, 'sale', n * salePrice(plot, item), `Sold ${n} ${itemName(item)} at $${salePrice(plot, item).toFixed(2)}`);
  });
}

// Each guest pays the room rate and needs one breakfast item from stock.
function serveGuests(plot, cfg, guests) {
  let served = 0, turn = 0;
  for (let g = 0; g < guests; g++) {
    const item = cfg.items.map((_, k) => cfg.items[(turn + k) % cfg.items.length]).find(it => (plot.inv[it] || 0) > 0);
    if (!item) break;
    turn = cfg.items.indexOf(item) + 1;
    plot.inv[item]--;
    plot.today.sold[item] = (plot.today.sold[item] || 0) + 1;
    served++;
  }
  if (served) earn(plot, 'sale', served * salePrice(plot, 'room'), `${served} guests at $${salePrice(plot, 'room').toFixed(2)}`);
}

// Apartments collect rent; warehouses collect storage contracts. Both need staff.
function collectRent(plot, i) {
  if (plot.building !== 'apartment' && plot.building !== 'warehouse') return;
  if (!isStaffed(plot)) { plot.today.note = 'No workers: earned nothing.'; plot.today.issue = 'staff'; return; }
  if (plot.building === 'apartment') earn(plot, 'rent', rentPerDay(plot.level, totalEfficiency(plot), i), 'Collected rent');
  else earn(plot, 'rent', storageContracts(plot.level), 'Storage contracts');
}

// Every worker is paid. Cash may go negative. Returns the total paid.
function payWages() {
  let total = 0;
  state.plots.forEach(plot => {
    const wages = plot.workers.reduce((sum, w) => sum + w.wage, 0);
    if (wages <= 0) return;
    spend(plot, 'wages', wages, `Paid ${plot.workers.length} worker${plot.workers.length === 1 ? '' : 's'}`);
    total += wages;
  });
  return round2(total);
}

// Every building costs money to keep up, plus a small fee per unit in storage.
function payMaintenance() {
  let total = 0;
  state.plots.forEach(plot => {
    if (!plot.building) return;
    const cost = maintenanceOf(plot);
    if (cost <= 0) return;
    spend(plot, 'maintenance', cost, `Upkeep for the ${plot.building === 'depot' ? 'depot and its trucks' : 'building'}, ${usedSpace(plot)} units stored`);
    total += cost;
  });
  return round2(total);
}

// Every owned plot pays a small daily tax on land plus building value.
function payPropertyTax() {
  let total = 0;
  state.plots.forEach((plot, i) => {
    if (!plot.owned) return;
    const tax = propertyTaxPerDay(i);
    if (tax <= 0) return;
    spend(plot, 'propertyTax', tax, 'Daily tax on the land and building');
    total += tax;
  });
  return round2(total);
}

// Each business pays a share of its own positive daily profit (after all its costs).
function payProfitTax() {
  let total = 0;
  state.plots.forEach(plot => {
    if (!plot.building) return;
    const r = plot.today;
    const profit = round2(r.revenue - dayCosts(r));
    if (profit <= 0) return;
    const tax = round2(profit * PROFIT_TAX);
    spend(plot, 'profitTax', tax, `${Math.round(PROFIT_TAX * 100)}% of $${profit.toFixed(2)} profit`);
    total += tax;
  });
  return round2(total);
}

// Today's inflation is a small random change; prices, land and building costs follow it.
function applyInflation() {
  state.inflationRate = Math.round(rand(-0.001, 0.004) * 10000) / 10000;
  state.inflation = Math.round(clamp(state.inflation * (1 + state.inflationRate), 0.8, 5) * 10000) / 10000;
  allWorkers().forEach(w => { w.wage = round2(w.wage * (1 + state.inflationRate)); });   // workers get the raise too
}

// Supplier prices wander around base x inflation x their own bias; stock refills.
function updateMarket() {
  state.market.forEach(l => {
    l.prev = l.price;
    const target = ITEMS[l.item].base * state.inflation * l.bias;
    l.price = round2(clamp(l.price * (1 + rand(-0.08, 0.08)) + (target - l.price) * 0.2, target * 0.6, target * 1.6));
    l.stock = Math.min(150, l.stock + randInt(15, 35));
  });
}

// One day: production, wages, upkeep and property tax, sales, market buyers, profit tax,
// then inflation and new market prices for tomorrow.
// In multiplayer this entire function will run only on the server, triggered by a
// scheduled Cloudflare Worker. Browser clients will receive the resulting snapshot.
function runWorldDay(expectedDay = state.day) {
  if (processing || expectedDay !== state.day) return { ok: false, reason: 'stale-day' };
  processing = true;
  try {
    processDeliveries();                                   // trucks and orders that arrive today, before anything is used
    state.plots.forEach((plot, i) => { if (plot.building) produceGoods(plot, i); });
    const wages = payWages();
    const maintenance = payMaintenance();
    const propertyTax = payPropertyTax();
    state.plots.forEach((plot, i) => {
      if (!plot.building) return;
      serveCustomers(plot, i);
      collectRent(plot, i);
    });
    aiBuyListings();
    const profitTax = payProfitTax();
    const loans = payLoans();                              // last, so the day's sales have already come in

    const operating = round2(state.plots.reduce((sum, p) => sum + dayProfit(p.today), 0));
    const profit = round2(operating - loans.interest - loans.fees);       // interest and late fees are costs; paying back principal is not
    const delivery = round2(state.plots.reduce((sum, p) => sum + p.today.delivery, 0));
    state.plots.forEach((plot, i) => {
      // Tell the player once when a building runs into a problem, not every day it stays that way.
      const issue = plot.today.issue;
      if (plot.building && issue && issue !== 'waiting' && issue !== plot.last.issue) log(issueEvent(i, issue));
      plot.last = plot.today;
      plot.today = blankReport();
    });
    state.lastDay = { profit, wages, maintenance, delivery, propertyTax, profitTax, interest: loans.interest, lateFees: loans.fees, principal: loans.principal };
    state.bank.profits.push(operating);                    // the credit score looks at profit before loan costs
    if (state.bank.profits.length > BANK_WINDOW) state.bank.profits.shift();

    applyInflation();
    state.bank.inflation.push(state.inflationRate);
    if (state.bank.inflation.length > BANK_WINDOW) state.bank.inflation.shift();
    updateMarket();
    state.day++;
  } finally {
    processing = false;
  }
  saveGame();
  return { ok: true, day: state.day };
}

const ISSUE_EVENT = { staff: 'has no workers', stock: 'ran out of stock', full: 'is out of storage space' };
const issueEvent = (i, issue) => `${buildingName(i)} ${ISSUE_EVENT[issue]}.`;

// Local implementation of the boundary the future server API will implement.
class LocalGameService {
  getSnapshot() { return typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state)); }
  setCompanyIdentity(name, symbol, color) { return setCompanyIdentity(name, symbol, color); }
  getWorldOverview() { return Array.from({ length: WORLD_CITY_COUNT }, (_, cityId) => citySummary(cityId)); }
  buyPlot(id) { return buyPlot(id); }
  buyPlots(ids) { return buyPlots(ids); }
  build(id, type) { return build(id, type); }
  buildMany(ids, type) { return buildMany(ids, type); }
  upgradeBuilding(id) { return upgradeBuilding(id); }
  hireWorker(id, role) { return hireWorker(id, role); }
  fireWorker(id, workerIndex) { return fireWorker(id, workerIndex); }
  buyInventory(id, item, qty) { return tradeManually(id, 'buy', item, qty); }
  sellInventory(id, item, qty) { return tradeManually(id, 'sell', item, qty); }
  sellAllInventory(id) { return sellAllStock(id); }
  createListing(id, item, qty, price) { return listGoods(id, item, qty, price); }
  cancelListing(id) { return cancelListing(id); }
  setRetailPrice(id, item, price) { return setPrice(id, item, price); }
  createDelivery(supplier, destination, item, qty, fee, days) { return createContract(supplier, destination, item, qty, fee, days); }
  cancelDelivery(id) { return cancelContract(id); }
  createLoan(amount, term, expectedRate) { return takeLoan(amount, term, expectedRate); }
  payOffLoan(id) { return repayLoan(id); }
  runWorldDay(expectedDay) { return runWorldDay(expectedDay); }
}

const gameService = new LocalGameService();
