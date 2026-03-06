require('dotenv').config();
const express = require('express');
const path = require('path');

// Import database layer (Supabase when configured, JSON fallback)
const db = require('./services/db');
const openphone = require('./services/openphone');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Client API Endpoints
// ============================================

// GET all clients
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await db.getClients({
      stage: req.query.stage,
      leadSource: req.query.source,
      leadType: req.query.leadType,
      search: req.query.search
    });
    
    res.json({
      clients,
      stages: db.STAGES,
      leadSources: db.LEAD_SOURCES,
      leadTypes: db.LEAD_TYPES,
      clientTypes: db.CLIENT_TYPES,
      propertyTypes: db.PROPERTY_TYPES
    });
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single client
app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await db.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new client
app.post('/api/clients', async (req, res) => {
  try {
    const client = await db.createClient(req.body);
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const existing = await db.getClient(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    
    // Track stage changes for activity log
    const updates = { ...req.body };
    if (req.body.stage && req.body.stage !== existing.stage) {
      const activityLog = existing.activityLog || [];
      activityLog.push({
        timestamp: new Date().toISOString(),
        action: 'Stage Changed',
        details: `${existing.stage} → ${req.body.stage}`
      });
      updates.activityLog = activityLog;
      updates.lastActivity = new Date().toISOString();
    }
    
    const client = await db.updateClient(req.params.id, updates);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    await db.deleteClient(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add activity log entry
app.post('/api/clients/:id/activity', async (req, res) => {
  try {
    const client = await db.addActivity(req.params.id, {
      action: req.body.action || 'Note',
      details: req.body.details || ''
    });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH move client to different stage
app.patch('/api/clients/:id/stage', async (req, res) => {
  try {
    const existing = await db.getClient(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    
    const activityLog = existing.activityLog || [];
    activityLog.push({
      timestamp: new Date().toISOString(),
      action: 'Stage Changed',
      details: `${existing.stage} → ${req.body.stage}`
    });
    
    const client = await db.updateClient(req.params.id, {
      stage: req.body.stage,
      activityLog,
      lastActivity: new Date().toISOString()
    });
    
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH bulk update lead type
app.patch('/api/clients/bulk/leadType', async (req, res) => {
  try {
    const { clientIds, leadType } = req.body;
    
    if (!clientIds || !Array.isArray(clientIds)) {
      return res.status(400).json({ error: 'clientIds array required' });
    }
    if (!leadType || !db.LEAD_TYPES.includes(leadType)) {
      return res.status(400).json({ error: 'Valid leadType required', validTypes: db.LEAD_TYPES });
    }
    
    const result = await db.bulkUpdateLeadType(clientIds, leadType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET lead types list
app.get('/api/leadTypes', (req, res) => {
  res.json({ leadTypes: db.LEAD_TYPES });
});

// GET dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET follow-up reminders
app.get('/api/followups', async (req, res) => {
  try {
    const followups = await db.getFollowUps();
    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST mark client as contacted
app.post('/api/clients/:id/contacted', async (req, res) => {
  try {
    const existing = await db.getClient(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    
    const now = new Date().toISOString();
    const activityLog = existing.activityLog || [];
    
    activityLog.push({
      timestamp: now,
      action: 'Contacted',
      details: req.body.notes || 'Marked as contacted'
    });
    
    const updates = {
      activityLog,
      lastActivity: now,
      followUpDate: req.body.nextFollowUp || null
    };
    
    if (req.body.nextFollowUp) {
      activityLog.push({
        timestamp: now,
        action: 'Follow-up Set',
        details: `Next follow-up: ${req.body.nextFollowUp}`
      });
    }
    
    if (req.body.nextAction) {
      updates.nextAction = req.body.nextAction;
    }
    
    const client = await db.updateClient(req.params.id, updates);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST import clients (for CSV import)
app.post('/api/import', async (req, res) => {
  try {
    const imported = req.body.clients || [];
    const count = await db.importClients(imported);
    const stats = await db.getStats();
    res.json({ imported: count, total: stats.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET clients with alerts enabled
app.get('/api/alerts/subscribers', async (req, res) => {
  try {
    const subscribers = await db.getAlertSubscribers();
    res.json({ subscribers, count: subscribers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update client alerts
app.put('/api/clients/:id/alerts', async (req, res) => {
  try {
    const existing = await db.getClient(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    
    const now = new Date().toISOString();
    const activityLog = existing.activityLog || [];
    
    activityLog.push({
      timestamp: now,
      action: 'Alerts Updated',
      details: req.body.enabled ? 'Property alerts enabled' : 'Alert criteria updated'
    });
    
    const alerts = {
      ...existing.alerts,
      ...req.body,
      criteria: {
        ...(existing.alerts?.criteria || {}),
        ...(req.body.criteria || {})
      }
    };
    
    const client = await db.updateClient(req.params.id, { alerts, activityLog });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// OpenPhone Integration
// ============================================

const fs = require('fs');
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
app.post('/api/openphone/webhook', async (req, res) => {
  console.log('OpenPhone webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    const event = openphone.processWebhookEvent(req.body);
    const callsData = loadCalls();
    
    // Find matching client by phone number
    const phoneNormalized = openphone.normalizePhone(event.phoneNumber);
    const clients = await db.getClients();
    const matchingClient = clients.find(c => 
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
    if (callsData.calls.length > 1000) {
      callsData.calls = callsData.calls.slice(0, 1000);
    }
    saveCalls(callsData);
    
    // If we found a matching client, add to their activity log
    if (matchingClient) {
      const action = event.type.includes('call') 
        ? (event.direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call')
        : (event.direction === 'inbound' ? 'SMS Received' : 'SMS Sent');
      
      const details = event.type.includes('call')
        ? `Duration: ${event.duration || 0}s | Status: ${event.status || 'completed'}`
        : `Message: ${(event.body || '').substring(0, 100)}`;
      
      await db.addActivity(matchingClient.id, {
        action,
        details,
        callId: event.callId,
        messageId: event.messageId
      });
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
  
  if (req.query.clientId) {
    calls = calls.filter(c => c.clientId === req.query.clientId);
  }
  if (req.query.phone) {
    const phoneNorm = openphone.normalizePhone(req.query.phone);
    calls = calls.filter(c => openphone.normalizePhone(c.phoneNumber) === phoneNorm);
  }
  if (req.query.type) {
    calls = calls.filter(c => c.type.includes(req.query.type));
  }
  
  const limit = parseInt(req.query.limit) || 50;
  calls = calls.slice(0, limit);
  
  res.json({ calls, total: callsData.calls.length });
});

// GET call details
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
app.get('/api/clients/:id/calls', async (req, res) => {
  try {
    const client = await db.getClient(req.params.id);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync client to OpenPhone contacts
app.post('/api/clients/:id/sync-openphone', async (req, res) => {
  try {
    const client = await db.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    const contact = await openphone.createContact({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone
    });
    
    await db.updateClient(req.params.id, {
      openPhoneContactId: contact.data?.id
    });
    
    await db.addActivity(req.params.id, {
      action: 'OpenPhone Sync',
      details: 'Contact synced to OpenPhone'
    });
    
    res.json({ success: true, contact: contact.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET OpenPhone status
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

// GET database status
app.get('/api/status', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({
      database: db.USE_SUPABASE ? 'supabase' : 'local-json',
      persistent: db.USE_SUPABASE,
      totalClients: stats.total,
      openphone: !!process.env.OPENPHONE_API_KEY
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏠 THHT CRM running on port ${PORT}`);
  console.log(`📊 Database: ${db.USE_SUPABASE ? 'Supabase (persistent)' : 'Local JSON (ephemeral)'}`);
  console.log(`📞 OpenPhone: ${process.env.OPENPHONE_API_KEY ? 'ENABLED' : 'NOT CONFIGURED'}\n`);
});
