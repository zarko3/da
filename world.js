import { DurableObject } from 'cloudflare:workers';
import { createCore } from './game-core.js';

// The shared world. One instance holds every player's company.
//
// Rules are the same game.js the browser uses. For each action the player's saved company is loaded into
// the game core, the action runs, and the result is saved back. The world clock, inflation, supplier prices
// and city events are shared by everyone and only change in tick(). Land can belong to one player only.

const DEFAULT_DAY_MS = 3600000;
const MAX_CATCH_UP_DAYS = 48;
const SHARED_KEYS = ['day', 'inflation', 'inflationRate', 'market', 'events'];
const NOT_ACTIONS = new Set(['constructor', 'getSnapshot', 'getWorldOverview', 'getPerks', 'getAchievements',
  'getCityEvents', 'runWorldDay', 'checkMilestones']);
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const PBKDF2_ITERATIONS = 100000;      // the most Workers allow
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, error) => json({ ok: false, error }, status);

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return toB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256));
}

async function sha256(text) {
  return toB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clone = value => structuredClone(value);

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = createCore();
    this.dayMs = Number(env.DAY_MS) || DEFAULT_DAY_MS;
    this.ready = ctx.blockConcurrencyWhile(() => this.load());
    this.failures = new Map();
  }

  // ---- Storage ----

  async load() {
    const stored = await this.ctx.storage.list();
    this.players = new Map();
    this.sessions = new Map();
    for (const [key, value] of stored) {
      if (key.startsWith('p:')) this.players.set(key.slice(2), value);
      else if (key.startsWith('s:')) this.sessions.set(key.slice(2), value);
    }
    this.owners = stored.get('owners') || {};
    this.shared = stored.get('shared');
    if (!this.shared) {
      const fresh = this.core.newGame();
      this.shared = Object.assign(this.extractShared(fresh), { lastTick: Date.now() });
      await this.ctx.storage.put('shared', this.shared);
    }
    await this.scheduleAlarm();
  }

  extractShared(state) {
    const out = {};
    SHARED_KEYS.forEach(key => { out[key] = clone(state[key]); });
    return out;
  }

  applyShared(state, shared) {
    SHARED_KEYS.forEach(key => { state[key] = clone(shared[key]); });
    state.lastTick = this.shared.lastTick;
  }

  async scheduleAlarm() {
    await this.ctx.storage.setAlarm(this.shared.lastTick + this.dayMs);
  }

  // ---- Running a player's company through the game rules ----

  // `withOffers`: let this company buy from the other players' listings during the action.
  open(record, withOffers = false) {
    const save = clone(record.save);
    save.online = { listings: withOffers ? this.offersFor(record.key) : [] };
    this.core.state = this.core.hydrateGame(save);
    this.core.clearNotices();
  }

  // What every other company has listed and really holds right now.
  offersFor(exceptKey) {
    const offers = [];
    for (const other of this.players.values()) {
      if (other.key === exceptKey) continue;
      const plots = new Map((other.save.plots || []).map(p => [p.id, p]));
      for (const l of other.save.listings || []) {
        const plot = plots.get(l.plot);
        const avail = Math.min(l.qty, plot && plot.inv ? plot.inv[l.item] || 0 : 0);
        if (!plot || !plot.building || plot.closed || avail <= 0) continue;
        offers.push({ id: l.id, owner: other.username, plot: l.plot, building: plot.building, item: l.item, qty: l.qty, avail, price: l.price });
      }
    }
    return offers;
  }

  close(record) {
    record.save = this.core.serializeGame(this.core.state);
    delete record.save.online;
    record.netWorth = Math.round(this.core.netWorth());
    record.company = this.core.state.company;
  }

  ownedPlots(state) {
    const ids = [];
    state.plots.forEach((plot, id) => { if (plot.owned) ids.push(id); });
    return ids;
  }

  async savePlayer(record) {
    await this.ctx.storage.put(`p:${record.username}`, record);
  }

  async saveOwners() {
    await this.ctx.storage.put('owners', this.owners);
  }

  // ---- Daily tick ----

  async alarm() {
    await this.ready;
    let days = 0;
    while (Date.now() >= this.shared.lastTick + this.dayMs && days < MAX_CATCH_UP_DAYS) {
      await this.tick();
      days++;
    }
    if (days === MAX_CATCH_UP_DAYS) this.shared.lastTick = Date.now() - this.dayMs + 1000;
    await this.ctx.storage.put('shared', this.shared);
    await this.scheduleAlarm();
  }

  // One world day. Everybody's costs for the day use the same prices; afterwards everybody receives the
  // same new inflation, supplier prices and events (worked out once, on a company that belongs to nobody).
  async tick() {
    const before = this.shared;
    const ghost = this.core.newGame();
    this.applyShared(ghost, before);
    this.core.state = ghost;
    this.core.gameService.runWorldDay(before.day);
    const after = Object.assign(this.extractShared(ghost), { lastTick: before.lastTick + this.dayMs });

    for (const record of this.players.values()) {
      this.open(record);
      this.applyShared(this.core.state, before);
      this.core.gameService.runWorldDay(before.day);
      this.applyShared(this.core.state, after);
      this.core.state.lastTick = after.lastTick;
      this.close(record);
      await this.savePlayer(record);
    }
    this.shared = after;
    await this.ctx.storage.put('shared', after);
  }

  // ---- HTTP ----

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    try {
      if (route === 'POST /api/register') return await this.register(request);
      if (route === 'POST /api/login') return await this.login(request);
      if (route === 'GET /api/leaderboard') return this.leaderboard();
      if (route === 'GET /api/snapshot' || route === 'POST /api/action' || route === 'POST /api/logout') {
        const record = await this.authenticate(request);
        if (!record) return fail(401, 'Please sign in again.');
        if (route === 'GET /api/snapshot') return json(this.snapshot(record));
        if (route === 'POST /api/logout') return await this.logout(request);
        return await this.action(record, request);
      }
    } catch (e) {
      if (e instanceof SyntaxError) return fail(400, 'Bad request.');
      console.error(e);
      return fail(500, 'Server error.');
    }
    return fail(404, 'Not found.');
  }

  async readBody(request) {
    const text = await request.text();
    if (text.length > 20000) throw new SyntaxError('too large');
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object') throw new SyntaxError('not an object');
    return body;
  }

  tooManyFailures(name) {
    const now = Date.now();
    const recent = (this.failures.get(name) || []).filter(t => now - t < FAILURE_WINDOW_MS);
    this.failures.set(name, recent);
    return recent.length >= MAX_FAILURES;
  }

  async register(request) {
    const { username, password } = await this.readBody(request);
    if (typeof username !== 'string' || !USERNAME.test(username)) return fail(400, 'Username must be 3-20 letters, numbers or underscores.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) return fail(400, 'Password must be at least 8 characters.');
    const key = username.toLowerCase();
    if (this.players.has(key)) return fail(409, 'That username is taken.');

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const state = this.core.newGame();
    this.applyShared(state, this.shared);
    this.core.state = state;
    const record = { username, key, salt: toB64(salt), hash: await hashPassword(password, salt), created: Date.now() };
    this.close(record);
    this.players.set(key, record);
    await this.savePlayer(record);
    return json(await this.startSession(record));
  }

  async login(request) {
    const { username, password } = await this.readBody(request);
    if (typeof username !== 'string' || typeof password !== 'string') return fail(400, 'Enter a username and password.');
    const key = username.toLowerCase();
    if (this.tooManyFailures(key)) return fail(429, 'Too many attempts. Try again in a few minutes.');
    const record = this.players.get(key);
    // Hash even for unknown users so the response time does not reveal which usernames exist.
    const salt = record ? fromB64(record.salt) : new Uint8Array(16);
    const hash = await hashPassword(password, salt);
    if (!record || !sameText(hash, record.hash)) {
      this.failures.get(key).push(Date.now());
      return fail(401, 'Wrong username or password.');
    }
    return json(await this.startSession(record));
  }

  async startSession(record) {
    const token = toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '');
    const id = await sha256(token);
    this.sessions.set(id, record.key);
    await this.ctx.storage.put(`s:${id}`, record.key);
    return { ok: true, token, ...this.snapshot(record) };
  }

  async authenticate(request) {
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const key = this.sessions.get(await sha256(header.slice(7)));
    return key ? this.players.get(key) || null : null;
  }

  async logout(request) {
    const id = await sha256((request.headers.get('Authorization') || '').slice(7));
    this.sessions.delete(id);
    await this.ctx.storage.delete(`s:${id}`);
    return json({ ok: true });
  }

  snapshot(record) {
    return {
      ok: true,
      save: record.save,
      online: { username: record.username, owners: this.owners, listings: this.offersFor(record.key), players: this.players.size, nextDayAt: this.shared.lastTick + this.dayMs, dayMs: this.dayMs },
    };
  }

  leaderboard() {
    const rows = [...this.players.values()]
      .map(p => ({ username: p.username, company: p.company ? p.company.name : null, netWorth: p.netWorth || 0 }))
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, 50);
    return json({ ok: true, day: this.shared.day, rows });
  }

  async action(record, request) {
    const { method, args = [] } = await this.readBody(request);
    const allowed = Object.getOwnPropertyNames(this.core.LocalGameService.prototype).filter(n => !NOT_ACTIONS.has(n));
    if (typeof method !== 'string' || !allowed.includes(method) || !Array.isArray(args) || args.length > 8) return fail(400, 'Unknown action.');

    this.open(record, true);
    this.applyShared(this.core.state, this.shared);
    const state = this.core.state;
    const had = this.ownedPlots(state);

    if (method === 'buyPlot' || method === 'buyPlots') {
      const wanted = method === 'buyPlot' ? [args[0]] : args[0];
      if (Array.isArray(wanted) && wanted.some(id => this.owners[id] && this.owners[id] !== record.username)) {
        return json({ ok: true, result: { ok: false, reason: 'unavailable' }, ...this.snapshot(record) });
      }
    }
    if (method === 'setCompanyIdentity') {
      const name = typeof args[0] === 'string' ? args[0].trim().toLowerCase() : '';
      for (const other of this.players.values()) {
        if (other !== record && other.company && other.company.name.toLowerCase() === name) {
          return json({ ok: true, result: { ok: false, reason: 'company-name-taken' }, ...this.snapshot(record) });
        }
      }
    }

    const result = this.core.gameService[method](...args);

    const has = this.ownedPlots(this.core.state);
    let ownersChanged = false;
    had.filter(id => !has.includes(id)).forEach(id => { if (this.owners[id] === record.username) { delete this.owners[id]; ownersChanged = true; } });
    has.forEach(id => { if (this.owners[id] !== record.username) { this.owners[id] = record.username; ownersChanged = true; } });

    const sales = this.core.state.rivalSales || [];
    const buyerLabel = (this.core.state.company && this.core.state.company.name) || record.username;
    this.close(record);
    await this.savePlayer(record);
    if (ownersChanged) await this.saveOwners();
    await this.settleSales(sales, buyerLabel);
    return json({ ok: true, result, ...this.snapshot(record) });
  }

  // Pays the sellers whose goods another player just bought.
  async settleSales(sales, buyerLabel) {
    for (const sale of sales) {
      const seller = this.players.get(String(sale.owner).toLowerCase());
      if (!seller) continue;
      this.open(seller);
      this.applyShared(this.core.state, this.shared);
      const settled = this.core.settleRivalSale(sale, buyerLabel);
      if (!settled.ok) console.error('sale could not be settled', JSON.stringify(sale));
      this.close(seller);
      await this.savePlayer(seller);
    }
  }
}
