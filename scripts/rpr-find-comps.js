#!/usr/bin/env node
/**
 * RPR Find Comps - Click through CMA wizard
 */

const { chromium } = require('playwright');

async function findComps() {
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
    
    // Search property
    console.log('🔍 Searching property...');
    await page.goto('https://www.narrpr.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const searchInput = await page.$('input[placeholder*="address" i]');
    await searchInput.fill('6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.waitForTimeout(2000);
    await searchInput.press('Enter');
    await page.waitForTimeout(8000);
    
    // Click Create CMA
    console.log('📊 Opening CMA...');
    await page.click('text=Create CMA');
    await page.waitForTimeout(5000);
    
    // Click Find Comps button
    console.log('🏘️ Clicking Find Comps...');
    await page.click('text=Find Comps, button:has-text("Find Comps")');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/comps-1-search.png', fullPage: true });
    
    // Look for subdivision filter or search options
    console.log('🔧 Looking for filters...');
    
    // Try to type Sanctuary in any search field
    const subFields = await page.$$('input[type="text"]');
    for (const field of subFields) {
      const placeholder = await field.getAttribute('placeholder').catch(() => '');
      const name = await field.getAttribute('name').catch(() => '');
      console.log(`  Found input: placeholder="${placeholder}", name="${name}"`);
    }
    
    // Click Search/Apply if there's such a button
    const searchBtn = await page.$('button:has-text("Search"), button:has-text("Apply")');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/tmp/comps-2-results.png', fullPage: true });
    
    // Extract comp results
    console.log('\n📋 COMP RESULTS:');
    console.log('==================');
    
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Look for address + price patterns typical in comp lists
    const lines = pageText.split('\n');
    const compData = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Look for address patterns (number + street name)
      if (line.match(/^\d+\s+\w+.*(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter|Loop)/i)) {
        const priceMatch = lines.slice(i, i+5).join(' ').match(/\$[\d,]+/);
        const sqftMatch = lines.slice(i, i+5).join(' ').match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const bedMatch = lines.slice(i, i+5).join(' ').match(/(\d+)\s*(?:bed|bd)/i);
        const bathMatch = lines.slice(i, i+5).join(' ').match(/(\d+(?:\.\d)?)\s*(?:bath|ba)/i);
        
        compData.push({
          address: line,
          price: priceMatch ? priceMatch[0] : '',
          sqft: sqftMatch ? sqftMatch[1] : '',
          beds: bedMatch ? bedMatch[1] : '',
          baths: bathMatch ? bathMatch[1] : ''
        });
      }
    }
    
    // Print comps
    compData.slice(0, 20).forEach((c, i) => {
      console.log(`${i+1}. ${c.address}`);
      console.log(`   ${c.price} | ${c.beds}bd/${c.baths}ba | ${c.sqft} sqft`);
    });
    
    // Also check for tables
    const tables = await page.$$eval('table', tables => 
      tables.map(t => Array.from(t.querySelectorAll('tr')).map(tr => 
        Array.from(tr.querySelectorAll('th,td')).map(c => c.innerText.trim()).join(' | ')
      ))
    );
    
    if (tables.length > 0) {
      console.log('\n📋 TABLES:');
      tables.forEach((t, i) => {
        console.log(`\nTable ${i+1}:`);
        t.slice(0, 15).forEach(row => console.log('  ' + row));
      });
    }
    
    // Look specifically for Sanctuary
    if (pageText.toLowerCase().includes('sanctuary')) {
      console.log('\n✅ "Sanctuary" found in results');
      const sanctuaryLines = lines.filter(l => l.toLowerCase().includes('sanctuary'));
      sanctuaryLines.slice(0, 10).forEach(l => console.log('  ' + l));
    }
    
    console.log('\n✅ Screenshots: /tmp/comps-*.png');
    
  } finally {
    await browser.close();
  }
}

findComps().catch(e => console.error('Error:', e.message));
