const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://lkceqalryoyfxbdbmvvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrY2VxYWxyeW95ZnhiZGJtdnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTU5NDgsImV4cCI6MjA4ODM3MTk0OH0.Aa-PI4-lP6fUfY7GEQG7gUV_fUSxC6vS-bNXa0yg0NE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const csvFile = process.argv[2];
const csv = fs.readFileSync(csvFile, 'utf8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',');

console.log(`\n📦 Importing ${lines.length - 1} leads to Supabase...\n`);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseRow(line) {
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
  const records = [];
  const now = new Date().toISOString();
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row = {};
    headers.forEach((h, idx) => row[h.trim()] = values[idx] || '');
    
    // Skip if no name
    if (!row['First Name'] && !row['Last Name']) continue;
    
    // Merge address
    const address = [
      row['Property Address'],
      row['Property City'],
      row['Property State'],
      row['Property Zip']
    ].filter(Boolean).join(', ');
    
    // Clean phone
    const phone = (row['Phone Number'] || '').replace(/[^\d]/g, '');
    
    records.push({
      id: generateId(),
      first_name: row['First Name'] || '',
      last_name: row['Last Name'] || '',
      email: row['Email'] || row['Email 2'] || '',
      phone: phone,
      address: address,
      stage: 'lead',
      client_type: 'seller',
      lead_type: 'cold',
      lead_source: 'Cold Calling',
      activity_log: [{
        timestamp: now,
        action: 'Imported',
        details: 'Imported from CSV'
      }],
      last_activity: now,
      created_at: now,
      updated_at: now
    });
  }
  
  // Insert in batches
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
  
  // Verify
  const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}\n`);
}

importLeads();
