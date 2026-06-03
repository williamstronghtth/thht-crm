/**
 * Run the enrichment migration against Supabase.
 * Usage: node scripts/run-enrichment-migration.js
 */
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const columns = [
  { name: 'linkedin_url', type: 'TEXT' },
  { name: 'instagram_url', type: 'TEXT' },
  { name: 'facebook_url', type: 'TEXT' },
  { name: 'birthday', type: 'DATE' },
  { name: 'home_address', type: 'TEXT' },
  { name: 'home_purchase_date', type: 'DATE' },
  { name: 'estimated_home_value', type: 'INTEGER' },
  { name: 'enrichment_status', type: "TEXT DEFAULT 'pending'" },
  { name: 'enriched_at', type: 'TIMESTAMPTZ' },
  { name: 'enrichment_notes', type: 'TEXT' },
];

async function runMigration() {
  console.log('Running enrichment migration...');

  for (const col of columns) {
    const sql = `ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`;
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      // RPC might not exist — try a direct approach via insert/select test
      console.warn(`RPC exec_sql not available: ${error.message}`);
      console.log('Migration SQL must be run manually in Supabase SQL Editor.');
      console.log('Copy and paste from: scripts/migration-enrichment.sql');
      return;
    }

    console.log(`  Added column: ${col.name}`);
  }

  console.log('Migration complete!');
}

// Alternative: verify columns exist by doing a test select
async function verifyColumns() {
  const { data, error } = await supabase
    .from('clients')
    .select('enrichment_status')
    .limit(1);

  if (error && error.message.includes('enrichment_status')) {
    console.log('Enrichment columns NOT found — migration needed.');
    console.log('Run this SQL in the Supabase SQL Editor:');
    console.log('');
    columns.forEach(col => {
      console.log(`  ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
    });
    return false;
  }

  console.log('Enrichment columns verified — migration already applied or succeeded.');
  return true;
}

async function main() {
  // Try running the migration
  await runMigration();
  // Verify
  await verifyColumns();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
