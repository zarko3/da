'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const writes = [];
  return {
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      const text = String(value);
      values.set(key, text);
      writes.push({ key, value: text });
    },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); },
  };
}

function loadGameContext({ storage = createStorage(), now = 1_000_000 } = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const context = vm.createContext({
    console,
    localStorage: storage,
    Date: class extends Date { static now() { return now; } },
    Math: Object.create(Math),
    structuredClone: global.structuredClone,
  });
  vm.runInContext(`${source}\n;globalThis.__gameTestApi = {
    CITY_WIDTH, CITY_HEIGHT, WORLD_CITY_COUNT, CITY_PLOT_COUNT, WORLD_PLOT_COUNT, SAVE_SCHEMA_VERSION,
    SAVE_KEY, state, blankPlot, newGame, loadGame, saveGame,
    plotIdAt, plotCoords, isValidPlotId, migrateLegacyPlotId, cityOfPlot,
    districtOf, distanceBetween, plotLabel, citySummary, serializeGame, hydrateGame
  };`, context, { filename: 'game.js' });
  return { context, api: context.__gameTestApi, storage };
}

module.exports = { createStorage, loadGameContext };
