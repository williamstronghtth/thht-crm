const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://lkceqalryoyfxbdbmvvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrY2VxYWxyeW95ZnhiZGJtdnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTU5NDgsImV4cCI6MjA4ODM3MTk0OH0.Aa-PI4-lP6fUfY7GEQG7gUV_fUSxC6vS-bNXa0yg0NE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const csvFile = process.argv[2];
const csv = fs.readFileSync(csvFile, 'utf8');
const lines = csv.trim().split('\n');

console.log(`\n📦 Importing ${lines.length - 1} divorce/probate leads to Supabase...\n`);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

async function importLeads() {
  const headers = parseCSVLine(lines[0]);
  const records = [];
  const now = new Date().toISOString();
  let divorceCount = 0;
  let probateCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => row[h.trim()] = values[idx] || '');
    
    if (!row['First Name'] && !row['Last Name']) continue;
    
    const phone = (row['Phone Number 1'] || row['Phone Number 2'] || '').replace(/[^\d]/g, '');
    const type = (row['Type'] || '').toLowerCase();
    const leadType = type === 'divorce' ? 'divorce' : type === 'probate' ? 'probate' : 'other';
    
    if (leadType === 'divorce') divorceCount++;
    if (leadType === 'probate') probateCount++;
    
    records.push({
      id: generateId(),
      first_name: row['First Name'] || '',
      last_name: row['Last Name'] || '',
      email: row['Email'] || row['Email 2'] || '',
      phone: phone,
      address: row['Address'] || '',
      stage: 'lead',
      client_type: 'seller',
      lead_type: leadType,
      lead_source: type === 'divorce' ? 'Court Records' : 'Probate',
      activity_log: [{
        timestamp: now,
        action: 'Imported',
        details: `Imported from ${type} leads list`
      }],
      last_activity: now,
      created_at: now,
      updated_at: now
    });
  }
  
  console.log(`📊 Divorce: ${divorceCount}, Probate: ${probateCount}`);
  
  const BATCH = 50;
  let imported = 0;
  
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { data, error } = await supabase.from('clients').insert(batch).select();
    if (error) {
      console.error(`❌ Batch error:`, error.message);
    } else {
      imported += data.length;
      console.log(`✅ Batch ${Math.floor(i/BATCH)+1}: ${data.length} leads`);
    }
  }
  
  console.log(`\n📊 Total imported: ${imported}/${records.length}`);
  
  const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}\n`);
}

importLeads();
