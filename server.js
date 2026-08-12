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

app.listen(PORT, () => {
  console.log(`Medusa License Server running on port ${PORT}`);
});
