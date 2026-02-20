#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  try {
    console.log('🔐 Login...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'ch@thehooverhometeam.com');
    await page.fill('input[type="password"]', 'Football37!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    
    console.log('🔍 Search...');
    await page.goto('https://www.narrpr.com/home');
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder*="address" i]', '6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    
    console.log('📊 CMA...');
    await page.click('a:has-text("Create CMA")');
    await page.waitForTimeout(4000);
    
    console.log('1️⃣ Confirm Facts...');
    await page.click('text="Confirm Facts"');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    
    console.log('2️⃣ Find Comps...');
    await page.evaluate(() => {
      const btn = document.querySelector('#Valuation_FindCompsBtn');
      if (btn) { btn.classList.remove('disabled', 'is-outlined'); btn.click(); }
    });
    await page.waitForTimeout(5000);
    
    console.log('🔍 Search...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const searchBtn = btns.find(b => b.textContent.trim() === 'Search');
      if (searchBtn) searchBtn.click();
    });
    await page.waitForTimeout(15000);
    
    // Extract ALL text
    console.log('\n📋 EXTRACTING...');
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    
    // Find comp data tables
    const tableData = await page.$$eval('table tr, .property-row, [class*="comp"]', rows => 
      rows.map(r => r.innerText.replace(/\s+/g, ' ').trim()).filter(t => t.length > 10)
    );
    
    console.log('\n📋 TABLE/ROW DATA:');
    tableData.slice(0, 30).forEach((r, i) => console.log(`${i+1}. ${r.substring(0, 200)}`));
    
    // Parse text for property patterns
    const lines = text.split('\n');
    console.log('\n🏠 PROPERTY MATCHES:');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match street addresses
      if (line.match(/^\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter|Loop|Run)/i)) {
        const ctx = lines.slice(i, Math.min(i+8, lines.length));
        const price = ctx.join(' ').match(/\$[\d,]+/g);
        const sqft = ctx.join(' ').match(/([\d,]+)\s*(?:sqft|sq)/i);
        
        console.log(`\n  📍 ${line}`);
        if (price) console.log(`     💰 ${price.join(', ')}`);
        if (sqft) console.log(`     📐 ${sqft[1]} sqft`);
        console.log(`     ${ctx.slice(1, 5).join(' | ')}`);
      }
    }
    
    // Full text dump
    console.log('\n\n📝 FULL PAGE TEXT:');
    console.log('='.repeat(60));
    console.log(text);
    
  } finally {
    await browser.close();
  }
})();
