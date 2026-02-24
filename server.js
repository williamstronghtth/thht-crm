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

// Lead types for categorizing leads
const LEAD_TYPES = [
  'warm',       // Warm leads - engaged, showing interest
  'cold',       // Cold leads - new, not yet contacted
  'divorce',    // Divorce leads - property from divorce proceedings
  'probate',    // Probate leads - inherited property
  'pre-foreclosure', // Pre-foreclosure leads
  'expired',    // Expired listings
  'fsbo',       // For Sale By Owner
  'investor',   // Investment property leads
  'referral',   // Referral from past clients
  'sphere',     // Sphere of influence
  'other'       // Uncategorized
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
  
  // Filter by lead type if provided
  if (req.query.leadType) {
    clients = clients.filter(c => c.leadType === req.query.leadType);
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
  
  res.json({ clients, stages: STAGES, leadSources: LEAD_SOURCES, leadTypes: LEAD_TYPES, clientTypes: CLIENT_TYPES, propertyTypes: PROPERTY_TYPES });
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
    leadType: req.body.leadType || 'cold',
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

// PATCH bulk update lead type for multiple clients
app.patch('/api/clients/bulk/leadType', (req, res) => {
  const data = loadData();
  const { clientIds, leadType } = req.body;
  
  if (!clientIds || !Array.isArray(clientIds)) {
    return res.status(400).json({ error: 'clientIds array required' });
  }
  
  if (!leadType || !LEAD_TYPES.includes(leadType)) {
    return res.status(400).json({ error: 'Valid leadType required', validTypes: LEAD_TYPES });
  }
  
  let updated = 0;
  const now = new Date().toISOString();
  
  clientIds.forEach(id => {
    const idx = data.clients.findIndex(c => c.id === id);
    if (idx !== -1) {
      const oldType = data.clients[idx].leadType || 'cold';
      data.clients[idx].leadType = leadType;
      data.clients[idx].updatedAt = now;
      data.clients[idx].activityLog.push({
        timestamp: now,
        action: 'Lead Type Changed',
        details: `${oldType} → ${leadType}`
      });
      updated++;
    }
  });
  
  saveData(data);
  res.json({ updated, total: clientIds.length });
});

// GET lead types list
app.get('/api/leadTypes', (req, res) => {
  res.json({ leadTypes: LEAD_TYPES });
});

// GET dashboard stats
app.get('/api/stats', (req, res) => {
  const data = loadData();
  const stats = {
    total: data.clients.length,
    byStage: {},
    bySource: {},
    byLeadType: {},
    needsFollowUp: 0,
    overdueCount: 0,
    todayCount: 0,
    thisWeekCount: 0
  };
  
  STAGES.forEach(s => stats.byStage[s] = 0);
  LEAD_SOURCES.forEach(s => stats.bySource[s] = 0);
  LEAD_TYPES.forEach(t => stats.byLeadType[t] = 0);
  
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  data.clients.forEach(c => {
    stats.byStage[c.stage] = (stats.byStage[c.stage] || 0) + 1;
    stats.bySource[c.leadSource] = (stats.bySource[c.leadSource] || 0) + 1;
    stats.byLeadType[c.leadType || 'cold'] = (stats.byLeadType[c.leadType || 'cold'] || 0) + 1;
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
      leadType: c.leadType || 'cold',
      leadSource: c.leadSource || 'Other',
      followUpDate: c.followUpDate || null,
      nextAction: c.nextAction || '',
      notes: c.notes || '',
      activityLog: [{
        timestamp: new Date().toISOString(),
        action: 'Imported',
        details: `Imported from CSV (Source: ${c.leadSource || 'Unknown'}, Type: ${c.leadType || 'cold'})`
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

// ========================================
// OpenPhone Integration
// ========================================
const openphone = require('./services/openphone');

// Store call logs (will be synced to client records)
const CALLS_FILE = path.join(__dirname, 'calls.json');

function loadCalls() {
  if (!fs.existsSync(CALLS_FILE)) {
    fs.writeFileSync(CALLS_FILE, JSON.stringify({ calls: [] }, null, 2));
    return { calls: [] };
  }
  return JSON.parse(fs.readFileSync(CALLS_FILE, 'utf8'));
}

function saveCalls(data) {
  fs.writeFileSync(CALLS_FILE, JSON.stringify(data, null, 2));
}

// Webhook endpoint for OpenPhone events
app.post('/api/openphone/webhook', (req, res) => {
  console.log('OpenPhone webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    const event = openphone.processWebhookEvent(req.body);
    const callsData = loadCalls();
    const clientsData = loadData();
    
    // Find matching client by phone number
    const phoneNormalized = openphone.normalizePhone(event.phoneNumber);
    const matchingClient = clientsData.clients.find(c => 
      openphone.normalizePhone(c.phone) === phoneNormalized
    );
    
    // Create call/message log entry
    const logEntry = {
      id: event.callId || event.messageId || Date.now().toString(),
      type: event.type,
      direction: event.direction,
      phoneNumber: event.phoneNumber,
      from: event.from,
      to: event.to,
      duration: event.duration,
      status: event.status,
      body: event.body,
      clientId: matchingClient?.id || null,
      clientName: matchingClient ? `${matchingClient.firstName} ${matchingClient.lastName}` : null,
      timestamp: event.timestamp,
      raw: event.raw
    };
    
    // Store the call log
    callsData.calls.unshift(logEntry);
    // Keep last 1000 calls
    if (callsData.calls.length > 1000) {
      callsData.calls = callsData.calls.slice(0, 1000);
    }
    saveCalls(callsData);
    
    // If we found a matching client, add to their activity log
    if (matchingClient) {
      const idx = clientsData.clients.findIndex(c => c.id === matchingClient.id);
      if (idx !== -1) {
        const action = event.type.includes('call') 
          ? (event.direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call')
          : (event.direction === 'inbound' ? 'SMS Received' : 'SMS Sent');
        
        const details = event.type.includes('call')
          ? `Duration: ${event.duration || 0}s | Status: ${event.status || 'completed'}`
          : `Message: ${(event.body || '').substring(0, 100)}`;
        
        clientsData.clients[idx].activityLog.push({
          timestamp: event.timestamp,
          action,
          details,
          callId: event.callId,
          messageId: event.messageId
        });
        clientsData.clients[idx].lastActivity = event.timestamp;
        saveData(clientsData);
      }
    }
    
    res.json({ success: true, logged: true, clientMatched: !!matchingClient });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET all call logs
app.get('/api/calls', (req, res) => {
  const callsData = loadCalls();
  let calls = callsData.calls;
  
  // Filter by client ID
  if (req.query.clientId) {
    calls = calls.filter(c => c.clientId === req.query.clientId);
  }
  
  // Filter by phone number
  if (req.query.phone) {
    const phoneNorm = openphone.normalizePhone(req.query.phone);
    calls = calls.filter(c => openphone.normalizePhone(c.phoneNumber) === phoneNorm);
  }
  
  // Filter by type
  if (req.query.type) {
    calls = calls.filter(c => c.type.includes(req.query.type));
  }
  
  // Limit results
  const limit = parseInt(req.query.limit) || 50;
  calls = calls.slice(0, limit);
  
  res.json({ calls, total: callsData.calls.length });
});

// GET call details (recordings, transcription, summary)
app.get('/api/calls/:callId', async (req, res) => {
  try {
    const [call, recordings, transcription, summary] = await Promise.all([
      openphone.getCall(req.params.callId).catch(() => null),
      openphone.getCallRecordings(req.params.callId).catch(() => null),
      openphone.getCallTranscription(req.params.callId).catch(() => null),
      openphone.getCallSummary(req.params.callId).catch(() => null)
    ]);
    
    res.json({ call, recordings, transcription, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET calls for a specific client
app.get('/api/clients/:id/calls', (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  
  const callsData = loadCalls();
  const phoneNorm = openphone.normalizePhone(client.phone);
  
  const clientCalls = callsData.calls.filter(c => 
    c.clientId === client.id || 
    openphone.normalizePhone(c.phoneNumber) === phoneNorm
  );
  
  res.json({ 
    calls: clientCalls,
    clickToCall: openphone.getClickToCallUrl(client.phone),
    openPhoneLink: openphone.getOpenPhoneDeepLink(client.phone)
  });
});

// POST sync client to OpenPhone contacts
app.post('/api/clients/:id/sync-openphone', async (req, res) => {
  const data = loadData();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  
  try {
    const contact = await openphone.createContact({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone
    });
    
    // Store OpenPhone contact ID on client record
    const idx = data.clients.findIndex(c => c.id === req.params.id);
    data.clients[idx].openPhoneContactId = contact.data?.id;
    data.clients[idx].activityLog.push({
      timestamp: new Date().toISOString(),
      action: 'OpenPhone Sync',
      details: 'Contact synced to OpenPhone'
    });
    saveData(data);
    
    res.json({ success: true, contact: contact.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync all clients to OpenPhone
app.post('/api/openphone/sync-all', async (req, res) => {
  const data = loadData();
  const results = { synced: 0, failed: 0, errors: [] };
  
  for (const client of data.clients) {
    if (!client.phone) continue;
    
    try {
      await openphone.createContact({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone
      });
      results.synced++;
    } catch (err) {
      results.failed++;
      results.errors.push({ clientId: client.id, error: err.message });
    }
    
    // Rate limit - wait 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }
  
  res.json(results);
});

// GET OpenPhone status/health check
app.get('/api/openphone/status', async (req, res) => {
  try {
    const webhooks = await openphone.listWebhooks().catch(() => ({ data: [] }));
    res.json({
      configured: !!process.env.OPENPHONE_API_KEY,
      phoneNumber: openphone.OPENPHONE_NUMBER,
      webhooksConfigured: webhooks.data?.length || 0
    });
  } catch (err) {
    res.json({
      configured: !!process.env.OPENPHONE_API_KEY,
      error: err.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`THHT CRM running on port ${PORT}`);
  console.log(`OpenPhone integration: ${process.env.OPENPHONE_API_KEY ? 'ENABLED' : 'NOT CONFIGURED'}`);
});
