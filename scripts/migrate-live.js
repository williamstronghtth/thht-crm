const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://lkceqalryoyfxbdbmvvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrY2VxYWxyeW95ZnhiZGJtdnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTU5NDgsImV4cCI6MjA4ODM3MTk0OH0.Aa-PI4-lP6fUfY7GEQG7gUV_fUSxC6vS-bNXa0yg0NE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const data = JSON.parse(fs.readFileSync('/tmp/crm-backup.json', 'utf8'));
const clients = data.clients;

console.log(`\n📦 Migrating ${clients.length} leads from live CRM to Supabase...\n`);

function camelToSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    converted[snakeKey] = value;
  }
  return converted;
}

async function migrate() {
  // First, clear existing data to avoid duplicates
  console.log('🗑️ Clearing existing Supabase data...');
  await supabase.from('clients').delete().neq('id', '');
  
  // Convert and insert
  const records = clients.map(c => camelToSnake(c));
  
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
  
  console.log(`\n📊 Total imported: ${imported}/${clients.length}`);
  
  const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}\n`);
}

migrate();
