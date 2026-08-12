const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'medusa-admin-key-change-me';

let keysDb = {};

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

app.post('/api/activate', (req, res) => {
  const { key, hwid } = req.body;

  if (!key || !hwid) {
    return res.json({ ok: false, error: 'Missing key or hwid.' });
  }

  const normalizedKey = key.toUpperCase().trim();

  if (!(normalizedKey in keysDb)) {
    return res.json({ ok: false, error: 'Invalid license key.' });
  }

  if (keysDb[normalizedKey] === null) {
    keysDb[normalizedKey] = hwid;
    return res.json({ ok: true, message: 'Key activated and locked to this PC.' });
  }

  if (keysDb[normalizedKey] === hwid) {
    return res.json({ ok: true, message: 'Already activated on this PC.' });
  }

  return res.json({ ok: false, error: 'This key is locked to another PC.' });
});

app.post('/api/validate', (req, res) => {
  const { key, hwid } = req.body;

  if (!key || !hwid) {
    return res.json({ ok: false, error: 'Missing key or hwid.' });
  }

  const normalizedKey = key.toUpperCase().trim();

  if (!keysDb[normalizedKey]) {
    return res.json({ ok: false, error: 'Key not found.' });
  }

  if (keysDb[normalizedKey] !== hwid) {
    return res.json({ ok: false, error: 'Key is locked to another PC.' });
  }

  return res.json({ ok: true });
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

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>Medusa Admin</title>
<style>
  body{font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:40px;max-width:800px;margin:0 auto}
  h1{color:#8b5cf6}input,button{background:#1a1a1a;color:#e0e0e0;border:1px solid #333;padding:10px;font-family:monospace;font-size:14px;border-radius:6px;margin:4px}
  input:focus{border-color:#8b5cf6;outline:none}button{background:#8b5cf6;color:#fff;cursor:pointer;border:none;font-weight:bold}
  button:hover{background:#7c3aed}.key{background:#1a1a1a;border:1px solid #333;padding:10px;margin:6px 0;border-radius:6px;display:flex;justify-content:space-between;align-items:center}
  .key code{color:#8b5cf6;font-size:16px}.hwid{color:#666;font-size:12px}.free{color:#22c55e}.locked{color:#ef4444}
  #result{margin-top:20px;padding:15px;background:#1a1a1a;border-radius:6px;display:none;border:1px solid #333;white-space:pre-wrap}
  label{display:block;margin-top:16px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px}
</style></head><body>
<h1>Medusa License Server</h1>
<label>Admin Secret</label>
<input type="password" id="secret" placeholder="Enter admin secret" style="width:300px">
<label>Generate Keys</label>
<div><input type="number" id="count" value="5" min="1" max="50" style="width:80px"> <button onclick="generate()">Generate</button> <button onclick="listKeys()" style="background:#333">List All</button></div>
<div id="result"></div>
<script>
const API = '';
async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
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
    d.textContent = data.keys.length + ' key(s):\\n\\n';
    d.textContent += data.keys.map(k => k.key + '  ' + (k.hwid ? 'LOCKED → ' + k.hwid : 'UNUSED')).join('\\n');
  } else { d.textContent = 'Error: ' + data.error; }
}
</script></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Medusa License Server running on port ${PORT}`);
});
