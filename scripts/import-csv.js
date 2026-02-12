#!/usr/bin/env node
/**
 * CSV Import Script for THHT CRM
 * 
 * Handles Chris's Google Sheets format:
 * - Section headers (e.g., "COLD CALLING") set the lead source for rows below
 * - Columns: First Name, Last Name, Email, Home Address, Cell Phone, Last Activity, (blank), Notes
 * 
 * Usage:
 *   node scripts/import-csv.js <csv-file> [--dry-run] [--endpoint URL]
 * 
 * Examples:
 *   node scripts/import-csv.js contacts.csv --dry-run
 *   node scripts/import-csv.js contacts.csv --endpoint https://clientlist.onrender.com
 */

const fs = require('fs');
const path = require('path');

// Known lead sources (uppercase for matching)
const LEAD_SOURCES = [
  'COLD CALLING', 'LETTER', 'SOLD.COM', 'CLOSE AI', 'OPICITY',
  'QAZZOO', 'KVCORE', 'CB LEAD', 'DOOR KNOCKING', 'BUYERS',
  'WEBSITE HOME EVALUATION', 'EDDM', 'RENTER', 'OPEN HOUSE', 'OTHER'
];

// Map uppercase to proper case
const SOURCE_MAP = {
  'COLD CALLING': 'Cold Calling',
  'LETTER': 'Letter',
  'SOLD.COM': 'Sold.com',
  'CLOSE AI': 'Close AI',
  'OPICITY': 'OPCity',
  'QAZZOO': 'Qazzoo',
  'KVCORE': 'KvCORE',
  'CB LEAD': 'CB Lead',
  'DOOR KNOCKING': 'Door Knocking',
  'BUYERS': 'Buyers',
  'WEBSITE HOME EVALUATION': 'Website Home Evaluation',
  'EDDM': 'EDDM',
  'RENTER': 'Renter',
  'OPEN HOUSE': 'Open House',
  'OTHER': 'Other'
};

function parseCSV(content) {
  const lines = content.split('\n');
  const rows = [];
  
  for (let line of lines) {
    // Simple CSV parsing (handles basic cases)
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

function isLeadSourceHeader(row) {
  // Check if this row is a lead source section header
  const firstCell = (row[0] || '').toUpperCase().trim();
  
  // Check exact matches
  if (LEAD_SOURCES.includes(firstCell)) return firstCell;
  
  // Check partial matches (e.g., "COLD CALLING" in first cell)
  for (const source of LEAD_SOURCES) {
    if (firstCell === source) return source;
  }
  
  return null;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle formats like "1/26/2026"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

function normalizePhone(phone) {
  if (!phone) return '';
  // Keep only digits
  return phone.replace(/\D/g, '');
}

function importCSV(filePath, options = {}) {
  const { dryRun = false, endpoint = 'http://localhost:3000' } = options;
  
  console.log(`\n📂 Reading: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);
  
  // Skip header row
  const dataRows = rows.slice(1);
  
  let currentSource = 'Other';
  const clients = [];
  const skipped = [];
  const stats = { bySource: {} };
  
  for (const row of dataRows) {
    // Check if this is a lead source header
    const sourceHeader = isLeadSourceHeader(row);
    if (sourceHeader) {
      currentSource = SOURCE_MAP[sourceHeader] || 'Other';
      console.log(`\n📌 Section: ${currentSource}`);
      continue;
    }
    
    // Skip empty rows
    const firstName = (row[0] || '').trim();
    const lastName = (row[1] || '').trim();
    
    if (!firstName && !lastName) continue;
    
    // Skip if no contact info
    const email = (row[2] || '').trim();
    const phone = normalizePhone(row[4] || '');
    
    if (!email && !phone) {
      skipped.push({ name: `${firstName} ${lastName}`, reason: 'No contact info' });
      continue;
    }
    
    const client = {
      firstName,
      lastName,
      email,
      address: (row[3] || '').trim(),
      phone,
      lastActivity: parseDate(row[5]),
      notes: (row[7] || '').trim(),
      leadSource: currentSource,
      stage: 'lead'
    };
    
    clients.push(client);
    stats.bySource[currentSource] = (stats.bySource[currentSource] || 0) + 1;
  }
  
  console.log(`\n✅ Parsed ${clients.length} contacts`);
  console.log(`⏭️  Skipped ${skipped.length} rows`);
  
  if (skipped.length > 0 && skipped.length <= 10) {
    console.log('\nSkipped:');
    skipped.forEach(s => console.log(`  - ${s.name}: ${s.reason}`));
  }
  
  console.log('\n📊 By Lead Source:');
  Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN - No data sent');
    console.log('\nSample contacts:');
    clients.slice(0, 3).forEach(c => {
      console.log(`  ${c.firstName} ${c.lastName} (${c.leadSource}) - ${c.phone || c.email}`);
    });
    return Promise.resolve({ clients, skipped, stats, dryRun: true });
  }
  
  // Send to API
  console.log(`\n🚀 Importing to ${endpoint}/api/import...`);
  
  return fetch(`${endpoint}/api/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clients })
  })
    .then(res => res.json())
    .then(result => {
      console.log(`\n✅ Import complete!`);
      console.log(`   Imported: ${result.imported}`);
      console.log(`   Total in CRM: ${result.total}`);
      return { clients, skipped, stats, result };
    })
    .catch(err => {
      console.error(`\n❌ Import failed: ${err.message}`);
      throw err;
    });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
THHT CRM - CSV Import Tool

Usage:
  node import-csv.js <csv-file> [options]

Options:
  --dry-run       Parse and validate without importing
  --endpoint URL  Target CRM endpoint (default: http://localhost:3000)
  --help          Show this help

Examples:
  node import-csv.js contacts.csv --dry-run
  node import-csv.js contacts.csv --endpoint https://clientlist.onrender.com
`);
    process.exit(0);
  }
  
  const filePath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const endpointIdx = args.indexOf('--endpoint');
  const endpoint = endpointIdx !== -1 ? args[endpointIdx + 1] : 'http://localhost:3000';
  
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  importCSV(filePath, { dryRun, endpoint })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { importCSV, parseCSV };
