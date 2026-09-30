'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, loadGameContext } = require('./game-harness');

test('twenty 15x15 cities use stable global plot IDs', () => {
  const { api } = loadGameContext();
  assert.equal(api.CITY_WIDTH, 15);
  assert.equal(api.CITY_HEIGHT, 15);
  assert.equal(api.WORLD_CITY_COUNT, 20);
  assert.equal(api.CITY_PLOT_COUNT, 225);
  assert.equal(api.WORLD_PLOT_COUNT, 4500);
  assert.equal(api.plotIdAt(0, 0, 0), 0);
  assert.equal(api.plotIdAt(19, 14, 14), 4499);
  assert.deepEqual(JSON.parse(JSON.stringify(api.plotCoords(4499))), { city: 19, x: 14, y: 14 });
  assert.equal(api.cityOfPlot(4499), 19);
  assert.equal(api.isValidPlotId(-1), false);
  assert.equal(api.isValidPlotId(4500), false);
  assert.equal(api.plotLabel(225), 'Riverside 1,1');
});

test('legacy 10x10 plots move intact to the central city', () => {
  const { api } = loadGameContext();
  assert.equal(api.migrateLegacyPlotId(0), 32);
  assert.equal(api.migrateLegacyPlotId(99), 176);
  assert.equal(api.distanceBetween(api.migrateLegacyPlotId(0), api.migrateLegacyPlotId(99)), 18);
  assert.equal(api.distanceBetween(api.migrateLegacyPlotId(45), api.migrateLegacyPlotId(54)), 2);
});

test('new games use schema 3 and a dense 4500-plot runtime world', () => {
  const { api } = loadGameContext();
  assert.equal(api.state.schemaVersion, 3);
  assert.equal(api.state.plots.length, 4500);
});

test('current saves without company identity still load with all progress', () => {
  const { api } = loadGameContext();
  const saved = api.serializeGame(api.newGame());
  delete saved.company;
  saved.cash = 4321;

  const loaded = api.hydrateGame(saved);
  assert.equal(loaded.cash, 4321);
  assert.equal(loaded.company, null);
});

test('city summaries report land and company activity without changing state', () => {
  const { api } = loadGameContext();
  api.state.plots[0].owned = true;
  api.state.plots[1].owned = true;
  api.state.plots[1].building = 'farm';
  const cash = api.state.cash;
  const summary = JSON.parse(JSON.stringify(api.citySummary(0)));
  assert.deepEqual(summary, {
    id: 0,
    name: 'Founders City',
    plots: 225,
    available: 223,
    owned: 2,
    empty: 1,
    buildings: 1,
    averageLandPrice: 1704,
    cheapestLand: 1200,
  });
  assert.equal(api.state.cash, cash);
});

test('legacy saves migrate every plot reference and preserve a raw backup', () => {
  const plots = Array.from({ length: 100 }, () => ({ owned: false }));
  plots[0] = { owned: true, building: 'farm', level: 1, workers: [], inv: {}, priceMult: {} };
  const legacy = {
    cash: 1234,
    day: 8,
    plots,
    listings: [{ id: 1, plot: 0, item: 'wheat', qty: 2, price: 7 }],
    deliveries: [
      { supplier: 0, destination: 99, depot: 45 },
      { supplier: 'Metro Wholesale', destination: 1, depot: null },
    ],
  };
  const raw = JSON.stringify(legacy);
  const storage = createStorage({ 'plot-tycoon-v3': raw });
  const { api } = loadGameContext({ storage });
  assert.equal(api.state.plots[32].owned, true);
  assert.equal(api.state.listings[0].plot, 32);
  assert.equal(api.state.deliveries[0].supplier, 32);
  assert.equal(api.state.deliveries[0].destination, 176);
  assert.equal(api.state.deliveries[0].depot, 97);
  assert.equal(api.state.deliveries[1].supplier, 'Metro Wholesale');
  assert.equal(api.state.deliveries[1].destination, 33);
  assert.equal(api.state.deliveries[1].depot, null);
  assert.equal(storage.value('plot-tycoon-v3-backup-schema-1'), raw);
});

test('temporary 64x64 schema 2 saves migrate into the twenty-city layout', () => {
  const { api } = loadGameContext();
  const temporary = {
    schemaVersion: 2,
    cash: 5000,
    plots: [{ id: 1755, owned: true, building: null }],
    listings: [{ id: 1, plot: 1755, item: 'wheat', qty: 1, price: 5 }],
    deliveries: [],
  };
  const loaded = api.hydrateGame(temporary);
  assert.equal(loaded.schemaVersion, 3);
  assert.equal(loaded.plots[32].owned, true);
  assert.equal(loaded.listings[0].plot, 32);
});

test('sparse saves round-trip modified plots without storing blank land', () => {
  const { api } = loadGameContext();
  const game = api.newGame();
  game.plots[1000].owned = true;
  game.plots[1000].building = 'farm';
  game.plots[1000].inv.wheat = 12;
  const saved = api.serializeGame(game);
  const sparseLength = JSON.stringify(saved).length;
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.plots.length, 1);
  assert.equal(saved.plots[0].id, 1000);
  const loaded = api.hydrateGame(saved);
  assert.equal(loaded.plots.length, 4500);
  assert.equal(loaded.plots[1000].building, 'farm');
  assert.equal(loaded.plots[1000].inv.wheat, 12);
  assert.equal(loaded.plots[999].owned, false);
  assert.ok(sparseLength < JSON.stringify(game).length / 10);
});
