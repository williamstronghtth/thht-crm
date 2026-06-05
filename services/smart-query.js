/**
 * AI Smart Query Service
 * Converts natural language to CRM filters using Claude Haiku,
 * then executes the query against the Supabase clients table.
 */

const Anthropic = require('@anthropic-ai/sdk');

const HAIKU_MODEL = 'claude-haiku-4-5';

// System prompt tells Claude which fields are available and what format to return
const SYSTEM_PROMPT = `You are a CRM query interpreter for a real estate company. Convert the user's natural language search into a JSON filter object.

Available fields:
- status: string (one of: lead, active, contract, closed, past)
- lead_source: string (e.g. "Cold Calling", "Zillow", "Referral", "Open House", "Letter", "Door Knocking")
- lead_type: string (one of: warm, cold, divorce, probate, pre-foreclosure, expired, fsbo, investor, referral, sphere, other)
- city: string
- state: string (2-letter code, e.g. "NH", "MA", "FL")
- enrichment_status: string (one of: pending, processing, complete, failed)
- days_since_created: number (e.g. 30 means created more than 30 days ago)
- days_since_activity: number (e.g. 30 means no activity in 30+ days)
- firstName: string (partial match)
- lastName: string (partial match)
- email: string (partial match)

Respond with ONLY a valid JSON object, no explanation, no markdown. Example:
{"city": "Amherst", "state": "NH", "status": "lead"}`;

/**
 * Uses Claude Haiku to parse a natural language query into a structured filter object.
 * @param {string} query - Natural language search string
 * @returns {Promise<object>} Parsed filter object
 */
async function parseQueryToFilter(query) {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `User query: "${query}"\n\nRespond with ONLY a valid JSON object.`
      }
    ]
  });

  const rawText = message.content[0]?.text?.trim() || '{}';

  // Strip any accidental markdown code fences
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Builds and executes a Supabase query from a Claude-generated filter object.
 * Falls back to in-memory filtering when Supabase is unavailable.
 * @param {object} filter - Filter object returned by parseQueryToFilter
 * @param {object} db - The db module (passed in to avoid circular deps)
 * @returns {Promise<Array>} Filtered client records
 */
async function executeSmartFilter(filter, db) {
  if (!db.USE_SUPABASE) {
    return applyInMemoryFilter(db.loadLocalData().clients, filter);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  let query = supabase.from('clients').select('*');

  // Map Claude's field names to Supabase column names
  if (filter.status) query = query.eq('stage', filter.status);
  if (filter.lead_source) query = query.ilike('lead_source', `%${filter.lead_source}%`);
  if (filter.lead_type) query = query.eq('lead_type', filter.lead_type);
  if (filter.city) query = query.ilike('city', `%${filter.city}%`);
  if (filter.state) query = query.ilike('state', filter.state);
  if (filter.enrichment_status) query = query.eq('enrichment_status', filter.enrichment_status);
  if (filter.email) query = query.ilike('email', `%${filter.email}%`);
  if (filter.firstName) query = query.ilike('first_name', `%${filter.firstName}%`);
  if (filter.lastName) query = query.ilike('last_name', `%${filter.lastName}%`);

  // Date-based filters — compute threshold date
  if (filter.days_since_created) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - filter.days_since_created);
    query = query.lte('created_at', threshold.toISOString());
  }

  if (filter.days_since_activity) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - filter.days_since_activity);
    query = query.lte('last_activity', threshold.toISOString());
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;

  // Convert snake_case DB columns to camelCase for the frontend
  return data.map(snakeToCamel);
}

/**
 * In-memory fallback filter for when Supabase is unavailable.
 * @param {Array} clients - Full client list (camelCase)
 * @param {object} filter - Filter from Claude
 * @returns {Array} Filtered clients
 */
function applyInMemoryFilter(clients, filter) {
  return clients.filter(c => {
    if (filter.status && c.stage !== filter.status) return false;
    if (filter.lead_source && !(c.leadSource || '').toLowerCase().includes(filter.lead_source.toLowerCase())) return false;
    if (filter.lead_type && c.leadType !== filter.lead_type) return false;
    if (filter.city && !(c.city || '').toLowerCase().includes(filter.city.toLowerCase())) return false;
    if (filter.state && (c.state || '').toLowerCase() !== filter.state.toLowerCase()) return false;
    if (filter.enrichment_status && c.enrichmentStatus !== filter.enrichment_status) return false;
    if (filter.email && !(c.email || '').toLowerCase().includes(filter.email.toLowerCase())) return false;
    if (filter.firstName && !(c.firstName || '').toLowerCase().includes(filter.firstName.toLowerCase())) return false;
    if (filter.lastName && !(c.lastName || '').toLowerCase().includes(filter.lastName.toLowerCase())) return false;

    if (filter.days_since_created) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - filter.days_since_created);
      if (!c.createdAt || new Date(c.createdAt) > threshold) return false;
    }

    if (filter.days_since_activity) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - filter.days_since_activity);
      if (!c.lastActivity || new Date(c.lastActivity) > threshold) return false;
    }

    return true;
  });
}

// snake_case → camelCase for consistent frontend shape
function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    out[camel] = v;
  }
  return out;
}

module.exports = { parseQueryToFilter, executeSmartFilter };
