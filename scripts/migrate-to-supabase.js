#!/usr/bin/env node
/**
 * Migrate CRM data from local JSON to Supabase
 * 
 * Usage:
 *   SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx node scripts/migrate-to-supabase.js
 *   
 * Or with .env file:
 *   node scripts/migrate-to-supabase.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

async function migrate() {
  console.log('🚀 Starting migration to Supabase...\n');
  
  // Check Supabase credentials
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.error('   Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
    process.exit(1);
  }
  
  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Connected to Supabase\n');
  
  // Load local data
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ data.json not found at', DATA_FILE);
    process.exit(1);
  }
  
  const localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const clients = localData.clients || [];
  
  console.log(`📦 Found ${clients.length} clients in local data.json\n`);
  
  if (clients.length === 0) {
    console.log('⚠️ No clients to migrate');
    process.exit(0);
  }
  
  // Convert camelCase to snake_case for Postgres
  function camelToSnake(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj;
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      converted[snakeKey] = value;
    }
    return converted;
  }
  
  // Prepare records for insert
  const records = clients.map(client => {
    const record = camelToSnake(client);
    
    // Ensure required fields
    record.id = record.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    record.first_name = record.first_name || '';
    record.last_name = record.last_name || '';
    record.stage = record.stage || 'lead';
    record.lead_type = record.lead_type || 'cold';
    record.lead_source = record.lead_source || 'Other';
    
    return record;
  });
  
  // Insert in batches of 100
  const BATCH_SIZE = 100;
  let imported = 0;
  let errors = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    const { data, error } = await supabase
      .from('clients')
      .upsert(batch, { onConflict: 'id' })
      .select();
    
    if (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      imported += data.length;
      console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: Imported ${data.length} clients`);
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`   Total in source: ${clients.length}`);
  console.log(`   Successfully imported: ${imported}`);
  console.log(`   Errors: ${errors}`);
  
  // Verify counts
  const { count } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true });
  
  console.log(`   Records in Supabase: ${count}\n`);
  
  if (imported === clients.length) {
    console.log('✅ Migration complete! All data transferred to Supabase.');
    console.log('\n🔧 Next steps:');
    console.log('   1. Add SUPABASE_URL and SUPABASE_ANON_KEY to Render environment');
    console.log('   2. Push the updated server.js');
    console.log('   3. Verify CRM loads data from Supabase');
  } else {
    console.log('⚠️ Migration completed with some errors. Review and retry failed records.');
  }
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
