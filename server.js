const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const dbPath = path.join(__dirname, 'crm.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Check if we need to reset the database (schema mismatch)
try {
  const tableInfo = db.prepare("PRAGMA table_info(contacts)").all();
  const columns = tableInfo.map(c => c.name);
  if (tableInfo.length > 0 && !columns.includes('stage')) {
    console.log('Schema mismatch detected, recreating database...');
    db.exec('DROP TABLE IF EXISTS activities; DROP TABLE IF EXISTS contacts;');
  }
} catch (e) {
  console.log('Fresh database, creating tables...');
}

// Create tables
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === API ROUTES ===

// Get all contacts with optional filters
app.get('/api/contacts', (req, res) => {
  const { stage, source, search, followup } = req.query;
  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];

  if (stage && stage !== 'all') {
    query += ' AND stage = ?';
    params.push(stage);
  }
  if (source && source !== 'all') {
    query += ' AND source = ?';
    params.push(source);
  }
  if (search) {
    query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ? OR notes LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  if (followup === 'overdue') {
    query += " AND follow_up_date != '' AND follow_up_date <= date('now')";
  } else if (followup === 'upcoming') {
    query += " AND follow_up_date != '' AND follow_up_date > date('now') AND follow_up_date <= date('now', '+7 days')";
  } else if (followup === 'all') {
    query += " AND follow_up_date != ''";
  }

  query += ' ORDER BY updated_at DESC';

  try {
    const contacts = db.prepare(query).all(...params);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const stages = db.prepare(`
      SELECT stage, COUNT(*) as count FROM contacts GROUP BY stage
    `).all();

    const sources = db.prepare(`
      SELECT source, COUNT(*) as count FROM contacts GROUP BY source ORDER BY count DESC
    `).all();

    const total = db.prepare('SELECT COUNT(*) as count FROM contacts').get();

    const withEmail = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE email != '' AND email LIKE '%@%'").get();
    const withPhone = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE phone != ''").get();

    const overdueFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM contacts WHERE follow_up_date != '' AND follow_up_date <= date('now')
    `).get();

    const upcomingFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM contacts WHERE follow_up_date != '' AND follow_up_date > date('now') AND follow_up_date <= date('now', '+7 days')
    `).get();

    const recentActivity = db.prepare(`
      SELECT a.*, c.first_name, c.last_name FROM activities a
      JOIN contacts c ON a.contact_id = c.id
      ORDER BY a.created_at DESC LIMIT 10
    `).all();

    res.json({
      total: total.count,
      withEmail: withEmail.count,
      withPhone: withPhone.count,
      stages: Object.fromEntries(stages.map(s => [s.stage, s.count])),
      sources,
      overdueFollowups: overdueFollowups.count,
      upcomingFollowups: upcomingFollowups.count,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single contact with activities
app.get('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const activities = db.prepare(
      'SELECT * FROM activities WHERE contact_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);

    res.json({ ...contact, activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create contact
app.post('/api/contacts', (req, res) => {
  const { first_name, last_name, email, phone, address, source, stage, notes, follow_up_date, follow_up_note } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO contacts (first_name, last_name, email, phone, address, source, stage, notes, follow_up_date, follow_up_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      first_name || '', last_name || '', email || '', phone || '',
      address || '', source || '', stage || 'lead', notes || '',
      follow_up_date || '', follow_up_note || ''
    );

    // Log activity
    db.prepare(`
      INSERT INTO activities (contact_id, type, description) VALUES (?, 'created', 'Contact added to CRM')
    `).run(result.lastInsertRowid);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update contact
app.put('/api/contacts/:id', (req, res) => {
  const fields = ['first_name', 'last_name', 'email', 'phone', 'address', 'source', 'stage', 'notes', 'follow_up_date', 'follow_up_note'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  try {
    // Check for stage change to log it
    const old = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Contact not found' });

    db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Log stage change
    if (req.body.stage && req.body.stage !== old.stage) {
      db.prepare(`
        INSERT INTO activities (contact_id, type, description) VALUES (?, 'stage_change', ?)
      `).run(req.params.id, `Stage changed: ${old.stage} → ${req.body.stage}`);
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact
app.delete('/api/contacts/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM activities WHERE contact_id = ?').run(req.params.id);
    db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add activity to contact
app.post('/api/contacts/:id/activities', (req, res) => {
  const { type, description } = req.body;
  try {
    db.prepare(`
      INSERT INTO activities (contact_id, type, description) VALUES (?, ?, ?)
    `).run(req.params.id, type || 'note', description || '');

    db.prepare("UPDATE contacts SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    const activities = db.prepare(
      'SELECT * FROM activities WHERE contact_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import
app.post('/api/import', (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });

  const insert = db.prepare(`
    INSERT INTO contacts (first_name, last_name, email, phone, address, source, stage, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const logActivity = db.prepare(`
    INSERT INTO activities (contact_id, type, description) VALUES (?, 'imported', 'Imported from Google Sheets')
  `);

  const tx = db.transaction((contacts) => {
    let imported = 0;
    for (const c of contacts) {
      const result = insert.run(
        c.first_name || '', c.last_name || '', c.email || '', c.phone || '',
        c.address || '', c.source || '', c.stage || 'lead', c.notes || ''
      );
      logActivity.run(result.lastInsertRowid);
      imported++;
    }
    return imported;
  });

  try {
    const imported = tx(contacts);
    res.json({ success: true, imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export contacts as CSV
app.get('/api/export', (req, res) => {
  try {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY stage, last_name, first_name').all();
    let csv = 'First Name,Last Name,Email,Phone,Address,Source,Stage,Notes,Follow Up Date,Follow Up Note\n';
    for (const c of contacts) {
      csv += [c.first_name, c.last_name, c.email, c.phone, `"${(c.address||'').replace(/"/g,'""')}"`, c.source, c.stage, `"${(c.notes||'').replace(/"/g,'""')}"`, c.follow_up_date, `"${(c.follow_up_note||'').replace(/"/g,'""')}"`].join(',') + '\n';
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=crm_export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CRM server running on port ${PORT}`);
});
