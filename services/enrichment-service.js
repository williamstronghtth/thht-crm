/**
 * Lead Enrichment Service — Phase 1
 *
 * Enriches new client profiles with social links and property data.
 * Runs asynchronously after client creation — never blocks the API response.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

// Lazy-init Supabase so we can import without env vars in tests
let supabase = null;
function getSupabase() {
  if (!supabase && SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabase;
}

/**
 * Enrich a client record with social links and property data.
 * Updates Supabase directly — caller should fire-and-forget.
 *
 * @param {Object} client - { id, firstName, lastName, email, phone, address }
 */
async function enrichClient(client) {
  const { id, firstName, lastName, address } = client;
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();

  if (!fullName) {
    await updateEnrichmentStatus(id, 'failed', 'No name provided for enrichment');
    return;
  }

  const enrichmentData = {};
  const notes = [];

  // A. LinkedIn URL search
  try {
    const linkedinUrl = await searchLinkedIn(fullName, address);
    if (linkedinUrl) {
      enrichmentData.linkedin_url = linkedinUrl;
      notes.push('LinkedIn: found');
    } else {
      notes.push('LinkedIn: no result');
    }
  } catch (err) {
    notes.push(`LinkedIn: error — ${err.message}`);
  }

  // B. Property lookup (basic — from client address if provided)
  try {
    const propertyData = await lookupProperty(address);
    if (propertyData) {
      if (propertyData.address) enrichmentData.home_address = propertyData.address;
      if (propertyData.estimatedValue) enrichmentData.estimated_home_value = propertyData.estimatedValue;
      if (propertyData.purchaseDate) enrichmentData.home_purchase_date = propertyData.purchaseDate;
      notes.push('Property: found');
    } else {
      notes.push('Property: no data');
    }
  } catch (err) {
    notes.push(`Property: error — ${err.message}`);
  }

  // C. Birthday — skipped for Phase 1
  notes.push('Birthday: skipped (Phase 1)');

  // Write results to Supabase
  await updateEnrichmentResult(id, enrichmentData, notes);
}

/**
 * Search Google Custom Search for a LinkedIn profile.
 * Free tier: 100 queries/day.
 */
async function searchLinkedIn(fullName, location) {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    return null; // API not configured — skip silently
  }

  const locationHint = extractCity(location);
  const query = locationHint
    ? `site:linkedin.com/in "${fullName}" "${locationHint}"`
    : `site:linkedin.com/in "${fullName}"`;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_SEARCH_API_KEY);
  url.searchParams.set('cx', GOOGLE_SEARCH_CX);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '1');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Search API ${res.status}: ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  const firstResult = data.items?.[0];

  if (!firstResult) return null;

  // Validate it's actually a LinkedIn profile URL
  const link = firstResult.link || '';
  if (link.includes('linkedin.com/in/')) {
    return link;
  }

  return null;
}

/**
 * Basic property lookup using the client's address.
 * Phase 1: just normalize and store the address from the CRM record.
 * Future: integrate with town assessor APIs or Zillow.
 */
async function lookupProperty(address) {
  if (!address || address.trim().length < 5) return null;

  // Phase 1: store the address as-is. We don't have a property API yet,
  // but this sets up the data structure for Phase 2.
  return {
    address: address.trim(),
    estimatedValue: null,
    purchaseDate: null,
  };
}

/**
 * Extract city from a freeform address string.
 * Simple heuristic — takes the second-to-last comma-separated segment.
 */
function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0] || '';
}

/**
 * Update enrichment status to failed with a reason.
 */
async function updateEnrichmentStatus(clientId, status, note) {
  const db = getSupabase();
  if (!db) return;

  await db
    .from('clients')
    .update({
      enrichment_status: status,
      enrichment_notes: note,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);
}

/**
 * Write enrichment results to the client record.
 */
async function updateEnrichmentResult(clientId, data, notes) {
  const db = getSupabase();
  if (!db) return;

  const update = {
    ...data,
    enrichment_status: 'complete',
    enrichment_notes: notes.join('; '),
    enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('clients')
    .update(update)
    .eq('id', clientId);

  if (error) {
    console.error(`Enrichment write failed for ${clientId}:`, error.message); // keep
  }
}

module.exports = { enrichClient };
