const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'keys.json');

app.use(cors());
app.use(express.json());

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { keys: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

app.post('/api/activate', (req, res) => {
  const { key, hwid } = req.body;

  if (!key || !hwid) {
    return res.json({ ok: false, error: 'Missing key or hwid.' });
  }

  const normalizedKey = key.toUpperCase().trim();
  const db = loadDB();

  if (db.keys[normalizedKey]) {
    if (db.keys[normalizedKey] === hwid) {
      return res.json({ ok: true, message: 'Already activated on this PC.' });
    }
    return res.json({ ok: false, error: 'This key is locked to another PC.' });
  }

  db.keys[normalizedKey] = hwid;
  saveDB(db);
  return res.json({ ok: true, message: 'Key activated and locked to this PC.' });
});

app.post('/api/validate', (req, res) => {
  const { key, hwid } = req.body;

  if (!key || !hwid) {
    return res.json({ ok: false, error: 'Missing key or hwid.' });
  }

  const normalizedKey = key.toUpperCase().trim();
  const db = loadDB();

  if (!db.keys[normalizedKey]) {
    return res.json({ ok: false, error: 'Key not found.' });
  }

  if (db.keys[normalizedKey] !== hwid) {
    return res.json({ ok: false, error: 'Key is locked to another PC.' });
  }

  return res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, server: 'Medusa License Server' });
});

app.listen(PORT, () => {
  console.log(`Medusa License Server running on port ${PORT}`);
});
