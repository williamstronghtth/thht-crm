#!/bin/bash
echo "Starting CRM..."
echo "Checking database..."

# Always try to import if database is empty or missing
node -e "
const Database = require('better-sqlite3');
const db = new Database('crm.db');
try {
  db.exec('CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY)');
  const count = db.prepare('SELECT COUNT(*) as c FROM contacts').get();
  console.log('Contacts in DB: ' + count.c);
  if (count.c === 0) {
    console.log('Database empty, importing...');
    process.exit(1);
  }
  process.exit(0);
} catch(e) {
  console.log('DB check failed, importing...');
  process.exit(1);
}
"
if [ $? -ne 0 ]; then
  echo "Running import..."
  node import.js
fi

echo "Starting server..."
node server.js
