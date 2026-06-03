/**
 * Database Abstraction Layer
 * Uses Supabase when configured, falls back to local JSON.
 * Includes cache layer for graceful degradation when Supabase is unreachable.
 */

const fs = require('fs');
const path = require('path');
const cache = require('./cache');

// Check for Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

let supabase = null;
if (USE_SUPABASE) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Database: Supabase (persistent) + cache fallback');
} else {
  console.log('⚠️ Database: Local JSON (data will not persist across deploys)');
}

// Local JSON fallback
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Constants
const STAGES = ['lead', 'active', 'contract', 'closed', 'past'];
const LEAD_SOURCES = [
  'Cold Calling', 'Letter', 'Sold.com', 'Close AI', 'OPCity',
  'Qazzoo', 'KvCORE', 'CB Lead', 'Door Knocking', 'Buyers',
  'Website Home Evaluation', 'EDDM', 'Renter', 'Open House', 'Other'
];
const LEAD_TYPES = [
  'warm', 'cold', 'divorce', 'probate', 'pre-foreclosure',
  'expired', 'fsbo', 'investor', 'referral', 'sphere', 'other'
];
const CLIENT_TYPES = ['buyer', 'seller', 'both', 'investor', 'past'];
const PROPERTY_TYPES = ['single-family', 'townhouse', 'condo', 'multi-family', 'land', 'commercial'];

// ============================================
// Helper Functions
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function camelToSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    converted[snakeKey] = value;
  }
  return converted;
}

function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = value;
  }
  return converted;
}

// ============================================
// Local JSON Functions
// ============================================

function loadLocalData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { stages: STAGES, leadSources: LEAD_SOURCES, clients: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveLocalData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ============================================
// Database Operations
// ============================================

async function getClients(filters = {}) {
  if (USE_SUPABASE) {
    const supabaseOp = async () => {
      // Supabase defaults to 1000 row limit — override to fetch all clients
      let query = supabase.from('clients').select('*').range(0, 4999);
      
      if (filters.stage) query = query.eq('stage', filters.stage);
      if (filters.leadSource) query = query.eq('lead_source', filters.leadSource);
      if (filters.leadType) query = query.eq('lead_type', filters.leadType);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      
      const { data, error } = await query.order('updated_at', { ascending: false });
      if (error) throw error;
      return data.map(snakeToCamel);
    };

    const cacheFallback = () => {
      const cached = cache.loadSnapshot();
      if (!cached) return null;
      let clients = cached;
      // Apply filters to cached data
      if (filters.stage) clients = clients.filter(c => c.stage === filters.stage);
      if (filters.leadSource) clients = clients.filter(c => c.leadSource === filters.leadSource);
      if (filters.leadType) clients = clients.filter(c => c.leadType === filters.leadType);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        clients = clients.filter(c => 
          (c.firstName || '').toLowerCase().includes(s) ||
          (c.lastName || '').toLowerCase().includes(s) ||
          (c.email || '').toLowerCase().includes(s) ||
          (c.phone || '').includes(s)
        );
      }
      return clients;
    };

    // Unfiltered calls update the cache; filtered calls don't (partial data)
    const isFullList = !filters.stage && !filters.leadSource && !filters.leadType && !filters.search;
    const result = await cache.withFallback(supabaseOp, cacheFallback, { isFullList });
    return result.data;
  } else {
    const data = loadLocalData();
    let clients = data.clients;
    
    if (filters.stage) clients = clients.filter(c => c.stage === filters.stage);
    if (filters.leadSource) clients = clients.filter(c => c.leadSource === filters.leadSource);
    if (filters.leadType) clients = clients.filter(c => c.leadType === filters.leadType);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      clients = clients.filter(c => 
        (c.firstName || '').toLowerCase().includes(s) ||
        (c.lastName || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s)
      );
    }
    
    return clients;
  }
}

async function getClient(id) {
  if (USE_SUPABASE) {
    const supabaseOp = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return snakeToCamel(data);
    };

    const cacheFallback = () => {
      const cached = cache.loadSnapshot();
      if (!cached) return null;
      return cached.find(c => c.id === id) || null;
    };

    const result = await cache.withFallback(supabaseOp, cacheFallback);
    return result.data;
  } else {
    const data = loadLocalData();
    return data.clients.find(c => c.id === id) || null;
  }
}

