#!/usr/bin/env node
/**
 * RPR Quick Comps - Handle modal, get comps fast
 */

const { chromium } = require('playwright');

async function getComps() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Login
    console.log('🔐 Logging in...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"]', 'ch@thehooverhometeam.com');
    await page.fill('input[type="password"]', 'Football37!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    
    // Search property
    console.log('🔍 Searching property...');
    await page.goto('https://www.narrpr.com/home');
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder*="address" i]', '6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    
    // Click Create CMA
    console.log('📊 Opening CMA...');
    await page.click('a:has-text("Create CMA")');
    await page.waitForTimeout(4000);
    
    // Click Confirm Facts to open modal
    console.log('1️⃣ Opening facts modal...');
    await page.click('button:has-text("Confirm Facts")');
    await page.waitForTimeout(2000);
    
    // Close the modal - look for X button or Save/Confirm button
    console.log('  Closing modal...');
    const closeButtons = [
      'button.ui-dialog-titlebar-close',
      '[aria-label="Close"]',
      '.ui-dialog-titlebar-close',
      'button:has-text("Save")',
      'button:has-text("Confirm")',
      'button:has-text("OK")',
      '.ui-icon-closethick'
    ];
    
    for (const sel of closeButtons) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          console.log(`  ✅ Closed with: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    // Also try pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/quick-1.png' });
    
    // Now click Find Comps
    console.log('2️⃣ Finding comps...');
    await page.click('button:has-text("Find Comps"), a:has-text("Find Comps")');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/quick-2.png', fullPage: true });
    
    // Extract comps
    console.log('\n📋 COMP DATA:');
    const text = await page.evaluate(() => document.body.innerText);
    
    // Find addresses with context
    const lines = text.split('\n');
    const comps = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+\s+\w+.*(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl)/i) && !line.includes('6085')) {
        const ctx = lines.slice(i, i+6).join(' ');
        const price = ctx.match(/\$[\d,]+/);
        const sqft = ctx.match(/([\d,]+)\s*(?:sq|SF)/i);
        const sold = ctx.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        
        comps.push({
          address: line,
          price: price?.[0] || '',
          sqft: sqft?.[1] || '',
          date: sold?.[0] || ''
        });
      }
    }
    
    comps.slice(0, 15).forEach((c, i) => {
      console.log(`${i+1}. ${c.address}`);
      if (c.price || c.sqft) console.log(`   ${c.price} | ${c.sqft} sqft | ${c.date}`);
    });
    
    // Look specifically for Sanctuary
    const sanctuary = lines.filter(l => l.toLowerCase().includes('sanctuary') && !l.includes('6085'));
    if (sanctuary.length) {
      console.log('\n🏘️ SANCTUARY MATCHES:');
      sanctuary.slice(0, 10).forEach(l => console.log('  ' + l.substring(0, 100)));
    }
    
    console.log('\n✅ Done - screenshots: /tmp/quick-*.png');
    
  } finally {
    await browser.close();
  }
}

getComps().catch(console.error);
