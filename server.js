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
  
  res.json({ clients, stages: STAGES, leadSources: LEAD_SOURCES, clientTypes: CLIENT_TYPES, propertyTypes: PROPERTY_TYPES });
});

// GET single client
app.get('/api/clients/:id', (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// Client types
const CLIENT_TYPES = ['buyer', 'seller', 'both', 'investor', 'past'];

// Property types for alerts
const PROPERTY_TYPES = ['single-family', 'townhouse', 'condo', 'multi-family', 'land', 'commercial'];

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
    clientType: req.body.clientType || 'buyer',
    leadSource: req.body.leadSource || 'Other',
    followUpDate: req.body.followUpDate || null,
    nextAction: req.body.nextAction || '',
    notes: req.body.notes || '',
    // Property Alert System fields
    alerts: req.body.alerts || {
      enabled: false,
      method: 'email',
      frequency: 'daily',
      criteria: {
        locations: [],
        priceMin: null,
        priceMax: null,
        bedsMin: null,
        bathsMin: null,
        propertyTypes: [],
        yearBuiltMax: null,
        maxStories: null,
        minCapRate: null,
        customNotes: ''
      }
    },
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
    needsFollowUp: 0,
    overdueCount: 0,
    todayCount: 0,
    thisWeekCount: 0
  };
  
  STAGES.forEach(s => stats.byStage[s] = 0);
  LEAD_SOURCES.forEach(s => stats.bySource[s] = 0);
  
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  data.clients.forEach(c => {
    stats.byStage[c.stage] = (stats.byStage[c.stage] || 0) + 1;
    stats.bySource[c.leadSource] = (stats.bySource[c.leadSource] || 0) + 1;
    if (c.followUpDate) {
      if (c.followUpDate < today) {
        stats.overdueCount++;
        stats.needsFollowUp++;
      } else if (c.followUpDate === today) {
        stats.todayCount++;
        stats.needsFollowUp++;
      } else if (c.followUpDate <= weekFromNow) {
        stats.thisWeekCount++;
      }
    }
  });
  
  res.json(stats);
});

// GET follow-up reminders
app.get('/api/followups', (req, res) => {
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  
  data.clients.forEach(c => {
    if (!c.followUpDate) return;
    
    const item = {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      email: c.email,
      stage: c.stage,
      leadSource: c.leadSource,
      followUpDate: c.followUpDate,
      nextAction: c.nextAction,
      lastActivity: c.lastActivity
    };
    
    if (c.followUpDate < today) {
      overdue.push(item);
    } else if (c.followUpDate === today) {
      dueToday.push(item);
    } else if (c.followUpDate <= weekFromNow) {
      upcoming.push(item);
    }
  });
  
  // Sort by date
  overdue.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  upcoming.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  
  res.json({
    overdue,
    dueToday,
    upcoming,
    summary: {
      overdueCount: overdue.length,
      todayCount: dueToday.length,
      upcomingCount: upcoming.length,
      totalNeedsAttention: overdue.length + dueToday.length
    }
  });
});

// POST mark client as contacted (quick action)
app.post('/api/clients/:id/contacted', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  const client = data.clients[idx];
  const now = new Date().toISOString();
  
  // Log the contact
  client.activityLog.push({
    timestamp: now,
    action: 'Contacted',
    details: req.body.notes || 'Marked as contacted'
  });
  
  client.lastActivity = now;
  client.updatedAt = now;
  
  // Set next follow-up if provided
  if (req.body.nextFollowUp) {
    client.followUpDate = req.body.nextFollowUp;
    client.activityLog.push({
      timestamp: now,
      action: 'Follow-up Set',
      details: `Next follow-up: ${req.body.nextFollowUp}`
    });
  } else {
    // Clear follow-up date
    client.followUpDate = null;
  }
  
  if (req.body.nextAction) {
    client.nextAction = req.body.nextAction;
  }
  
  saveData(data);
  res.json(client);
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

// GET clients with alerts enabled (for Property Alert System)
app.get('/api/alerts/subscribers', (req, res) => {
  const data = loadData();
  const subscribers = data.clients
    .filter(c => c.alerts?.enabled)
    .map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      clientType: c.clientType,
      alerts: c.alerts
    }));
  
  res.json({ 
    subscribers,
    count: subscribers.length
  });
});

// PUT update client alerts
app.put('/api/clients/:id/alerts', (req, res) => {
  const data = loadData();
  const idx = data.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  const client = data.clients[idx];
  const now = new Date().toISOString();
  
  // Update alerts
  client.alerts = {
    ...client.alerts,
    ...req.body,
    criteria: {
      ...(client.alerts?.criteria || {}),
      ...(req.body.criteria || {})
    }
  };
  
  client.updatedAt = now;
  
  // Log the change
  client.activityLog.push({
    timestamp: now,
    action: 'Alerts Updated',
    details: req.body.enabled ? 'Property alerts enabled' : 'Alert criteria updated'
  });
  
  saveData(data);
  res.json(client);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`THHT CRM running on port ${PORT}`);
});
