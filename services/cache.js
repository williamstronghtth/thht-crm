/**
 * Local Cache Layer for Supabase Resilience
 * 
 * On every successful Supabase read, snapshots data to local JSON.
 * When Supabase is unreachable (paused, DNS failure, timeout),
 * serves from cached snapshot in read-only mode.
 * 
 * The CRM degrades gracefully instead of going dark.
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'clients_snapshot.json');
const STATUS_FILE = path.join(CACHE_DIR, 'cache_status.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// In-memory state
let isReadOnlyMode = false;
let lastSuccessfulSync = null;
let lastError = null;
let cachedClients = null; // In-memory cache for fast reads

/**
 * Save a snapshot of all clients to local cache.
 * Called after every successful Supabase read of the full client list.
 */
function saveSnapshot(clients) {
  try {
    const snapshot = {
      timestamp: new Date().toISOString(),
      clientCount: clients.length,
      clients: clients,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot, null, 2));
    cachedClients = clients;
    lastSuccessfulSync = new Date().toISOString();
    
    // Update status
    updateStatus({ lastSync: lastSuccessfulSync, clientCount: clients.length });
    
    return true;
  } catch (err) {
    console.error('Cache: Failed to save snapshot:', err.message);
    return false;
  }
}

/**
 * Load cached clients from disk.
 * Returns the client array or null if no cache exists.
 */
function loadSnapshot() {
  // Try in-memory first
  if (cachedClients) return cachedClients;
  
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    cachedClients = raw.clients || [];
    lastSuccessfulSync = raw.timestamp;
    return cachedClients;
  } catch (err) {
    console.error('Cache: Failed to load snapshot:', err.message);
    return null;
  }
}

/**
 * Enter read-only mode (Supabase unreachable).
 */
function enterReadOnlyMode(error) {
  if (!isReadOnlyMode) {
    console.warn('⚠️ Cache: Entering READ-ONLY mode — Supabase unreachable');
    console.warn(`   Error: ${error.message || error}`);
    isReadOnlyMode = true;
    lastError = error.message || String(error);
    updateStatus({ readOnly: true, error: lastError });
  }
}

/**
 * Exit read-only mode (Supabase back online).
 */
function exitReadOnlyMode() {
  if (isReadOnlyMode) {
    console.log('✅ Cache: Supabase reconnected — exiting read-only mode');
    isReadOnlyMode = false;
    lastError = null;
    updateStatus({ readOnly: false, error: null });
  }
}

/**
 * Check if we're in read-only mode.
 */
function getReadOnlyStatus() {
  return {
    readOnly: isReadOnlyMode,
    lastSync: lastSuccessfulSync,
    lastError: lastError,
    cachedClients: cachedClients ? cachedClients.length : 0,
  };
}

/**
 * Update the status file on disk.
 */
function updateStatus(updates) {
  try {
    let status = {};
    if (fs.existsSync(STATUS_FILE)) {
      status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    }
    Object.assign(status, updates, { updatedAt: new Date().toISOString() });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (err) {
    // Non-critical — don't let status file errors break anything
  }
}

/**
 * Wrap a Supabase operation with cache fallback.
 * On success: updates cache, returns live data.
 * On failure: returns cached data in read-only mode.
 * 
 * @param {Function} supabaseOp - async function that calls Supabase
 * @param {Function} cacheFallback - function that returns cached data
 * @param {Object} options - { updateCache: boolean, isFullList: boolean }
 */
async function withFallback(supabaseOp, cacheFallback, options = {}) {
  try {
    const result = await supabaseOp();
    
    // Success — exit read-only if we were in it
    exitReadOnlyMode();
    
    // Update cache if this was a full client list read
    if (options.isFullList && Array.isArray(result)) {
      saveSnapshot(result);
    }
    
    return { data: result, fromCache: false, readOnly: false };
  } catch (err) {
    // Check if this is a connectivity error (not a query error)
    const isConnError = isConnectionError(err);
    
    if (isConnError) {
      enterReadOnlyMode(err);
      const cached = cacheFallback();
      if (cached !== null) {
        return { data: cached, fromCache: true, readOnly: true };
      }
    }
    
    // Either not a connection error, or no cache available — throw
    throw err;
  }
}

/**
 * Detect if an error is a Supabase/network connectivity issue.
 */
function isConnectionError(err) {
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('dns') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('502')
  );
}

module.exports = {
  saveSnapshot,
  loadSnapshot,
  enterReadOnlyMode,
  exitReadOnlyMode,
  getReadOnlyStatus,
  withFallback,
  isConnectionError,
  get isReadOnly() { return isReadOnlyMode; },
};
