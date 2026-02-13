/**
 * Property Alerts Runner
 * Daily job: Scrape RPR → Match buyers → Send alerts
 * 
 * Usage: node scripts/property-alerts.js [--notify] [--dry-run]
 */

const { runScraper } = require('./rpr-scraper');
const { runMatching, generateAlertSummary } = require('./matching-engine');

// Target areas for Volusia County
const TARGET_AREAS = [
  'Port Orange, FL',
  'New Smyrna Beach, FL',
  'Daytona Beach, FL',
  'Ormond Beach, FL',
  'South Daytona, FL',
  'Edgewater, FL',
  'Holly Hill, FL'
];

/**
 * Send alert via webhook/email (placeholder - integrate with actual notification)
 */
async function sendAlertNotification(summary, options = {}) {
  console.log('\n📤 SENDING ALERT...');
  
  // For now, just log the summary
  // TODO: Integrate with:
  // - Email via SendGrid/SES
  // - SMS via Twilio
  // - Telegram via bot
  // - OpenClaw message tool
  
  console.log(summary);
  
  return { sent: true, method: 'console' };
}

/**
 * Main runner
 */
async function runPropertyAlerts(options = {}) {
  const startTime = Date.now();
  
  console.log('═══════════════════════════════════════════');
  console.log('🏠 PROPERTY ALERT SYSTEM');
  console.log(`📅 ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════\n');

  try {
    // Step 1: Scrape new listings from RPR
    console.log('STEP 1: Scraping RPR for new listings...\n');
    const scraperResult = await runScraper({
      areas: TARGET_AREAS,
      headless: true,
      daysOnMarket: 7
    });

    console.log(`\n✅ Scraper complete: ${scraperResult.newListings.length} new listings found\n`);

    // Step 2: Run matching engine
    console.log('\nSTEP 2: Running matching engine...\n');
    const matchResult = runMatching({ dryRun: options.dryRun });

    console.log(`\n✅ Matching complete: ${matchResult.matches.length} matches found\n`);

    // Step 3: Send notifications if matches found
    if (matchResult.matches.length > 0 && options.notify && !options.dryRun) {
      console.log('\nSTEP 3: Sending notifications...\n');
      const summary = generateAlertSummary(matchResult.matches);
      await sendAlertNotification(summary, options);
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 DAILY RUN COMPLETE');
    console.log('═══════════════════════════════════════════');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`🏠 New listings scraped: ${scraperResult.newListings.length}`);
    console.log(`✅ Matches found: ${matchResult.matches.length}`);
    console.log(`👥 Active buyers: ${matchResult.buyers}`);
    console.log('═══════════════════════════════════════════\n');

    return {
      success: true,
      newListings: scraperResult.newListings.length,
      matches: matchResult.matches,
      duration: elapsed
    };

  } catch (err) {
    console.error('❌ Property alerts failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Parse CLI args
function parseArgs() {
  return {
    notify: process.argv.includes('--notify'),
    dryRun: process.argv.includes('--dry-run')
  };
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  runPropertyAlerts(options)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    });
}

module.exports = { runPropertyAlerts };
