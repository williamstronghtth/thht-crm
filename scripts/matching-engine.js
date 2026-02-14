/**
 * Property Alert Matching Engine
 * Compares new listings against buyer criteria and generates alerts
 * 
 * Usage: node scripts/matching-engine.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'listings-cache.json');
const MATCHES_FILE = path.join(__dirname, '..', 'data', 'matches.json');
const ALERTS_LOG = path.join(__dirname, '..', 'data', 'alerts-log.json');

/**
 * Load CRM data (buyers with alert criteria)
 */
function loadCRMData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { clients: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

/**
 * Load listings cache
 */
function loadListingsCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return { listings: {}, lastRun: null };
  }
  return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

/**
 * Load previous matches (to avoid duplicate alerts)
 */
function loadMatches() {
  if (!fs.existsSync(MATCHES_FILE)) {
    return { matches: {}, lastRun: null };
  }
  return JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
}

/**
 * Save matches
 */
function saveMatches(matches) {
  const dir = path.dirname(MATCHES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(matches, null, 2));
}

/**
 * Load alerts log
 */
function loadAlertsLog() {
  if (!fs.existsSync(ALERTS_LOG)) {
    return { alerts: [] };
  }
  return JSON.parse(fs.readFileSync(ALERTS_LOG, 'utf8'));
}

/**
 * Save alerts log
 */
function saveAlertsLog(log) {
  fs.writeFileSync(ALERTS_LOG, JSON.stringify(log, null, 2));
}

/**
 * Check if a listing matches buyer criteria
 */
function matchesCriteria(listing, criteria) {
  const reasons = [];
  const misses = [];

  // Price check
  if (criteria.priceMin && listing.price && listing.price < criteria.priceMin) {
    misses.push(`Price $${listing.price.toLocaleString()} below min $${criteria.priceMin.toLocaleString()}`);
  }
  if (criteria.priceMax && listing.price && listing.price > criteria.priceMax) {
    misses.push(`Price $${listing.price.toLocaleString()} above max $${criteria.priceMax.toLocaleString()}`);
  }
  if (listing.price && (!criteria.priceMin || listing.price >= criteria.priceMin) && 
      (!criteria.priceMax || listing.price <= criteria.priceMax)) {
    reasons.push(`Price $${listing.price.toLocaleString()} in range`);
  }

  // Beds check
  if (criteria.bedsMin && listing.beds && listing.beds < criteria.bedsMin) {
    misses.push(`${listing.beds} beds below min ${criteria.bedsMin}`);
  }
  if (listing.beds && (!criteria.bedsMin || listing.beds >= criteria.bedsMin)) {
    reasons.push(`${listing.beds} beds`);
  }

  // Baths check
  if (criteria.bathsMin && listing.baths && listing.baths < criteria.bathsMin) {
    misses.push(`${listing.baths} baths below min ${criteria.bathsMin}`);
  }

  // Year built check
  if (criteria.yearBuiltMax && listing.yearBuilt && listing.yearBuilt > criteria.yearBuiltMax) {
    misses.push(`Year ${listing.yearBuilt} newer than max ${criteria.yearBuiltMax}`);
  }
  if (listing.yearBuilt && (!criteria.yearBuiltMax || listing.yearBuilt <= criteria.yearBuiltMax)) {
    reasons.push(`Built ${listing.yearBuilt}`);
  }

  // Location check
  if (criteria.locations && criteria.locations.length > 0 && listing.area) {
    const locationMatch = criteria.locations.some(loc => 
      listing.area.toLowerCase().includes(loc.toLowerCase()) ||
      loc.toLowerCase().includes(listing.area.split(',')[0].toLowerCase().trim())
    );
    if (!locationMatch) {
      misses.push(`Location ${listing.area} not in ${criteria.locations.join(', ')}`);
    } else {
      reasons.push(`Location: ${listing.area}`);
    }
  }

  // Stories check (if available in listing)
  if (criteria.maxStories && listing.stories && listing.stories > criteria.maxStories) {
    misses.push(`${listing.stories} stories exceeds max ${criteria.maxStories}`);
  }

  // Sqft check
  if (criteria.sqftMin && listing.sqft && listing.sqft < criteria.sqftMin) {
    misses.push(`${listing.sqft} sqft below min ${criteria.sqftMin}`);
  }
  if (listing.sqft && (!criteria.sqftMin || listing.sqft >= criteria.sqftMin)) {
    reasons.push(`${listing.sqft.toLocaleString()} sqft`);
  }

  // Waterfront check
  if (criteria.waterfront) {
    // Flag for manual review - waterfront info may not be in listing data
    reasons.push(`⚠️ Waterfront required - verify manually (pond/lake)`);
  }

  // Investment property flag (for cap rate buyers like Scott)
  // Since we can't calculate actual cap rate, flag properties under investment threshold
  if (criteria.minCapRate && listing.price) {
    // Flag as "needs manual review for cap rate"
    reasons.push(`⚠️ Investment property - verify cap rate manually`);
  }

  // Determine if it's a match (no disqualifying misses)
  const isMatch = misses.length === 0 && reasons.length > 0;

  return {
    isMatch,
    reasons,
    misses,
    score: reasons.length - misses.length
  };
}

