'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('controller defaults to one 15x15 city centered on its downtown', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ viewportWidth: 520, viewportHeight: 400 });
  assert.equal(map.width, 15);
  assert.equal(map.height, 15);
  const center = map.screenToWorld(260, 200);
  assert.ok(Math.abs(center.x / 52 - 7.5) < 0.01);
  assert.ok(Math.abs(center.y / 52 - 7.5) < 0.01);
});

test('viewport starts zoomed in and keeps the pointed world position during zoom', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ width: 15, height: 15, viewportWidth: 640, viewportHeight: 480 });
  assert.equal(map.camera.zoom, 1.25);
  map.setCamera(500, 400, 1);
  const before = map.screenToWorld(200, 150);
  map.zoomAt(2, 200, 150);
  const after = map.screenToWorld(200, 150);
  assert.ok(Math.abs(before.x - after.x) < 0.001);
  assert.ok(Math.abs(before.y - after.y) < 0.001);
});

test('camera movement is clamped to the 15x15 city', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ width: 15, height: 15, viewportWidth: 520, viewportHeight: 400 });
  map.setCamera(-500, -500, 1);
  assert.equal(map.camera.x, 0);
  assert.equal(map.camera.y, 0);
  map.setCamera(99999, 99999, 1);
  assert.equal(map.camera.x, 15 * 52 - 520);
  assert.equal(map.camera.y, 15 * 52 - 400);
});

test('visible range returns only viewport tiles plus overscan', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ width: 15, height: 15, viewportWidth: 640, viewportHeight: 480 });
  map.setCamera(2 * 52, 2 * 52, 1.25);
  const range = map.visibleRange();
  assert.deepEqual(range, { minX: 1, minY: 1, maxX: 12, maxY: 10 });
  assert.ok((range.maxX - range.minX + 1) * (range.maxY - range.minY + 1) < 200);
});

test('selection supports replacement, toggling, rectangles, and clearing', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ width: 15, height: 15 });
  map.selectOne(10);
  assert.deepEqual(map.getSelection(), [10]);
  map.toggleSelection(11);
  map.toggleSelection(10);
  assert.deepEqual(map.getSelection(), [11]);
  map.selectRectangle(0, 0, 1, 1, false);
  assert.deepEqual(map.getSelection(), [0, 1, 15, 16]);
  map.clearSelection();
  assert.deepEqual(map.getSelection(), []);
});

test('drag threshold distinguishes map movement from plot clicks', () => {
  const { WorldMapController } = require('../world-map');
  const map = new WorldMapController({ width: 15, height: 15 });
  assert.equal(map.isDrag(10, 10, 13, 13), false);
  assert.equal(map.isDrag(10, 10, 18, 10), true);
});
