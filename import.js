const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'crm.db'));
db.pragma('journal_mode = WAL');

// Create tables first (same as server.js)
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    source TEXT DEFAULT '',
    stage TEXT DEFAULT 'lead',
    notes TEXT DEFAULT '',
    follow_up_date TEXT DEFAULT '',
    follow_up_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage);
  CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
  CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON contacts(follow_up_date);
  CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
`);

// Parse CSV
const csv = fs.readFileSync(path.join(__dirname, '..', 'client_list_raw.csv'), 'utf-8');
const lines = csv.split('\n');

// Source mapping from section headers
const sectionMap = {
  'COLD CALLING': 'Cold Calling',
  'LETTER': 'Letter',
  'SOLD.com': 'Sold.com',
  'CLOSE AI': 'Close AI',
  'OPCITY': 'Opcity',
  'QAZZOO': 'Qazzoo',
  'KvCORE': 'KvCORE',
  'KVCORE': 'KvCORE',
  'CB Lead': 'CB Lead',
  'Door Knocking': 'Door Knocking',
  'BUYERS': 'Buyer',
  'WEBSITE HOME EVALUATION': 'Website',
  'EDDM': 'EDDM',
  'RENTER': 'Renter',
  'OPEN HOUSE': 'Open House',
  'COLD CALLING BUYERS': 'Cold Calling',
};

const sectionHeaders = Object.keys(sectionMap);

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

let currentSource = '';
let imported = 0;
let skipped = 0;

const insert = db.prepare(`
  INSERT INTO contacts (first_name, last_name, email, phone, address, source, stage, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const logActivity = db.prepare(`
  INSERT INTO activities (contact_id, type, description) VALUES (?, 'imported', 'Imported from Google Sheets')
`);

const tx = db.transaction(() => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (!line.trim()) continue;
    
    const cols = parseCSVLine(line);
    const firstCol = (cols[0] || '').trim();
    
    // Skip header row
    if (firstCol === 'First Name') continue;
    
    // Check for section headers
    if (sectionHeaders.includes(firstCol) || 
        (firstCol && !cols[1]?.trim() && !cols[2]?.trim() && !cols[3]?.trim() && !cols[4]?.trim() && firstCol === firstCol.toUpperCase() && firstCol.length > 3)) {
      if (sectionMap[firstCol]) {
        currentSource = sectionMap[firstCol];
      }
      continue;
    }
    
    // Skip empty first names
    if (!firstCol) continue;
    
    // Extract data
    const firstName = firstCol;
    const lastName = (cols[1] || '').trim();
    let email = (cols[2] || '').trim();
    const address = (cols[3] || '').trim();
    let phone = (cols[4] || '').trim();
    
    // Some entries have email in wrong column or non-email data in email field
    if (email && !email.includes('@')) {
      // Not a real email - might be a note like "Buying" or "Selling" or a price
      email = '';
    }
    
    // Clean up phone - remove non-phone characters but keep it useful
    // Some entries have phone in col 5 instead
    if (!phone || !phone.match(/\d/)) {
      const alt = (cols[5] || '').trim();
      if (alt && alt.match(/\d{3}/)) {
        phone = alt;
      }
    }
    
    // Combine notes from multiple columns
    let notes = '';
    const noteCols = [7, 8, 9, 10, 11, 12]; // columns after Last Activity
    for (const idx of noteCols) {
      const val = (cols[idx] || '').trim();
      if (val && val !== 'NOTES' && val.length > 2) {
        notes += (notes ? '\n' : '') + val;
      }
    }
    
    // Also check column 6 for additional info
    const col6 = (cols[6] || '').trim();
    if (col6 && col6 !== 'NOTES' && col6.length > 5) {
      notes = col6 + (notes ? '\n' + notes : '');
    }

    // Determine stage based on source context
    let stage = 'lead';
    if (currentSource === 'Buyer' || firstCol.includes('BUYER')) {
      stage = 'lead'; // buyers are still leads
    }
    
    try {
      const result = insert.run(firstName, lastName, email, phone, address, currentSource, stage, notes);
      logActivity.run(result.lastInsertRowid);
      imported++;
    } catch (err) {
      console.error(`Error importing ${firstName} ${lastName}:`, err.message);
      skipped++;
    }
  }
});

tx();
console.log(`\n=== IMPORT COMPLETE ===`);
console.log(`Imported: ${imported}`);
console.log(`Skipped: ${skipped}`);

// Show counts by source
const counts = db.prepare('SELECT source, COUNT(*) as count FROM contacts GROUP BY source ORDER BY count DESC').all();
console.log('\nBy Source:');
for (const c of counts) {
  console.log(`  ${c.source || '(none)'}: ${c.count}`);
}

const total = db.prepare('SELECT COUNT(*) as count FROM contacts').get();
console.log(`\nTotal in database: ${total.count}`);
