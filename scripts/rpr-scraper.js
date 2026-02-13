/**
 * RPR Area Search Scraper
 * Searches for new listings in target areas for Property Alert System
 * 
 * Usage: node scripts/rpr-scraper.js [--areas "Port Orange,NSB"] [--max-price 800000]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// RPR Credentials
const RPR_EMAIL = process.env.RPR_EMAIL || 'ch@thehooverhometeam.com';
const RPR_PASSWORD = process.env.RPR_PASSWORD || 'Football37!';

// Default search areas (Volusia County focus)
const DEFAULT_AREAS = [
  'Port Orange, FL',
  'New Smyrna Beach, FL',
  'Daytona Beach, FL',
  'Ormond Beach, FL',
  'South Daytona, FL'
];

// Cache file for listings
const CACHE_FILE = path.join(__dirname, '..', 'data', 'listings-cache.json');

/**
 * Load existing listings cache
 */
function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return { listings: {}, lastRun: null };
  }
  return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

/**
 * Save listings cache
 */
function saveCache(cache) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    areas: DEFAULT_AREAS,
    maxPrice: null,
    minPrice: null,
    daysOnMarket: 7, // Only listings from last 7 days
    headless: true
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--areas' && args[i + 1]) {
      options.areas = args[i + 1].split(',').map(a => a.trim());
      i++;
    } else if (args[i] === '--max-price' && args[i + 1]) {
      options.maxPrice = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--min-price' && args[i + 1]) {
      options.minPrice = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      options.daysOnMarket = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--visible') {
      options.headless = false;
    }
  }

  return options;
}

/**
 * Login to RPR
 */
async function loginToRPR(page) {
  console.log('🔐 Logging into RPR...');
  
  await page.goto('https://auth.narrpr.com/auth/sign-in', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  
  await page.waitForTimeout(2000);
  await page.fill('#SignInEmail', RPR_EMAIL);
  await page.fill('#SignInPassword', RPR_PASSWORD);
  await page.click('#SignInBtn');
  await page.waitForTimeout(8000);
  
  const url = page.url();
  if (url.includes('narrpr.com/home') || url.includes('narrpr.com/dashboard')) {
    console.log('✅ Logged in successfully');
    return true;
  }
  
  console.log('⚠️  Login may have failed. Current URL:', url);
  return false;
}

/**
 * Search for listings in an area
 */
async function searchArea(page, area, options) {
  console.log(`\n🔍 Searching: ${area}`);
  
  const listings = [];
  
  try {
    // Navigate to RPR search
    await page.goto('https://www.narrpr.com/home', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    await page.waitForTimeout(3000);

    // Find the search input
    const searchInput = await page.$('input[type="text"]:visible, input[type="search"]:visible');
    
    if (!searchInput) {
      console.log('❌ Could not find search input');
      return listings;
    }

    // Search for the area
    await searchInput.click();
    await searchInput.fill('');
    await searchInput.type(area, { delay: 30 });
    await page.waitForTimeout(2000);
    
    // Press Enter or click suggestion
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    // Check if we're on a search results page
    const currentUrl = page.url();
    console.log('📍 Result URL:', currentUrl);

    // Try to find and click on "For Sale" or "Active Listings" filter
    const forSaleLink = await page.$('text=For Sale, text=Active, [data-status="active"]');
    if (forSaleLink) {
      await forSaleLink.click();
      await page.waitForTimeout(3000);
    }

    // Extract listing data from the page
    const pageListings = await page.evaluate(() => {
      const results = [];
      
      // Try various selectors for listing cards
      const selectors = [
        '[class*="listing"]',
        '[class*="property"]',
        '[class*="result"]',
        '[class*="card"]',
        'tr[data-id]',
        '.search-result'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const text = el.innerText || '';
            
            // Extract address (usually first line or has street patterns)
            const addressMatch = text.match(/\d+\s+[\w\s]+(?:St|Ave|Dr|Rd|Ct|Ln|Way|Blvd|Cir|Pl)/i);
            
            // Extract price
            const priceMatch = text.match(/\$[\d,]+/);
            
            // Extract beds/baths
            const bedsMatch = text.match(/(\d+)\s*(?:bed|br|BD)/i);
            const bathsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|BA)/i);
            
            // Extract sqft
            const sqftMatch = text.match(/([\d,]+)\s*(?:sq\s*ft|sqft|SF)/i);
            
            // Extract year built
            const yearMatch = text.match(/(?:built|yr|year)\s*:?\s*(\d{4})/i);

            if (addressMatch || priceMatch) {
              results.push({
                address: addressMatch ? addressMatch[0] : 'Unknown',
                price: priceMatch ? parseInt(priceMatch[0].replace(/[$,]/g, '')) : null,
                beds: bedsMatch ? parseInt(bedsMatch[1]) : null,
                baths: bathsMatch ? parseFloat(bathsMatch[1]) : null,
                sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : null,
                yearBuilt: yearMatch ? parseInt(yearMatch[1]) : null,
                rawText: text.substring(0, 500)
              });
            }
          });
          
          if (results.length > 0) break;
        }
      }

      return results;
    });

    console.log(`📋 Found ${pageListings.length} potential listings`);
    
    // Add area and timestamp to each listing
    pageListings.forEach(listing => {
      listing.area = area;
      listing.scrapedAt = new Date().toISOString();
      listing.id = `${listing.address}-${listing.price}`.replace(/\s+/g, '-').toLowerCase();
      listings.push(listing);
    });

  } catch (err) {
    console.error(`❌ Error searching ${area}:`, err.message);
  }

  return listings;
}

/**
 * Main scraper function
 */
async function runScraper(options) {
  console.log('🏠 RPR Property Alert Scraper');
  console.log('============================');
  console.log('Areas:', options.areas.join(', '));
  console.log('Max Price:', options.maxPrice || 'No limit');
  console.log('Days on Market:', options.daysOnMarket);
  console.log('');

  const browser = await chromium.launch({ 
    headless: options.headless, 
    args: ['--no-sandbox'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Login
    const loggedIn = await loginToRPR(page);
    if (!loggedIn) {
      console.log('⚠️  Continuing despite login warning...');
    }

    // Load cache
    const cache = loadCache();
    const allListings = [];
    const newListings = [];

    // Search each area
    for (const area of options.areas) {
      const areaListings = await searchArea(page, area, options);
      
      for (const listing of areaListings) {
        // Check if we've seen this listing before
        if (!cache.listings[listing.id]) {
          newListings.push(listing);
          cache.listings[listing.id] = {
            ...listing,
            firstSeen: new Date().toISOString()
          };
        }
        allListings.push(listing);
      }
    }

    // Update cache
    cache.lastRun = new Date().toISOString();
    saveCache(cache);

    // Summary
    console.log('\n============================');
    console.log('📊 SCRAPER SUMMARY');
    console.log('============================');
    console.log(`Total listings found: ${allListings.length}`);
    console.log(`New listings (not in cache): ${newListings.length}`);
    console.log(`Cache updated: ${CACHE_FILE}`);

    // Output new listings for matching
    if (newListings.length > 0) {
      console.log('\n🆕 NEW LISTINGS:');
      newListings.forEach(l => {
        console.log(`  - ${l.address}: $${l.price?.toLocaleString() || '?'} | ${l.beds || '?'}bd/${l.baths || '?'}ba | ${l.yearBuilt || '?'}`);
      });
    }

    return { allListings, newListings, cache };

  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  runScraper(options)
    .then(result => {
      console.log('\n✅ Scraper completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Scraper failed:', err);
      process.exit(1);
    });
}

module.exports = { runScraper, loadCache, saveCache };
