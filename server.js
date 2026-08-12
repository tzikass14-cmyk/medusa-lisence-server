const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'medusa-admin-key-change-me';

let keysDb = {};
const openLogs = [];
const flaggedUsers = [];

app.use(cors());
app.use(express.json());

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const parts = [];
  for (let g = 0; g < 4; g++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += chars[crypto.randomInt(chars.length)];
    }
    parts.push(seg);
  }
  return 'MEDUSA-' + parts.join('-');
}

function addFlag(reason, hwid, ip, detail) {
  const entry = {
    time: new Date().toISOString(),
    reason,
    hwid: hwid || 'unknown',
    ip: ip || 'unknown',
    detail: detail || ''
  };
  flaggedUsers.unshift(entry);
  if (flaggedUsers.length > 500) flaggedUsers.pop();
  openLogs.unshift({ ...entry, event: '🚨 FLAGGED', username: 'SUSPICIOUS' });
  if (openLogs.length > 1000) openLogs.pop();
}

app.post('/api/activate', (req, res) => {
  const { key, hwid } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!key || !hwid) return res.json({ ok: false, error: 'Missing key or hwid.' });
  const normalizedKey = key.toUpperCase().trim();
  if (!(normalizedKey in keysDb)) {
    addFlag('invalid_key', hwid, ip, `Tried invalid key: ${normalizedKey}`);
    return res.json({ ok: false, error: 'Invalid license key.' });
  }
  if (keysDb[normalizedKey] === null) {
    keysDb[normalizedKey] = hwid;
    return res.json({ ok: true, message: 'Key activated and locked to this PC.' });
  }
  if (keysDb[normalizedKey] === hwid) return res.json({ ok: true, message: 'Already activated on this PC.' });
  addFlag('hwid_mismatch', hwid, ip, `Key ${normalizedKey} locked to ${keysDb[normalizedKey]}, attempted by HWID ${hwid}`);
  return res.json({ ok: false, error: 'This key is locked to another PC.' });
});

app.post('/api/validate', (req, res) => {
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.json({ ok: false, error: 'Missing key or hwid.' });
  const normalizedKey = key.toUpperCase().trim();
  if (!keysDb[normalizedKey]) return res.json({ ok: false, error: 'Key not found.' });
  if (keysDb[normalizedKey] !== hwid) {
    addFlag('hwid_mismatch', hwid, req.headers['x-forwarded-for'] || req.socket.remoteAddress, `Key ${normalizedKey} used from wrong HWID`);
    return res.json({ ok: false, error: 'Key is locked to another PC.' });
  }
  return res.json({ ok: true });
});

app.post('/api/signup', (req, res) => {
  const { username, licenseKey } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!licenseKey) return res.json({ ok: false, message: 'No license key provided.' });
  const normalizedKey = licenseKey.toUpperCase().trim();
  if (!(normalizedKey in keysDb)) {
    addFlag('invalid_key_attempt', username, ip, `Tried key: ${normalizedKey}`);
    return res.json({ ok: false, message: 'Invalid license key.' });
  }
  if (keysDb[normalizedKey] !== null && keysDb[normalizedKey] !== username) {
    addFlag('hwid_mismatch', username, ip, `Key ${normalizedKey} locked to ${keysDb[normalizedKey]}, tried by ${username}`);
    return res.json({ ok: false, message: 'Key already activated.' });
  }
  keysDb[normalizedKey] = username;
  return res.json({ ok: true, message: 'Account created.' });
});

app.post('/api/login', (req, res) => {
  const { username } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const entry = Object.entries(keysDb).find(([k, v]) => v === username);
  if (!entry) {
    addFlag('login_failed', username, ip, `Unknown user tried to login: ${username}`);
    return res.json({ ok: false, message: 'Invalid credentials.' });
  }
  return res.json({ ok: true, username });
});

app.post('/api/admin/generate', (req, res) => {
  const { secret, count = 1 } = req.body;
  if (secret !== ADMIN_SECRET) return res.json({ ok: false, error: 'Unauthorized.' });
  const generated = [];
  for (let i = 0; i < Math.min(count, 50); i++) {
    const key = generateKey();
    keysDb[key] = null;
    generated.push(key);
  }
  return res.json({ ok: true, keys: generated });
});

app.get('/api/admin/list', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.json({ ok: false, error: 'Unauthorized.' });
  const list = Object.entries(keysDb).map(([key, hwid]) => ({ key, hwid: hwid || null }));
  return res.json({ ok: true, keys: list });
});

app.delete('/api/admin/remove', (req, res) => {
  const { secret, key } = req.body;
  if (secret !== ADMIN_SECRET) return res.json({ ok: false, error: 'Unauthorized.' });
  const normalizedKey = key.toUpperCase().trim();
  if (keysDb[normalizedKey] !== undefined) {
    delete keysDb[normalizedKey];
    return res.json({ ok: true, message: `Removed ${normalizedKey}` });
  }
  return res.json({ ok: false, error: 'Key not found.' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, server: 'Medusa License Server' });
});

