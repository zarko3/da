'use strict';

(function exposeWorldMap(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldMapController = api.WorldMapController;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEFAULT_TILE_SIZE = 52;
  const MIN_ZOOM = 0.55;
  const MAX_ZOOM = 1.8;
  const DEFAULT_ZOOM = 1.25;

  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

  class WorldMapController {
    constructor(options = {}) {
      this.width = options.width || 15;
      this.height = options.height || 15;
      this.tileSize = options.tileSize || DEFAULT_TILE_SIZE;
      this.viewportWidth = options.viewportWidth || 800;
      this.viewportHeight = options.viewportHeight || 600;
      this.minZoom = options.minZoom || MIN_ZOOM;
      this.maxZoom = options.maxZoom || MAX_ZOOM;
      this.selection = new Set();
      this.primaryId = null;
      this.camera = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
      this.centerOn((this.width - 1) / 2, (this.height - 1) / 2);
    }

    setViewportSize(width, height) {
      this.viewportWidth = Math.max(1, Number(width) || 1);
      this.viewportHeight = Math.max(1, Number(height) || 1);
      this.clampCamera();
      return this.camera;
    }

    setCamera(x, y, zoom = this.camera.zoom) {
      this.camera.zoom = clampValue(Number(zoom) || DEFAULT_ZOOM, this.minZoom, this.maxZoom);
      this.camera.x = Number(x) || 0;
      this.camera.y = Number(y) || 0;
      return this.clampCamera();
    }

    clampCamera() {
      const visibleWidth = this.viewportWidth / this.camera.zoom;
      const visibleHeight = this.viewportHeight / this.camera.zoom;
      const maxX = Math.max(0, this.width * this.tileSize - visibleWidth);
      const maxY = Math.max(0, this.height * this.tileSize - visibleHeight);
      this.camera.x = clampValue(this.camera.x, 0, maxX);
      this.camera.y = clampValue(this.camera.y, 0, maxY);
      return this.camera;
    }

    centerOn(tileX, tileY) {
      const x = (tileX + 0.5) * this.tileSize - this.viewportWidth / this.camera.zoom / 2;
      const y = (tileY + 0.5) * this.tileSize - this.viewportHeight / this.camera.zoom / 2;
      return this.setCamera(x, y, this.camera.zoom);
    }

    panBy(screenX, screenY) {
      return this.setCamera(this.camera.x - screenX / this.camera.zoom, this.camera.y - screenY / this.camera.zoom);
    }

    zoomAt(zoom, screenX = this.viewportWidth / 2, screenY = this.viewportHeight / 2) {
      const anchor = this.screenToWorld(screenX, screenY);
      const next = clampValue(Number(zoom) || this.camera.zoom, this.minZoom, this.maxZoom);
      this.camera.zoom = next;
      this.camera.x = anchor.x - screenX / next;
      this.camera.y = anchor.y - screenY / next;
      return this.clampCamera();
    }

    fitBounds(minX, minY, maxX, maxY, padding = 40) {
      const width = (maxX - minX + 1) * this.tileSize;
      const height = (maxY - minY + 1) * this.tileSize;
      const zoom = clampValue(Math.min((this.viewportWidth - padding * 2) / width, (this.viewportHeight - padding * 2) / height), this.minZoom, this.maxZoom);
      this.camera.zoom = zoom;
      return this.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    }

    screenToWorld(x, y) {
      return { x: this.camera.x + x / this.camera.zoom, y: this.camera.y + y / this.camera.zoom };
    }

    worldToScreen(x, y) {
      return { x: (x - this.camera.x) * this.camera.zoom, y: (y - this.camera.y) * this.camera.zoom };
    }

    visibleRange(overscan = 1) {
      const endX = this.camera.x + this.viewportWidth / this.camera.zoom;
      const endY = this.camera.y + this.viewportHeight / this.camera.zoom;
      return {
        minX: clampValue(Math.floor(this.camera.x / this.tileSize) - overscan, 0, this.width - 1),
        minY: clampValue(Math.floor(this.camera.y / this.tileSize) - overscan, 0, this.height - 1),
        maxX: clampValue(Math.floor(endX / this.tileSize) + overscan, 0, this.width - 1),
        maxY: clampValue(Math.floor(endY / this.tileSize) + overscan, 0, this.height - 1),
      };
    }

    minimapViewport() {
      return {
        x: this.camera.x / (this.width * this.tileSize),
        y: this.camera.y / (this.height * this.tileSize),
        width: Math.min(1, this.viewportWidth / this.camera.zoom / (this.width * this.tileSize)),
        height: Math.min(1, this.viewportHeight / this.camera.zoom / (this.height * this.tileSize)),
      };
    }

    validId(id) { return Number.isInteger(id) && id >= 0 && id < this.width * this.height; }

    selectOne(id) {
      this.selection.clear();
      if (this.validId(id)) {
        this.selection.add(id);
        this.primaryId = id;
      } else this.primaryId = null;
      return this.getSelection();
    }

    toggleSelection(id) {
      if (!this.validId(id)) return this.getSelection();
      if (this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
      this.primaryId = this.selection.has(id) ? id : (this.selection.size ? [...this.selection][this.selection.size - 1] : null);
      return this.getSelection();
    }

    selectRectangle(x1, y1, x2, y2, additive = false) {
      if (!additive) this.selection.clear();
      const minX = clampValue(Math.min(x1, x2), 0, this.width - 1);
      const maxX = clampValue(Math.max(x1, x2), 0, this.width - 1);
      const minY = clampValue(Math.min(y1, y2), 0, this.height - 1);
      const maxY = clampValue(Math.max(y1, y2), 0, this.height - 1);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) this.selection.add(y * this.width + x);
      this.primaryId = this.selection.size ? maxY * this.width + maxX : null;
      return this.getSelection();
    }

    clearSelection() {
      this.selection.clear();
      this.primaryId = null;
      return [];
    }

    getSelection() { return [...this.selection].sort((a, b) => a - b); }
    isDrag(startX, startY, endX, endY) { return Math.hypot(endX - startX, endY - startY) > 6; }
  }

  return { WorldMapController };
}));
