#!/usr/bin/env node
/**
 * RPR Sanctuary Comps - Direct CMA approach
 */

const { chromium } = require('playwright');

const RPR_EMAIL = 'ch@thehooverhometeam.com';
const RPR_PASSWORD = 'Football37!';

async function getComps() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Login
    console.log('🔐 Logging into RPR...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"]', RPR_EMAIL);
    await page.fill('input[type="password"]', RPR_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    console.log('✅ Logged in');
    
    // Go directly to the property page via URL
    console.log('\n🔍 Loading property...');
    await page.goto('https://www.narrpr.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const searchInput = await page.$('input[placeholder*="address" i]');
    await searchInput.fill('6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.waitForTimeout(2000);
    await searchInput.press('Enter');
    await page.waitForTimeout(8000);
    
    // Scroll to ensure CMA tab is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Screenshot current state
    await page.screenshot({ path: '/tmp/sanctuary-1.png' });
    
    // Try clicking CMA in the nav tabs
    console.log('\n📊 Clicking CMA tab...');
    try {
      // The tabs are in a blue bar, look for them
      await page.click('a:has-text("CMA"), button:has-text("CMA"), [role="tab"]:has-text("CMA")', { timeout: 5000 });
    } catch (e) {
      console.log('  Nav CMA not found, trying Create CMA link...');
      // Try the "Create CMA" link in the Pricing Tools section
      await page.click('text=Create CMA', { timeout: 5000 });
    }
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/sanctuary-2-cma.png', fullPage: true });
    
    // Now we should be in CMA mode - look for comps
    console.log('\n🏘️ Looking for comps...');
    
    // Check if we need to select comp criteria
    const searchComps = await page.$('text=Search Comps, button:has-text("Search")');
    if (searchComps) {
      await searchComps.click();
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/tmp/sanctuary-3-search.png', fullPage: true });
    
    // Try to filter by subdivision
    const subInput = await page.$('input[placeholder*="subdivision" i], input[name*="subdivision" i]');
    if (subInput) {
      console.log('  Found subdivision filter');
      await subInput.fill('Sanctuary');
      await page.waitForTimeout(2000);
    }
    
    // Extract comp data from page
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Search for addresses in Sanctuary
    console.log('\n📋 COMPS DATA:');
    console.log('================');
    
    // Parse the text for property data - look for address patterns
    const lines = pageText.split('\n');
    const relevantLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Look for Sanctuary addresses or price data
      if (line.includes('Sanctuary') || 
          (line.match(/^\d+\s/) && line.length > 10) ||
          line.match(/\$[\d,]+/) ||
          line.match(/\d+\s*(?:Bed|Bath|bd|ba|Sq)/i)) {
        relevantLines.push(line);
      }
    }
    
    // Print relevant lines
    relevantLines.slice(0, 50).forEach(l => console.log('  ' + l));
    
    // Also look for any tables with property data
    const tables = await page.$$eval('table', tables => 
      tables.map(t => {
        const rows = [];
        t.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(cell => cells.push(cell.innerText.trim()));
          if (cells.length > 0) rows.push(cells.join(' | '));
        });
        return rows;
      })
    );
    
    if (tables.length > 0) {
      console.log('\n📋 TABLES:');
      tables.forEach((table, i) => {
        console.log(`\nTable ${i+1}:`);
        table.slice(0, 15).forEach(row => console.log('  ' + row));
      });
    }
    
    console.log('\n✅ Screenshots saved to /tmp/sanctuary-*.png');
    
  } finally {
    await browser.close();
  }
}

getComps().catch(e => console.error('Error:', e.message));
