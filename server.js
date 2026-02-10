const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pipeline stages
const STAGES = ['lead', 'active', 'contract', 'closed', 'past'];

// Lead sources from Chris's data
const LEAD_SOURCES = [
  'Cold Calling', 'Letter', 'Sold.com', 'Close AI', 'OPCity',
  'Qazzoo', 'KvCORE', 'CB Lead', 'Door Knocking', 'Buyers',
  'Website Home Evaluation', 'EDDM', 'Renter', 'Open House', 'Other'
];

// Initialize data file if it doesn't exist
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      stages: STAGES,
      leadSources: LEAD_SOURCES,
      clients: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all clients
app.get('/api/clients', (req, res) => {
  const data = loadData();
  let clients = data.clients;
  
  // Filter by stage if provided
  if (req.query.stage) {
    clients = clients.filter(c => c.stage === req.query.stage);
  }
  
  // Filter by lead source if provided
  if (req.query.source) {
    clients = clients.filter(c => c.leadSource === req.query.source);
  }
  
  // Search by name/email/phone
  if (req.query.search) {
    const s = req.query.search.toLowerCase();
    clients = clients.filter(c => 
      c.firstName.toLowerCase().includes(s) ||
      c.lastName.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      c.phone.includes(s)
    );
  }
  
  res.json({ clients, stages: STAGES, leadSources: LEAD_SOURCES });
});

// GET single client
app.get('/api/clients/:id', (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// POST new client
app.post('/api/clients', (req, res) => {
  const data = loadData();
  const client = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    address: req.body.address || '',
    stage: req.body.stage || 'lead',
    leadSource: req.body.leadSource || 'Other',
    followUpDate: req.body.followUpDate || null,
    nextAction: req.body.nextAction || '',
    notes: req.body.notes || '',
    activityLog: [{
      timestamp: new Date().toISOString(),
      action: 'Created',
      details: 'Client added to CRM'
    }],
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.clients.push(client);
  saveData(data);
  res.status(201).json(client);
});

// PUT update client
app.put('/api/clients/:id', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  const oldClient = data.clients[idx];
  const changes = [];
  
  // Track stage changes
  if (req.body.stage && req.body.stage !== oldClient.stage) {
    changes.push(`Stage: ${oldClient.stage} → ${req.body.stage}`);
  }

  data.clients[idx] = {
    ...oldClient,
    ...req.body,
    id: oldClient.id,
    activityLog: oldClient.activityLog,
    createdAt: oldClient.createdAt,
    updatedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  
  // Add activity log entry for changes
  if (changes.length > 0) {
    data.clients[idx].activityLog.push({
      timestamp: new Date().toISOString(),
      action: 'Updated',
      details: changes.join('; ')
    });
  }
  
  saveData(data);
  res.json(data.clients[idx]);
});

// POST add activity log entry
app.post('/api/clients/:id/activity', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  const entry = {
    timestamp: new Date().toISOString(),
    action: req.body.action || 'Note',
    details: req.body.details || ''
  };
  
  data.clients[idx].activityLog.push(entry);
  data.clients[idx].lastActivity = entry.timestamp;
  data.clients[idx].updatedAt = entry.timestamp;
  
  saveData(data);
  res.json(data.clients[idx]);
});

// PATCH move client to different stage
app.patch('/api/clients/:id/stage', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  const oldStage = data.clients[idx].stage;
  data.clients[idx].stage = req.body.stage;
  data.clients[idx].updatedAt = new Date().toISOString();
  data.clients[idx].lastActivity = new Date().toISOString();
  
  data.clients[idx].activityLog.push({
    timestamp: new Date().toISOString(),
    action: 'Stage Changed',
    details: `${oldStage} → ${req.body.stage}`
  });
  
  saveData(data);
  res.json(data.clients[idx]);
});

// DELETE client
app.delete('/api/clients/:id', (req, res) => {
  const data = loadData();
  data.clients = data.clients.filter(c => c.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// GET dashboard stats
app.get('/api/stats', (req, res) => {
  const data = loadData();
  const stats = {
    total: data.clients.length,
    byStage: {},
    bySource: {},
    needsFollowUp: 0
  };
  
  STAGES.forEach(s => stats.byStage[s] = 0);
  LEAD_SOURCES.forEach(s => stats.bySource[s] = 0);
  
  const today = new Date().toISOString().split('T')[0];
  
  data.clients.forEach(c => {
    stats.byStage[c.stage] = (stats.byStage[c.stage] || 0) + 1;
    stats.bySource[c.leadSource] = (stats.bySource[c.leadSource] || 0) + 1;
    if (c.followUpDate && c.followUpDate <= today) {
      stats.needsFollowUp++;
    }
  });
  
  res.json(stats);
});

// POST import clients (for CSV import)
app.post('/api/import', (req, res) => {
  const data = loadData();
  const imported = req.body.clients || [];
  
  imported.forEach(c => {
    const client = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      stage: c.stage || 'lead',
      leadSource: c.leadSource || 'Other',
      followUpDate: c.followUpDate || null,
      nextAction: c.nextAction || '',
      notes: c.notes || '',
      activityLog: [{
        timestamp: new Date().toISOString(),
        action: 'Imported',
        details: `Imported from CSV (Source: ${c.leadSource || 'Unknown'})`
      }],
      lastActivity: c.lastActivity || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.clients.push(client);
  });
  
  saveData(data);
  res.json({ imported: imported.length, total: data.clients.length });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`THHT CRM running on port ${PORT}`);
});