/**
 * Get all buyers with active alerts
 */
function getActiveBuyers(crmData) {
  return crmData.clients.filter(client => 
    client.alerts && 
    client.alerts.enabled && 
    client.clientType && 
    ['buyer', 'both', 'investor'].includes(client.clientType)
  );
}

/**
 * Run matching engine
 */
function runMatching(options = {}) {
  console.log('🔄 Property Alert Matching Engine');
  console.log('=================================');

  const crmData = loadCRMData();
  const listingsCache = loadListingsCache();
  const previousMatches = loadMatches();
  const alertsLog = loadAlertsLog();

  const buyers = getActiveBuyers(crmData);
  console.log(`👥 Active buyers with alerts: ${buyers.length}`);

  if (buyers.length === 0) {
    console.log('⚠️  No buyers have alerts enabled');
    return { matches: [], buyers: 0 };
  }

  const listings = Object.values(listingsCache.listings);
  console.log(`🏠 Listings in cache: ${listings.length}`);

  if (listings.length === 0) {
    console.log('⚠️  No listings in cache. Run rpr-scraper.js first.');
    return { matches: [], buyers: buyers.length };
  }

  const newMatches = [];

  // Check each listing against each buyer
  for (const listing of listings) {
    for (const buyer of buyers) {
      const matchKey = `${buyer.id}-${listing.id}`;
      
      // Skip if we've already alerted on this match
      if (previousMatches.matches[matchKey]) {
        continue;
      }

      const result = matchesCriteria(listing, buyer.alerts.criteria);
      
      if (result.isMatch) {
        const match = {
          matchKey,
          buyerId: buyer.id,
          buyerName: `${buyer.firstName} ${buyer.lastName}`,
          buyerEmail: buyer.email,
          buyerPhone: buyer.phone,
          listing: listing,
          reasons: result.reasons,
          matchedAt: new Date().toISOString()
        };

        newMatches.push(match);
        previousMatches.matches[matchKey] = match;

        console.log(`\n✅ MATCH: ${listing.address}`);
        console.log(`   Buyer: ${match.buyerName}`);
        console.log(`   Price: $${listing.price?.toLocaleString() || '?'}`);
        console.log(`   Reasons: ${result.reasons.join(', ')}`);
      }
    }
  }

  // Save updated matches
  previousMatches.lastRun = new Date().toISOString();
  saveMatches(previousMatches);

  // Log alerts
  if (newMatches.length > 0) {
    alertsLog.alerts.push({
      runAt: new Date().toISOString(),
      matchCount: newMatches.length,
      matches: newMatches.map(m => ({
        buyer: m.buyerName,
        listing: m.listing.address,
        price: m.listing.price
      }))
    });
    saveAlertsLog(alertsLog);
  }

  // Summary
  console.log('\n=================================');
  console.log('📊 MATCHING SUMMARY');
  console.log('=================================');
  console.log(`Buyers checked: ${buyers.length}`);
  console.log(`Listings checked: ${listings.length}`);
  console.log(`New matches found: ${newMatches.length}`);

  if (!options.dryRun && newMatches.length > 0) {
    console.log('\n📧 Ready to send alerts (implement sendAlerts())');
  }

  return { matches: newMatches, buyers: buyers.length, listings: listings.length };
}

/**
 * Generate alert summary for Chris
 */
function generateAlertSummary(matches) {
  if (matches.length === 0) {
    return 'No new property matches today.';
  }

  let summary = `🏠 Property Alerts - ${new Date().toLocaleDateString()}\n`;
  summary += `Found ${matches.length} new match${matches.length > 1 ? 'es' : ''}!\n\n`;

  // Group by buyer
  const byBuyer = {};
  for (const match of matches) {
    if (!byBuyer[match.buyerName]) {
      byBuyer[match.buyerName] = [];
    }
    byBuyer[match.buyerName].push(match);
  }

  for (const [buyerName, buyerMatches] of Object.entries(byBuyer)) {
    summary += `👤 ${buyerName}:\n`;
    for (const m of buyerMatches) {
      summary += `  • ${m.listing.address}\n`;
      summary += `    $${m.listing.price?.toLocaleString() || '?'} | ${m.listing.beds || '?'}bd/${m.listing.baths || '?'}ba`;
      if (m.listing.yearBuilt) summary += ` | Built ${m.listing.yearBuilt}`;
      summary += '\n';
    }
    summary += '\n';
  }

  return summary;
}

// Run if called directly
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = runMatching({ dryRun });
  
  if (result.matches.length > 0) {
    console.log('\n📋 ALERT SUMMARY:');
    console.log(generateAlertSummary(result.matches));
  }
}

module.exports = { runMatching, matchesCriteria, generateAlertSummary };
