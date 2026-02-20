#!/usr/bin/env node
/**
 * RPR Sold Search - Direct search for Sanctuary sold properties
 */

const { chromium } = require('playwright');

async function searchSold() {
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
    console.log('🔐 Logging in...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"]', 'ch@thehooverhometeam.com');
    await page.fill('input[type="password"]', 'Football37!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    console.log('✅ Logged in');
    
    // Go to Research > Area Search or Map Search
    console.log('🔍 Searching for Sanctuary sold properties...');
    
    // Try to go directly to area search
    await page.goto('https://www.narrpr.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Look for Research menu
    await page.click('text=Research');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/sold-1-menu.png' });
    
    // Click on "Property Search" or "Area Search"
    const searchOptions = await page.$$('a:has-text("Search"), a:has-text("Area"), a:has-text("Map")');
    console.log(`  Found ${searchOptions.length} search options`);
    
    // Try clicking "Area" or "Map" search for subdivision search
    for (const opt of searchOptions) {
      const text = await opt.innerText();
      console.log(`  Option: ${text}`);
    }
    
    // Search for Sanctuary subdivision in Port Orange
    const searchInput = await page.$('input[placeholder*="address" i]');
    if (searchInput) {
      await searchInput.fill('Sanctuary, Port Orange, FL');
      await page.waitForTimeout(2000);
      await searchInput.press('Enter');
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/tmp/sold-2-search.png', fullPage: true });
    
    // Look for a way to filter by "Sold" status
    const soldFilter = await page.$('text=Sold, [data-status="sold"], input[value="sold"]');
    if (soldFilter) {
      await soldFilter.click();
      await page.waitForTimeout(3000);
    }
    
    await page.screenshot({ path: '/tmp/sold-3-results.png', fullPage: true });
    
    // Extract data
    console.log('\n📋 EXTRACTING SOLD DATA...');
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Look for sold listings
    const lines = pageText.split('\n');
    console.log('\n🏠 PROPERTY LISTINGS:');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match address pattern
      if (line.match(/^\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter)/i)) {
        const context = lines.slice(i, Math.min(i+8, lines.length)).join(' | ');
        console.log(`\n  ${line}`);
        console.log(`    ${context.substring(0, 200)}`);
      }
    }
    
    // Look for any tables
    const tables = await page.$$eval('table', ts => 
      ts.map(t => Array.from(t.querySelectorAll('tr')).slice(0, 15).map(r => 
        Array.from(r.querySelectorAll('th,td')).map(c => c.innerText.trim()).join(' | ')
      ))
    );
    
    if (tables.length > 0) {
      console.log('\n📋 TABLES:');
      tables.forEach((t, i) => {
        console.log(`\nTable ${i+1}:`);
        t.forEach(row => console.log('  ' + row));
      });
    }
    
    console.log('\n✅ Screenshots: /tmp/sold-*.png');
    
  } finally {
    await browser.close();
  }
}

searchSold().catch(e => console.error('Error:', e.message));
