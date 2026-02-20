#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  try {
    // Login
    console.log('🔐 Login...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'ch@thehooverhometeam.com');
    await page.fill('input[type="password"]', 'Football37!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    
    // Search property
    console.log('🔍 Search...');
    await page.goto('https://www.narrpr.com/home');
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder*="address" i]', '6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    
    // Open CMA
    console.log('📊 CMA...');
    await page.click('a:has-text("Create CMA")');
    await page.waitForTimeout(4000);
    
    // Confirm Facts
    console.log('1️⃣ Confirm Facts...');
    await page.click('text="Confirm Facts"');
    await page.waitForTimeout(2000);
    await page.click('[aria-label="Close"]').catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(2000);
    
    // Force enable and click Find Comps
    console.log('2️⃣ Find Comps...');
    await page.evaluate(() => {
      const btn = document.querySelector('#Valuation_FindCompsBtn');
      if (btn) {
        btn.classList.remove('disabled', 'is-outlined');
        btn.click();
      }
    });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/search-1.png' });
    
    // Select "Closed" status for sold properties
    console.log('🔧 Setting filters - Closed/Sold...');
    // Uncheck all, then check only Closed
    await page.click('text="...Show All"').catch(() => {});
    await page.waitForTimeout(500);
    
    // Find and click Closed checkbox
    const closedBox = await page.$('text=Closed >> .. >> input[type="checkbox"], label:has-text("Closed")');
    if (closedBox) {
      await closedBox.click();
      console.log('  ✅ Selected Closed status');
    }
    
    // Set date range - last 12 months
    const dateDropdown = await page.$('select:near(:text("OFF MARKET DATE"))');
    if (dateDropdown) {
      await dateDropdown.selectOption('Within last 12 months');
    }
    
    // Draw/set area around subject property (or use address search)
    console.log('🗺️ Setting search area near subject...');
    
    // Look for "Box" or radius option
    await page.click('text=Radius').catch(() => page.click('text=Box'));
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: '/tmp/search-2-filters.png' });
    
    // Look for search/apply button
    const searchBtn = await page.$('button:has-text("Search"), button:has-text("Apply"), button:has-text("Find")');
    if (searchBtn) {
      await searchBtn.click();
      console.log('  ✅ Clicked Search');
    }
    
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/search-3-results.png', fullPage: true });
    
    // Extract comp results
    console.log('\n📋 EXTRACTING COMPS...');
    const text = await page.evaluate(() => document.body.innerText);
    
    // Look for property listings
    const lines = text.split('\n');
    const comps = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match addresses
      if (line.match(/^\d+\s+\w+.*(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter)/i) && !line.includes('6085')) {
        const context = lines.slice(i, Math.min(i+8, lines.length)).join(' ');
        const price = context.match(/\$[\d,]+/);
        const sqft = context.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const date = context.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        const beds = context.match(/(\d)\s*(?:Bed|bd)/i);
        const baths = context.match(/(\d)\s*(?:Bath|ba)/i);
        
        comps.push({
          address: line,
          price: price?.[0] || '',
          sqft: sqft?.[1] || '',
          date: date?.[0] || '',
          beds: beds?.[1] || '',
          baths: baths?.[1] || ''
        });
      }
    }
    
    console.log('\n🏠 COMPS FOUND:');
    comps.slice(0, 20).forEach((c, i) => {
      console.log(`${i+1}. ${c.address}`);
      console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.date}`);
    });
    
    // Look specifically for Sanctuary
    const sanctuaryComps = comps.filter(c => c.address.toLowerCase().includes('sanctuary'));
    if (sanctuaryComps.length > 0) {
      console.log('\n🏘️ SANCTUARY COMPS:');
      sanctuaryComps.forEach((c, i) => {
        console.log(`${i+1}. ${c.address}`);
        console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.date}`);
      });
    }
    
    // Print raw text if no comps found
    if (comps.length === 0) {
      console.log('\n📝 Page content (first 4000 chars):');
      console.log(text.substring(0, 4000));
    }
    
    console.log('\n✅ Screenshots: /tmp/search-*.png');
    
  } finally {
    await browser.close();
  }
})();
