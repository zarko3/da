'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadGameContext } = require('./game-harness');

function loadService() {
  const loaded = loadGameContext();
  vm.runInContext(`globalThis.__serviceTestApi = {
    LocalGameService, gameService, buyPlots, buildMany, runWorldDay,
    LOCAL_DEVELOPMENT_DAY_MS, MULTIPLAYER_WORLD_DAY_MS
  };`, loaded.context);
  return Object.assign(loaded, { serviceApi: loaded.context.__serviceTestApi });
}

test('game service exposes snapshots without exposing mutable state', () => {
  const { api, serviceApi } = loadService();
  const snapshot = serviceApi.gameService.getSnapshot();
  snapshot.cash = 1;
  assert.equal(api.state.cash, 6000);
});

test('company identity is normalized, saved, and included in snapshots', () => {
  const { api, storage, serviceApi } = loadService();
  const beforeWrites = storage.writes.length;
  const result = serviceApi.gameService.setCompanyIdentity('  North   Star  ', 'factory', 'plum');

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, company: { name: 'North Star', symbol: 'factory', color: 'plum' } });
  assert.deepEqual(JSON.parse(JSON.stringify(serviceApi.gameService.getSnapshot().company)), { name: 'North Star', symbol: 'factory', color: 'plum' });
  assert.deepEqual(JSON.parse(JSON.stringify(api.state.company)), { name: 'North Star', symbol: 'factory', color: 'plum' });
  assert.equal(storage.writes.length, beforeWrites + 1);
});

test('company identity rejects unsafe names and unknown presets without changing the save', () => {
  const { api, storage, serviceApi } = loadService();
  const beforeWrites = storage.writes.length;

  assert.equal(serviceApi.gameService.setCompanyIdentity('<script>', 'factory', 'plum').ok, false);
  assert.equal(serviceApi.gameService.setCompanyIdentity('North Star', 'unknown', 'plum').ok, false);
  assert.equal(serviceApi.gameService.setCompanyIdentity('North Star', 'factory', 'unknown').ok, false);
  assert.equal(api.state.company, null);
  assert.equal(storage.writes.length, beforeWrites);
});

test('buyPlots normalizes duplicates and charges exact current prices once', () => {
  const { api, storage, serviceApi } = loadService();
  const beforeWrites = storage.writes.length;
  const result = serviceApi.gameService.buyPlots([0, 0, 1]);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.plotIds), [0, 1]);
  assert.equal(result.total, 2400);
  assert.equal(api.state.cash, 3600);
  assert.equal(api.state.plots[0].owned, true);
  assert.equal(api.state.plots[1].owned, true);
  assert.equal(storage.writes.length, beforeWrites + 1);
});

test('buyPlots is all-or-nothing for invalid, owned, and unaffordable selections', () => {
  const { api, serviceApi } = loadService();
  api.state.plots[0].owned = true;
  const cash = api.state.cash;
  assert.equal(serviceApi.gameService.buyPlots([1, 4500]).ok, false);
  assert.equal(serviceApi.gameService.buyPlots([0, 1]).ok, false);
  assert.equal(serviceApi.gameService.buyPlots([112, 113]).ok, false);
  assert.equal(api.state.cash, cash);
  assert.equal(api.state.plots[1].owned, false);
  assert.equal(api.state.plots[112].owned, false);
});

test('buildMany validates the whole selection before mutating or charging', () => {
  const { api, serviceApi } = loadService();
  api.state.cash = 10000;
  api.state.plots[0].owned = true;
  api.state.plots[1].owned = true;
  const built = serviceApi.gameService.buildMany([0, 1, 1], 'farm');
  assert.equal(built.ok, true);
  assert.equal(built.total, 4400);
  assert.equal(api.state.cash, 5600);
  assert.equal(api.state.plots[0].building, 'farm');
  assert.equal(api.state.plots[1].building, 'farm');

  api.state.plots[2].owned = true;
  const cash = api.state.cash;
  const failed = serviceApi.gameService.buildMany([1, 2], 'shop');
  assert.equal(failed.ok, false);
  assert.equal(api.state.cash, cash);
  assert.equal(api.state.plots[2].building, null);
});

test('runWorldDay is guarded against processing the same expected day twice', () => {
  const { api, serviceApi } = loadService();
  assert.equal(serviceApi.LOCAL_DEVELOPMENT_DAY_MS, 4000);
  assert.equal(serviceApi.MULTIPLAYER_WORLD_DAY_MS, 3600000);
  const expected = api.state.day;
  assert.equal(serviceApi.gameService.runWorldDay(expected).ok, true);
  assert.equal(api.state.day, expected + 1);
  assert.equal(serviceApi.gameService.runWorldDay(expected).ok, false);
  assert.equal(api.state.day, expected + 1);
});
