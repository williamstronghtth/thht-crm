/**
 * Supabase Database Service
 * Replaces local JSON file storage with persistent Postgres
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Get all clients with optional filters
 */
async function getClients(filters = {}) {
  if (!supabase) throw new Error('Supabase not configured');
  
  let query = supabase.from('clients').select('*');
  
  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }
  if (filters.leadSource) {
    query = query.eq('lead_source', filters.leadSource);
  }
  if (filters.leadType) {
    query = query.eq('lead_type', filters.leadType);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  
  const { data, error } = await query.order('updated_at', { ascending: false });
  
  if (error) throw error;
  return data.map(snakeToCamel);
}

/**
 * Get single client by ID
 */
async function getClient(id) {
  if (!supabase) throw new Error('Supabase not configured');
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return snakeToCamel(data);
}

/**
 * Create new client
 */
async function createClient(client) {
  if (!supabase) throw new Error('Supabase not configured');
  
  const record = camelToSnake({
    ...client,
    id: client.id || generateId(),
    activityLog: client.activityLog || [{
      timestamp: new Date().toISOString(),
      action: 'Created',
      details: 'Client added to CRM'
    }],
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  const { data, error } = await supabase
    .from('clients')
    .insert(record)
    .select()
    .single();
  
  if (error) throw error;
  return snakeToCamel(data);
}

/**
 * Update existing client
 */
async function updateClient(id, updates) {
  if (!supabase) throw new Error('Supabase not configured');
  
  const record = camelToSnake({
    ...updates,
    updatedAt: new Date().toISOString()
  });
  
  // Remove id from updates
  delete record.id;
  
  const { data, error } = await supabase
    .from('clients')
    .update(record)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return snakeToCamel(data);
}

/**
 * Delete client
 */
async function deleteClient(id) {
  if (!supabase) throw new Error('Supabase not configured');
  
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return true;
}

/**
 * Add activity to client's log
 */
async function addActivity(clientId, activity) {
  if (!supabase) throw new Error('Supabase not configured');
  
  // Get current client
  const { data: client, error: fetchError } = await supabase
    .from('clients')
    .select('activity_log')
    .eq('id', clientId)
    .single();
  
  if (fetchError) throw fetchError;
  
  const activityLog = client.activity_log || [];
  activityLog.unshift({
    timestamp: new Date().toISOString(),
    ...activity
  });
  
  const { data, error } = await supabase
    .from('clients')
    .update({
      activity_log: activityLog,
      last_activity: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
    .select()
    .single();
  
  if (error) throw error;
  return snakeToCamel(data);
}

/**
 * Bulk import clients (for migration)
 */
async function bulkImport(clients) {
  if (!supabase) throw new Error('Supabase not configured');
  
  const records = clients.map(c => camelToSnake(c));
  
  const { data, error } = await supabase
    .from('clients')
    .upsert(records, { onConflict: 'id' })
    .select();
  
  if (error) throw error;
  return data.length;
}

/**
 * Get client count by stage
 */
async function getStats() {
  if (!supabase) throw new Error('Supabase not configured');
  
  const { data, error } = await supabase
    .from('clients')
    .select('stage, lead_type');
  
  if (error) throw error;
  
  const stats = {
    total: data.length,
    byStage: {},
    byLeadType: {}
  };
  
  data.forEach(c => {
    stats.byStage[c.stage] = (stats.byStage[c.stage] || 0) + 1;
    stats.byLeadType[c.lead_type] = (stats.byLeadType[c.lead_type] || 0) + 1;
  });
  
  return stats;
}

// Helper: Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Helper: Convert camelCase to snake_case for Postgres
function camelToSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(camelToSnake);
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    converted[snakeKey] = value;
  }
  return converted;
}

// Helper: Convert snake_case to camelCase for JS
function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = value;
  }
  return converted;
}

// Check if Supabase is configured
function isConfigured() {
  return !!supabase;
}

module.exports = {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  addActivity,
  bulkImport,
  getStats,
  isConfigured,
  supabase
};
