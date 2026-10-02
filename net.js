'use strict';

// Online play. Loaded after game.js and before shared.js.
//
// The pages keep running the rules locally so every click feels instant, but the server is the truth:
// each action is also sent to the server, and the saved game it sends back replaces the local one.
// The world clock never runs in the browser; the page just polls for the newest saved game.
// Opened from a file (file://) the game stays single player, exactly as before.

const TOKEN_KEY = 'pt-token';
const POLL_MS = 3000;
const ONLINE = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
// Cloudflare serves login.html at /login, so accept both.
const ON_LOGIN_PAGE = typeof location !== 'undefined' && /\/login(\.html)?\/?$/.test(location.pathname);

function authToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

function leaveToLogin() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  if (!ON_LOGIN_PAGE) location.replace('login.html');
}

// Stores a snapshot from the server as the local saved game.
function applyServerSnapshot(reply) {
  const save = Object.assign({}, reply.save, { online: reply.online });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

const isOnline = () => ONLINE && Boolean(authToken());

async function showPlayers() {
  let rows = [];
  try { rows = (await (await fetch('/api/leaderboard')).json()).rows || []; } catch (e) { /* show an empty table */ }
  const me = state.online && state.online.username;
  openModal('Players',
    `<table class="table"><thead><tr><th>#</th><th>Player</th><th>Company</th><th class="num">Net worth</th></tr></thead><tbody>${rows.map((r, k) =>
      `<tr><td>${k + 1}</td><td>${escapeHtml(r.username)}${r.username === me ? ' (you)' : ''}</td><td>${r.company ? escapeHtml(r.company) : ''}</td><td class="num">${money(r.netWorth)}</td></tr>`).join('')}</tbody></table>`,
    [{ label: 'Close' }]);
}

async function signOut() {
  try { await fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken() }, body: '{}' }); } catch (e) { /* ignore */ }
  leaveToLogin();
}

if (ONLINE && !ON_LOGIN_PAGE) {
  if (!authToken()) {
    leaveToLogin();
  } else {
    const queue = [];
    let sending = false;
    let polling = false;

    const api = async (path, options = {}) => {
      const response = await fetch(path, Object.assign({ headers: { Authorization: 'Bearer ' + authToken(), 'Content-Type': 'application/json' } }, options));
      if (response.status === 401) { leaveToLogin(); throw new Error('signed-out'); }
      return response.json();
    };

    const refresh = () => {
      if (typeof reloadState === 'function') { reloadState(); render(false); }
    };

    async function flush() {
      if (sending) return;
      sending = true;
      let reply = null;
      try {
        while (queue.length) {
          const job = queue.shift();
          reply = await api('/api/action', { method: 'POST', body: JSON.stringify(job) });
          if (reply.ok && reply.result && reply.result.ok === false && typeof notify === 'function') {
            // The server said no (for example, someone else bought the land first).
            notify(reply.result.reason === 'unavailable' ? 'That land is no longer available.'
              : reply.result.reason === 'company-name-taken' ? 'That company name is already taken.' : 'The server did not accept that action.');
          }
        }
      } catch (e) { /* network trouble: the next poll puts the local game right again */ }
      sending = false;
      if (reply && reply.ok) { applyServerSnapshot(reply); refresh(); }
    }

    // Every action that changes the game runs locally, then goes to the server.
    const SKIP = /^(constructor|get[A-Z].*|runWorldDay|checkMilestones)$/;
    Object.getOwnPropertyNames(LocalGameService.prototype).filter(name => !SKIP.test(name)).forEach(name => {
      const local = LocalGameService.prototype[name];
      gameService[name] = (...args) => {
        const result = local.apply(gameService, args);
        queue.push({ method: name, args });
        flush();
        return result;
      };
    });
    // Days are worked out by the server only.
    gameService.runWorldDay = () => ({ ok: false, reason: 'server-clock' });

    setInterval(async () => {
      if (polling || sending || queue.length) return;
      polling = true;
      try {
        const reply = await api('/api/snapshot');
        if (reply.ok && !sending && !queue.length) { applyServerSnapshot(reply); refresh(); }
      } catch (e) { /* offline for now */ }
      polling = false;
    }, POLL_MS);
  }
}
