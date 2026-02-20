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
    
    // Click Search button (default filters include Closed)
    console.log('🔍 Clicking Search...');
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/just-1-results.png', fullPage: true });
    
    // Extract results
    console.log('\n📋 EXTRACTING COMPS...');
    const text = await page.evaluate(() => document.body.innerText);
    
    // Look for property listings with addresses
    const lines = text.split('\n');
    const comps = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match addresses 
      if (line.match(/^\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter)/i) && !line.includes('6085')) {
        const context = lines.slice(i, Math.min(i+10, lines.length)).join(' ');
        const price = context.match(/\$[\d,]+/);
        const sqft = context.match(/([\d,]+)\s*(?:sqft|sq\s*ft|SF)/i);
        const beds = context.match(/(\d)\s*(?:Bed|bd)/i);
        const baths = context.match(/(\d(?:\.\d)?)\s*(?:Bath|ba)/i);
        const date = context.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        
        comps.push({
          address: line,
          price: price?.[0] || '',
          sqft: sqft?.[1] || '',
          beds: beds?.[1] || '',
          baths: baths?.[1] || '',
          date: date?.[0] || ''
        });
      }
    }
    
    // Remove duplicates
    const seen = new Set();
    const uniqueComps = comps.filter(c => {
      if (seen.has(c.address)) return false;
      seen.add(c.address);
      return true;
    });
    
    console.log('\n🏠 COMPS FOUND:');
    uniqueComps.slice(0, 20).forEach((c, i) => {
      console.log(`${i+1}. ${c.address}`);
      console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.date}`);
    });
    
    // Look specifically for Sanctuary
    const sanctuaryComps = uniqueComps.filter(c => 
      c.address.toLowerCase().includes('sanctuary')
    );
    
    if (sanctuaryComps.length > 0) {
      console.log('\n🏘️ SANCTUARY COMPS:');
      sanctuaryComps.forEach((c, i) => {
        console.log(`${i+1}. ${c.address}`);
        console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.date}`);
      });
    }
    
    // Also print page text if few comps found
    if (uniqueComps.length < 3) {
      console.log('\n📝 Page content (excerpt):');
      console.log(text.substring(0, 5000));
    }
    
    console.log('\n✅ Done - screenshot: /tmp/just-1-results.png');
    
  } finally {
    await browser.close();
  }
})();
