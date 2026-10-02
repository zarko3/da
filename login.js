'use strict';

const BACKUP_KEY = 'plot-tycoon-offline-backup';

async function submitCredentials(path) {
  const error = document.getElementById('login-error');
  error.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const reply = await response.json();
    if (!reply.ok) { error.textContent = reply.error || 'Something went wrong.'; return; }
    // Keep a single-player save once, before the online game takes its place.
    try {
      const old = localStorage.getItem(SAVE_KEY);
      if (old && !localStorage.getItem(BACKUP_KEY) && !JSON.parse(old).online) localStorage.setItem(BACKUP_KEY, old);
      localStorage.setItem(TOKEN_KEY, reply.token);
    } catch (e) { /* ignore */ }
    applyServerSnapshot(reply);
    location.replace('index.html');
  } catch (e) {
    error.textContent = 'Could not reach the server.';
  }
}

document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); submitCredentials('/api/login'); });
document.getElementById('btn-register').addEventListener('click', () => {
  if (document.getElementById('login-form').reportValidity()) submitCredentials('/api/register');
});
