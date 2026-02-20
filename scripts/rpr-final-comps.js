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
    
    // Confirm Facts and close modal
    console.log('1️⃣ Confirm Facts...');
    await page.click('text="Confirm Facts"');
    await page.waitForTimeout(2000);
    await page.click('[aria-label="Close"]').catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(2000);
    
    // Find Comps
    console.log('2️⃣ Find Comps...');
    await page.evaluate(() => {
      const btn = document.querySelector('#Valuation_FindCompsBtn');
      if (btn) {
        btn.classList.remove('disabled', 'is-outlined');
        btn.click();
      }
    });
    await page.waitForTimeout(5000);
    
    // Scroll modal/page to find Search button
    console.log('🔍 Looking for Search button...');
    
    // Try scrolling within any modal/dialog
    await page.evaluate(() => {
      const modals = document.querySelectorAll('.modal, .dialog, [role="dialog"], .ui-dialog-content');
      modals.forEach(m => m.scrollTo(0, m.scrollHeight));
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);
    
    // Screenshot to see current state
    await page.screenshot({ path: '/tmp/final-1-before-search.png', fullPage: true });
    
    // Try multiple selectors for Search button
    const searchSelectors = [
      'button.button:has-text("Search")',
      'button:text("Search")',
      '.button:has-text("Search")',
      'input[type="submit"][value="Search"]',
      '[class*="search"] button',
      'button[class*="primary"]:has-text("Search")'
    ];
    
    let clicked = false;
    for (const sel of searchSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          console.log(`  ✅ Clicked: ${sel}`);
          clicked = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!clicked) {
      // Try clicking by evaluating
      console.log('  Trying JS click...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const searchBtn = btns.find(b => b.textContent.trim() === 'Search');
        if (searchBtn) searchBtn.click();
      });
    }
    
    await page.waitForTimeout(12000);
    await page.screenshot({ path: '/tmp/final-2-results.png', fullPage: true });
    
    // Extract results
    console.log('\n📋 EXTRACTING COMPS...');
    const text = await page.evaluate(() => document.body.innerText);
    
    // Look for property data
    const lines = text.split('\n');
    const comps = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter)/i) && !line.includes('6085')) {
        const context = lines.slice(i, Math.min(i+10, lines.length)).join(' ');
        const price = context.match(/\$[\d,]+/);
        const sqft = context.match(/([\d,]+)\s*(?:sqft|sq\s*ft|SF)/i);
        const beds = context.match(/(\d)\s*(?:Bed|bd)/i);
        const baths = context.match(/(\d(?:\.\d)?)\s*(?:Bath|ba)/i);
        const sold = context.match(/(Sold|Closed)/i);
        const date = context.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        
        if (!comps.find(c => c.address === line)) {
          comps.push({
            address: line,
            price: price?.[0] || '',
            sqft: sqft?.[1] || '',
            beds: beds?.[1] || '',
            baths: baths?.[1] || '',
            status: sold?.[0] || '',
            date: date?.[0] || ''
          });
        }
      }
    }
    
    console.log('\n🏠 ALL COMPS:');
    comps.slice(0, 20).forEach((c, i) => {
      console.log(`${i+1}. ${c.address}`);
      console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.status} ${c.date}`);
    });
    
    // Sanctuary specific
    const sanctuary = comps.filter(c => c.address.toLowerCase().includes('sanctuary'));
    if (sanctuary.length) {
      console.log('\n🏘️ SANCTUARY COMPS:');
      sanctuary.forEach((c, i) => {
        console.log(`${i+1}. ${c.address}`);
        console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft | ${c.status} ${c.date}`);
      });
    }
    
    if (comps.length === 0) {
      console.log('\n📝 Raw page text (excerpt):');
      console.log(text.substring(0, 6000));
    }
    
    console.log('\n✅ Screenshots: /tmp/final-*.png');
    
  } finally {
    await browser.close();
  }
})();
