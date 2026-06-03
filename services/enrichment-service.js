/**
 * Lead Enrichment Service — Phase 1
 *
 * Enriches new client profiles with social links and property data.
 * Runs asynchronously after client creation — never blocks the API response.
 */

const { supabase } = require('./supabase');

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

// Reuse the shared Supabase client from services/supabase.js
function getSupabase() {
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

  // Bug fix #1: Set status to "processing" immediately
  console.log(`[Enrichment] Starting enrichment for client ${id} (${fullName})`); // keep
  await updateEnrichmentStatus(id, 'processing', 'Enrichment in progress');

  try {
    if (!fullName) {
      await updateEnrichmentStatus(id, 'failed', 'No name provided for enrichment');
      return;
    }

    const enrichmentData = {};
    const notes = [];

    // A. LinkedIn URL search
    try {
      console.log(`[Enrichment] Searching LinkedIn for "${fullName}" (address: ${address || 'none'})`); // keep
      const linkedinUrl = await searchLinkedIn(fullName, address);
      console.log(`[Enrichment] LinkedIn result for ${id}: ${linkedinUrl || 'no result'}`); // keep
      if (linkedinUrl) {
        enrichmentData.linkedin_url = linkedinUrl;
        notes.push('LinkedIn: found');
      } else {
        notes.push('LinkedIn: no result');
      }
    } catch (err) {
      console.error(`[Enrichment] LinkedIn search error for ${id}:`, err.message); // keep
      notes.push(`LinkedIn: error — ${err.message}`);
    }

    // B. Property lookup (basic — from client address if provided)
    try {
      console.log(`[Enrichment] Looking up property for ${id} (address: ${address || 'none'})`); // keep
      const propertyData = await lookupProperty(address);
      console.log(`[Enrichment] Property result for ${id}:`, JSON.stringify(propertyData)); // keep
      if (propertyData) {
        if (propertyData.address) enrichmentData.home_address = propertyData.address;
        if (propertyData.estimatedValue) enrichmentData.home_estimated_value = propertyData.estimatedValue;
        if (propertyData.purchaseDate) enrichmentData.home_purchase_date = propertyData.purchaseDate;
        notes.push('Property: found');
      } else {
        notes.push('Property: no data');
      }
    } catch (err) {
      console.error(`[Enrichment] Property lookup error for ${id}:`, err.message); // keep
      notes.push(`Property: error — ${err.message}`);
    }

    // C. Birthday — skipped for Phase 1
    notes.push('Birthday: skipped (Phase 1)');

    // Write results to Supabase
    console.log(`[Enrichment] Writing results to Supabase for ${id}:`, JSON.stringify(enrichmentData)); // keep
    await updateEnrichmentResult(id, enrichmentData, notes);
    console.log(`[Enrichment] Enrichment complete for ${id}`); // keep
  } catch (err) {
    // Bug fix #2: Catch any unexpected error and set status to "failed"
    console.error(`[Enrichment] Unexpected failure for ${id}:`, err.message, err.stack); // keep
    try {
      await updateEnrichmentStatus(id, 'failed', `Unexpected error: ${err.message}`);
    } catch (statusErr) {
      console.error(`[Enrichment] Could not update failure status for ${id}:`, statusErr.message); // keep
    }
  }
}

/**
 * Search Google Custom Search for a LinkedIn profile.
 * Free tier: 100 queries/day.
 */
async function searchLinkedIn(fullName, location) {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    console.log('[Enrichment] Google Search API not configured — skipping LinkedIn search'); // keep
    return null;
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
  if (!db) {
    console.error(`[Enrichment] No Supabase connection — cannot update status for ${clientId}`); // keep
    return;
  }

  const { error } = await db
    .from('clients')
    .update({
      enrichment_status: status,
      enrichment_notes: note,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);

  if (error) {
    // Bug fix #3: Surface Supabase errors instead of swallowing them
    console.error(`[Enrichment] Status update failed for ${clientId}:`, error.message, error.details); // keep
    throw new Error(`Supabase status update failed: ${error.message}`);
  }
}

/**
 * Write enrichment results to the client record.
 */
async function updateEnrichmentResult(clientId, data, notes) {
  const db = getSupabase();
  if (!db) {
    console.error(`[Enrichment] No Supabase connection — cannot write results for ${clientId}`); // keep
    return;
  }

  const update = {
    ...data,
    enrichment_status: 'complete',
    enrichment_notes: notes.join('; '),
    enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log(`[Enrichment] Supabase update payload for ${clientId}:`, JSON.stringify(update)); // keep

  const { error } = await db
    .from('clients')
    .update(update)
    .eq('id', clientId);

  if (error) {
    // Bug fix #3: Throw so the outer try/catch can set status to "failed"
    console.error(`[Enrichment] Supabase write failed for ${clientId}:`, error.message, error.details, error.hint); // keep
    throw new Error(`Enrichment write failed: ${error.message}`);
  }
}

module.exports = { enrichClient };
