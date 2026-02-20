#!/usr/bin/env node
/**
 * RPR CMA Comp Extractor
 * Gets comparable properties for an address
 */

const { chromium } = require('playwright');

const RPR_EMAIL = 'ch@thehooverhometeam.com';
const RPR_PASSWORD = 'Football37!';

async function getCMA(address, subdivision) {
  console.log('🏠 RPR CMA Tool');
  console.log('================');
  console.log(`Property: ${address}`);
  if (subdivision) console.log(`Subdivision filter: ${subdivision}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Login
    console.log('\n🔐 Logging into RPR...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"]', RPR_EMAIL);
    await page.fill('input[type="password"]', RPR_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    console.log('✅ Logged in');
    
    // Search for property
    console.log(`\n🔍 Searching: ${address}`);
    await page.goto('https://www.narrpr.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const searchInput = await page.$('input[placeholder*="address" i]');
    if (searchInput) {
      await searchInput.fill(address);
      await page.waitForTimeout(2000);
      await searchInput.press('Enter');
    }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: '/tmp/cma-1-property.png', fullPage: true });
    
    // Click CMA tab
    console.log('\n📊 Opening CMA...');
    const cmaTab = await page.$('text=CMA');
    if (cmaTab) {
      await cmaTab.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/cma-2-tab.png', fullPage: true });
    }
    
    // Look for "Create CMA" or comp options
    const createCMA = await page.$('text=Create CMA');
    if (createCMA) {
      await createCMA.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/cma-3-create.png', fullPage: true });
    }
    
    // Try to find comps/similar properties
    console.log('\n🏘️ Looking for comps...');
    
    // Look for comp selection area
    const compSelectors = [
      'text=Select Comps',
      'text=Similar Properties',
      'text=Comparable',
      '[class*="comp"]',
      'text=Sold'
    ];
    
    for (const sel of compSelectors) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`Found: ${sel}`);
        await el.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    
    await page.screenshot({ path: '/tmp/cma-4-comps.png', fullPage: true });
    
    // Extract any visible comp data
    const compData = await page.evaluate((subDiv) => {
      const results = [];
      const body = document.body.innerText;
      
      // Look for patterns like addresses with prices
      const addressPattern = /(\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl))[^\d]*(\$[\d,]+)?/gi;
      let match;
      while ((match = addressPattern.exec(body)) !== null) {
        const addr = match[1].trim();
        const price = match[2] || '';
        if (addr && addr.length > 10) {
          // Filter by subdivision if provided
          if (!subDiv || addr.toLowerCase().includes(subDiv.toLowerCase()) || body.includes(subDiv)) {
            results.push({ address: addr, price });
          }
        }
      }
      
      // Also look for table data
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const text = row.innerText;
          if (text.includes('$') && (text.includes('Bed') || text.includes('Bath') || text.includes('Sq'))) {
            results.push({ raw: text.substring(0, 300) });
          }
        });
      });
      
      return { results, fullText: body.substring(0, 10000) };
    }, subdivision);
    
    console.log('\n📋 Extracted Data:');
    if (compData.results.length > 0) {
      compData.results.slice(0, 15).forEach((r, i) => {
        if (r.address) {
          console.log(`  ${i + 1}. ${r.address} ${r.price}`);
        } else if (r.raw) {
          console.log(`  ${i + 1}. ${r.raw}`);
        }
      });
    }
    
    // Print relevant sections
    const text = compData.fullText;
    if (subdivision && text.toLowerCase().includes(subdivision.toLowerCase())) {
      console.log(`\n✅ Found "${subdivision}" in page content`);
    }
    
    // Look for Sanctuary specifically in the output
    const sanctuaryMatches = text.match(/sanctuary[^.]*\$[\d,]+[^.]*/gi);
    if (sanctuaryMatches) {
      console.log('\n🏘️ Sanctuary Properties Found:');
      sanctuaryMatches.forEach(m => console.log('  ' + m.trim()));
    }
    
    console.log('\n✅ Screenshots saved to /tmp/cma-*.png');
    
    return compData;
    
  } finally {
    await browser.close();
  }
}

const address = process.argv[2] || '6085 Sanctuary Garden Blvd, Port Orange, FL';
const subdivision = process.argv[3] || 'Sanctuary';

getCMA(address, subdivision)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
