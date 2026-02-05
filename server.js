const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize data file if it doesn't exist
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      clients: [],
      stages: ['Lead', 'Active Buyer', 'Active Seller', 'Under Contract', 'Closed', 'Past Client'],
      activityTypes: ['Call', 'Email', 'Text', 'Showing', 'Meeting', 'Note', 'Follow-up']
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all clients
app.get('/api/clients', (req, res) => {
  const data = loadData();
  res.json(data.clients);
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
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: req.body.name || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    address: req.body.address || '',
    stage: req.body.stage || 'Lead',
    source: req.body.source || '',
    notes: req.body.notes || '',
    activities: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastContactDate: null
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

  const allowed = ['name', 'phone', 'email', 'address', 'stage', 'source', 'notes'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      data.clients[idx][field] = req.body[field];
    }
  });
  data.clients[idx].updatedAt = new Date().toISOString();
  saveData(data);
  res.json(data.clients[idx]);
});

// DELETE client
app.delete('/api/clients/:id', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });
  data.clients.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// POST activity to client
app.post('/api/clients/:id/activities', (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const activity = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    type: req.body.type || 'Note',
    description: req.body.description || '',
    date: req.body.date || new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  client.activities.unshift(activity);
  client.lastContactDate = activity.date;
  client.updatedAt = new Date().toISOString();
  saveData(data);
  res.status(201).json(activity);
});

// DELETE activity
app.delete('/api/clients/:id/activities/:actId', (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  
  const actIdx = client.activities.findIndex(a => a.id === req.params.actId);
  if (actIdx === -1) return res.status(404).json({ error: 'Activity not found' });
  client.activities.splice(actIdx, 1);
  client.updatedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true });
});

// GET stages
app.get('/api/stages', (req, res) => {
  const data = loadData();
  res.json(data.stages);
});

// GET activity types
app.get('/api/activity-types', (req, res) => {
  const data = loadData();
  res.json(data.activityTypes);
});

// GET stats/dashboard
app.get('/api/stats', (req, res) => {
  const data = loadData();
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  
  const stats = {
    total: data.clients.length,
    byStage: {},
    needsFollowUp: 0,
    recentActivity: 0
  };
  
  data.stages.forEach(s => stats.byStage[s] = 0);
  
  data.clients.forEach(c => {
    if (stats.byStage[c.stage] !== undefined) stats.byStage[c.stage]++;
    
    const lastContact = c.lastContactDate ? new Date(c.lastContactDate) : null;
    if (!lastContact || lastContact < thirtyDaysAgo) stats.needsFollowUp++;
    
    if (c.activities && c.activities.length > 0) {
      const latest = new Date(c.activities[0].date);
      if (latest > thirtyDaysAgo) stats.recentActivity++;
    }
  });
  
  res.json(stats);
});

// Import clients (bulk)
app.post('/api/import', (req, res) => {
  const data = loadData();
  const imported = [];
  
  (req.body.clients || []).forEach(c => {
    const client = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + imported.length,
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      stage: c.stage || 'Lead',
      source: c.source || '',
      notes: c.notes || '',
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastContactDate: c.lastContactDate || null
    };
    data.clients.push(client);
    imported.push(client);
  });
  
  saveData(data);
  res.json({ imported: imported.length });
});

app.listen(PORT, () => {
  console.log(`CRM server running on port ${PORT}`);
});