app.post('/api/log-open', (req, res) => {
  const { hwid, username, version, event, detail } = req.body;
  const entry = {
    time: new Date().toISOString(),
    event: event || 'app_open',
    hwid: hwid || 'unknown',
    username: username || 'unknown',
    version: version || 'unknown',
    detail: detail || '',
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
  };
  openLogs.unshift(entry);
  if (openLogs.length > 1000) openLogs.pop();
  return res.json({ ok: true });
});

app.get('/api/admin/logs', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.json({ ok: false, error: 'Unauthorized.' });
  return res.json({ ok: true, logs: openLogs });
});

app.get('/api/admin/flags', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.json({ ok: false, error: 'Unauthorized.' });
  return res.json({ ok: true, flags: flaggedUsers });
});

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>Medusa Admin</title>
<style>
  body{font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:40px;max-width:800px;margin:0 auto}
  h1{color:#8b5cf6}input,button{background:#1a1a1a;color:#e0e0e0;border:1px solid #333;padding:10px;font-family:monospace;font-size:14px;border-radius:6px;margin:4px}
  input:focus{border-color:#8b5cf6;outline:none}button{background:#8b5cf6;color:#fff;cursor:pointer;border:none;font-weight:bold}
  button:hover{background:#7c3aed}
  #result{margin-top:20px;padding:15px;background:#1a1a1a;border-radius:6px;display:none;border:1px solid #333;white-space:pre-wrap}
  label{display:block;margin-top:16px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px}
</style></head><body>
<h1>Medusa License Server</h1>
<label>Admin Secret</label>
<input type="password" id="secret" placeholder="Enter admin secret" style="width:300px">
<label>Generate Keys</label>
<div>
  <input type="number" id="count" value="5" min="1" max="50" style="width:80px">
  <button onclick="generate()">Generate</button>
  <button onclick="listKeys()" style="background:#333">List All</button>
  <button onclick="viewLogs()" style="background:#1a1a2e">View Logs</button>
  <button onclick="viewFlags()" style="background:#3b0000">🚨 Flags</button>
</div>
<div id="result"></div>
<script>
async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}
async function generate() {
  const s = document.getElementById('secret').value;
  const c = parseInt(document.getElementById('count').value) || 5;
  const d = document.getElementById('result');
  d.style.display = 'block'; d.textContent = 'Generating...';
  const data = await api('POST', '/api/admin/generate', { secret: s, count: c });
  if (data.ok) { d.textContent = 'Generated ' + data.keys.length + ' key(s):\\n\\n' + data.keys.join('\\n'); }
  else { d.textContent = 'Error: ' + data.error; }
}
async function listKeys() {
  const s = document.getElementById('secret').value;
  const d = document.getElementById('result');
  d.style.display = 'block'; d.textContent = 'Loading...';
  const data = await api('GET', '/api/admin/list?secret=' + encodeURIComponent(s));
  if (data.ok) {
    if (data.keys.length === 0) { d.textContent = 'No keys found.'; return; }
    d.textContent = data.keys.length + ' key(s):\\n\\n' + data.keys.map(k => k.key + '  ' + (k.hwid ? 'LOCKED → ' + k.hwid : 'UNUSED')).join('\\n');
  } else { d.textContent = 'Error: ' + data.error; }
}
async function viewLogs() {
  const s = document.getElementById('secret').value;
  const d = document.getElementById('result');
  d.style.display = 'block'; d.textContent = 'Loading...';
  const data = await api('GET', '/api/admin/logs?secret=' + encodeURIComponent(s));
  if (data.ok) {
    if (data.logs.length === 0) { d.textContent = 'No logs yet.'; return; }
    d.textContent = data.logs.length + ' event(s):\\n\\n' +
      data.logs.map(l => l.time + '  |  ' + String(l.event).toUpperCase().padEnd(15) + '  |  ' + (l.username !== 'unknown' ? l.username : 'guest') + '  |  IP: ' + l.ip + (l.detail ? '  |  ' + l.detail : '') + '  |  HWID: ' + l.hwid).join('\\n');
  } else { d.textContent = 'Error: ' + data.error; }
}
async function viewFlags() {
  const s = document.getElementById('secret').value;
  const d = document.getElementById('result');
  d.style.display = 'block'; d.textContent = 'Loading...';
  const data = await api('GET', '/api/admin/flags?secret=' + encodeURIComponent(s));
  if (data.ok) {
    if (data.flags.length === 0) { d.textContent = 'No suspicious activity detected.'; return; }
    d.textContent = '🚨 ' + data.flags.length + ' suspicious event(s):\\n\\n' +
      data.flags.map(f => f.time + '  |  ' + f.reason.toUpperCase().padEnd(20) + '  |  IP: ' + f.ip + '  |  HWID: ' + f.hwid + '  |  ' + f.detail).join('\\n');
  } else { d.textContent = 'Error: ' + data.error; }
}
</script></body></html>`);
});

app.listen(PORT, () => {
  console.log('Medusa License Server running on port ' + PORT);
});
