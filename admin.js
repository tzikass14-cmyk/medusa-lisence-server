const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'keys.json');

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

const [,, cmd, ...args] = process.argv;

if (cmd === 'add') {
  const key = args[0] || generateKey();
  const db = loadDB();
  if (db.keys[key.toUpperCase()]) {
    console.log(`Key ${key} already exists.`);
  } else {
    db.keys[key.toUpperCase()] = null;
    saveDB(db);
    console.log(`Added key: ${key}`);
  }
} else if (cmd === 'remove') {
  const key = args[0];
  if (!key) { console.log('Usage: node admin.js remove MEDUSA-XXXX-XXXX-XXXX'); process.exit(1); }
  const db = loadDB();
  const normalized = key.toUpperCase();
  if (db.keys[normalized]) {
    delete db.keys[normalized];
    saveDB(db);
    console.log(`Removed key: ${key}`);
  } else {
    console.log(`Key ${key} not found.`);
  }
} else if (cmd === 'list') {
  const db = loadDB();
  const entries = Object.entries(db.keys);
  if (entries.length === 0) {
    console.log('No keys found.');
  } else {
    console.log(`\n${entries.length} key(s):\n`);
    for (const [key, hwid] of entries) {
      console.log(`  ${key}  →  ${hwid || '(not activated)'}`);
    }
    console.log();
  }
} else if (cmd === 'generate') {
  const count = parseInt(args[0]) || 1;
  const db = loadDB();
  console.log(`\nGenerated ${count} key(s):\n`);
  for (let i = 0; i < count; i++) {
    const key = generateKey();
    db.keys[key] = null;
    console.log(`  ${key}`);
  }
  saveDB(db);
  console.log();
} else {
  console.log(`
Medusa License Server - Admin CLI

Usage:
  node admin.js add [KEY]        Add a key (random if no key given)
  node admin.js generate [N]     Generate N random keys
  node admin.js remove KEY       Remove a key
  node admin.js list             List all keys and their HWID
  `);
}