async function createClient(clientData) {
  if (USE_SUPABASE && cache.isReadOnly) {
    throw new Error('CRM is in read-only mode — Supabase is temporarily unreachable. Try again later.');
  }
  const client = {
    id: generateId(),
    firstName: clientData.firstName || '',
    lastName: clientData.lastName || '',
    email: clientData.email || '',
    phone: clientData.phone || '',
    address: clientData.address || '',
    stage: clientData.stage || 'lead',
    clientType: clientData.clientType || 'buyer',
    leadType: clientData.leadType || 'cold',
    leadSource: clientData.leadSource || 'Other',
    followUpDate: clientData.followUpDate || null,
    nextAction: clientData.nextAction || '',
    notes: clientData.notes || '',
    alerts: clientData.alerts || {
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

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('clients')
      .insert(camelToSnake(client))
      .select()
      .single();
    if (error) throw error;
    return snakeToCamel(data);
  } else {
    const data = loadLocalData();
    data.clients.push(client);
    saveLocalData(data);
    return client;
  }
}

async function updateClient(id, updates) {
  if (USE_SUPABASE && cache.isReadOnly) {
    throw new Error('CRM is in read-only mode — Supabase is temporarily unreachable. Try again later.');
  }
  const now = new Date().toISOString();
  
  if (USE_SUPABASE) {
    const record = camelToSnake({ ...updates, updatedAt: now });
    delete record.id;
    delete record.created_at;
    
    const { data, error } = await supabase
      .from('clients')
      .update(record)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return snakeToCamel(data);
  } else {
    const data = loadLocalData();
    const idx = data.clients.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Client not found');
    
    data.clients[idx] = {
      ...data.clients[idx],
      ...updates,
      id: data.clients[idx].id,
      createdAt: data.clients[idx].createdAt,
      updatedAt: now
    };
    
    saveLocalData(data);
    return data.clients[idx];
  }
}

async function deleteClient(id) {
  if (USE_SUPABASE && cache.isReadOnly) {
    throw new Error('CRM is in read-only mode — Supabase is temporarily unreachable. Try again later.');
  }
  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } else {
    const data = loadLocalData();
    data.clients = data.clients.filter(c => c.id !== id);
    saveLocalData(data);
  }
  return true;
}

async function addActivity(clientId, activity) {
  if (USE_SUPABASE && cache.isReadOnly) {
    throw new Error('CRM is in read-only mode — Supabase is temporarily unreachable. Try again later.');
  }
  const now = new Date().toISOString();
  const entry = { timestamp: now, ...activity };
  
  if (USE_SUPABASE) {
    // Fetch current activity log
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('activity_log')
      .eq('id', clientId)
      .single();
    if (fetchError) throw fetchError;
    
    const activityLog = client.activity_log || [];
    activityLog.push(entry);
    
    const { data, error } = await supabase
      .from('clients')
      .update({
        activity_log: activityLog,
        last_activity: now,
        updated_at: now
      })
      .eq('id', clientId)
      .select()
      .single();
    if (error) throw error;
    return snakeToCamel(data);
  } else {
    const data = loadLocalData();
    const idx = data.clients.findIndex(c => c.id === clientId);
    if (idx === -1) throw new Error('Client not found');
    
    data.clients[idx].activityLog.push(entry);
    data.clients[idx].lastActivity = now;
    data.clients[idx].updatedAt = now;
    
    saveLocalData(data);
    return data.clients[idx];
  }
}

async function bulkUpdateLeadType(clientIds, leadType) {
  const now = new Date().toISOString();
  let updated = 0;
  
  if (USE_SUPABASE) {
    for (const id of clientIds) {
      try {
        const { data: client } = await supabase
          .from('clients')
          .select('lead_type, activity_log')
          .eq('id', id)
          .single();
        
        if (client) {
          const activityLog = client.activity_log || [];
          activityLog.push({
            timestamp: now,
            action: 'Lead Type Changed',
            details: `${client.lead_type || 'cold'} → ${leadType}`
          });
          
          await supabase
            .from('clients')
            .update({
              lead_type: leadType,
              activity_log: activityLog,
              updated_at: now
            })
            .eq('id', id);
          updated++;
        }
      } catch (e) {
        console.error(`Error updating client ${id}:`, e);
      }
    }
  } else {
    const data = loadLocalData();
    
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
    
    saveLocalData(data);
  }
  
  return { updated, total: clientIds.length };
}

async function importClients(clients) {
  let imported = 0;
  
  for (const c of clients) {
    try {
      await createClient(c);
      imported++;
    } catch (e) {
      console.error('Import error:', e);
    }
  }
  
  return imported;
}

async function getStats() {
  const clients = await getClients();
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const stats = {
    total: clients.length,
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
  
  clients.forEach(c => {
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
  
  return stats;
}

async function getFollowUps() {
  const clients = await getClients();
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  
  clients.forEach(c => {
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
    
    if (c.followUpDate < today) overdue.push(item);
    else if (c.followUpDate === today) dueToday.push(item);
    else if (c.followUpDate <= weekFromNow) upcoming.push(item);
  });
  
  overdue.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  upcoming.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  
  return {
    overdue,
    dueToday,
    upcoming,
    summary: {
      overdueCount: overdue.length,
      todayCount: dueToday.length,
      upcomingCount: upcoming.length,
      totalNeedsAttention: overdue.length + dueToday.length
    }
  };
}

async function getAlertSubscribers() {
  const clients = await getClients();
  return clients
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
}

module.exports = {
  // Operations
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  addActivity,
  bulkUpdateLeadType,
  importClients,
  getStats,
  getFollowUps,
  getAlertSubscribers,
  
  // Constants
  STAGES,
  LEAD_SOURCES,
  LEAD_TYPES,
  CLIENT_TYPES,
  PROPERTY_TYPES,
  
  // Utils
  USE_SUPABASE,
  loadLocalData,
  saveLocalData,
  
  // Cache status
  getCacheStatus: cache.getReadOnlyStatus,
};
