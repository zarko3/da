'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

async function waitForJson(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_) { /* browser is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await waitForJson('http://127.0.0.1:9223/json/version');
  const target = await fetch(`http://127.0.0.1:9223/json/new?http://127.0.0.1:8766/index.html%3Fe2e%3D${Date.now()}`, { method: 'PUT' }).then(r => r.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(detail);
    }
    return result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await evaluate(`localStorage.clear(); sessionStorage.clear()`);
  await send('Page.reload', { ignoreCache: true });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await evaluate(`document.readyState === 'complete' && document.querySelectorAll('#city-select option').length === 20`);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) {
    const diagnostics = await evaluate(`({ href: location.href, title: document.title, body: document.body?.innerText?.slice(0, 500), scripts: [...document.scripts].map(s => s.src) })`);
    throw new Error(`Page did not initialize: ${JSON.stringify(diagnostics)}; runtime errors: ${JSON.stringify(errors)}`);
  }
  assert.equal(await evaluate(`document.querySelector('#btn-new')`), null);
  assert.equal(await evaluate(`document.querySelector('#modal:not([hidden]) h2')?.textContent`), 'Create your company');
  if (process.env.PLOT_COMPANY_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.env.PLOT_COMPANY_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`(() => {
    const name = document.querySelector('#company-name');
    name.value = 'North Star';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const symbol = document.querySelector('input[name="company-symbol"][value="factory"]');
    symbol.checked = true;
    symbol.dispatchEvent(new Event('change', { bubbles: true }));
    const color = document.querySelector('input[name="company-color"][value="plum"]');
    color.checked = true;
    color.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#modal button.primary').click();
  })()`);
  assert.equal(await evaluate(`document.querySelector('.toolbar-company-name')?.textContent`), 'North Star');
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--company-color').trim()`), '#8a70b8');
  assert.equal(await evaluate(`(() => { state.cash = 10000; gameService.buyPlot(112); render(true); return document.querySelector('[data-plot="112"]')?.classList.contains('company-owned'); })()`), true);
  await evaluate(`document.querySelector('#modal:not([hidden]) button.primary')?.click()`);

  const initial = await evaluate(`({
    cities: document.querySelectorAll('#city-select option').length,
    cells: document.querySelectorAll('#map .cell').length,
    zoom: document.querySelector('#map-zoom-label').textContent,
    transform: document.querySelector('#map').style.transform
  })`);
  assert.equal(initial.cities, 20);
  assert.ok(initial.cells > 0 && initial.cells <= 225);
  assert.equal(initial.zoom, '125%');

  await evaluate(`document.querySelector('#world-overview').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.world-city-card').length`), 20);
  assert.match(await evaluate(`document.querySelector('.world-city-card.current')?.textContent || ''`), /Founders City/);
  if (process.env.PLOT_WORLD_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.env.PLOT_WORLD_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`document.querySelector('[data-travel-city="1"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#city-select').value`), '1');

  const switched = await evaluate(`(() => {
    const select = document.querySelector('#city-select');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return document.querySelector('#map-selection').textContent;
  })()`);
  assert.match(switched, /Northgate/);

  const viewport = await evaluate(`(() => { const r = document.querySelector('#map-viewport').getBoundingClientRect(); return {x:r.x,y:r.y}; })()`);
  await send('Page.bringToFront');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: viewport.x + 300, y: viewport.y + 100, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: viewport.x + 390, y: viewport.y + 160, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: viewport.x + 390, y: viewport.y + 160, button: 'left', clickCount: 1 });
  const afterPan = await evaluate(`document.querySelector('#map').style.transform`);
  if (afterPan === initial.transform) {
    const panDiagnostics = await evaluate(`({
      camera: mapController.camera,
      modalHidden: document.querySelector('#modal').hidden,
      inner: {width: innerWidth, height: innerHeight, scrollY},
      hit: (() => { const e = document.elementFromPoint(${viewport.x + 300}, ${viewport.y + 100}); return e ? {tag:e.tagName, id:e.id, cls:String(e.className)} : null; })(),
      pointerStart,
      dragged
    })`);
    throw new Error(`Map did not pan at ${JSON.stringify(viewport)}: ${JSON.stringify(panDiagnostics)}`);
  }

  await evaluate(`document.querySelector('#map-zoom-in').click()`);
  assert.equal(await evaluate(`document.querySelector('#map-zoom-label').textContent`), '140%');

  const cell = await evaluate(`(() => {
    const view = document.querySelector('#map-viewport').getBoundingClientRect();
    const element = [...document.querySelectorAll('#map .cell')].find(node => {
      const r = node.getBoundingClientRect();
      return r.left > view.left + 10 && r.right < view.right - 190 && r.top > view.top + 10 && r.bottom < view.bottom - 10;
    });
    const r = element.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cell.x, y: cell.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cell.x, y: cell.y, button: 'left', clickCount: 1 });
  const selectionText = await evaluate(`document.querySelector('#map-selection').textContent`);
  if (!/1 plot selected/.test(selectionText)) {
    const clickDiagnostics = await evaluate(`({
      selection: mapController.getSelection(),
      pointerStart,
      dragged,
      hit: document.elementFromPoint(${cell.x}, ${cell.y})?.className
    })`);
    throw new Error(`Plot click did not select: ${selectionText}; ${JSON.stringify(clickDiagnostics)}`);
  }
  if (process.env.PLOT_MAP_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.env.PLOT_MAP_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }

  let expectedCompanyName = 'North Star';
  for (const pageName of ['company.html', 'market.html', 'finance.html', 'bank.html']) {
    await send('Page.navigate', { url: `http://127.0.0.1:8766/${pageName}` });
    let loaded = false;
    for (let i = 0; i < 40; i++) {
      loaded = await evaluate(`document.readyState === 'complete' && document.querySelector('#toolbar')?.children.length > 0`);
      if (loaded) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(loaded, true, `${pageName} did not initialize`);
    assert.equal(await evaluate(`document.querySelector('#btn-new')`), null);
    assert.equal(await evaluate(`document.querySelector('.toolbar-company-name')?.textContent`), expectedCompanyName);
    if (pageName === 'company.html') {
      assert.equal(await evaluate(`document.querySelector('#company-profile-name')?.textContent`), 'North Star');
      await evaluate(`document.querySelector('#edit-company').click()`);
      assert.equal(await evaluate(`document.querySelector('#modal:not([hidden]) h2')?.textContent`), 'Edit company identity');
      await evaluate(`(() => {
        const name = document.querySelector('#company-name');
        name.value = 'North Star Trading';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('#modal button.primary').click();
      })()`);
      assert.equal(await evaluate(`document.querySelector('#company-profile-name')?.textContent`), 'North Star Trading');
      assert.equal(await evaluate(`document.querySelector('.toolbar-company-name')?.textContent`), 'North Star Trading');
      expectedCompanyName = 'North Star Trading';
    }
  }
  assert.deepEqual(errors, []);

  await send('Page.close');
  socket.close();
  console.log('browser map checks passed');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
