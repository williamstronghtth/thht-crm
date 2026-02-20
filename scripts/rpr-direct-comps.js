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
    
    // Search
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
    
    // Click Find Comps directly (it's in step 2)
    console.log('🏘️ Clicking Find Comps...');
    
    // Try clicking by role/coordinates - the button is around x=1016, y=502
    const findCompsBtn = await page.locator('text=Find Comps').first();
    if (await findCompsBtn.isVisible()) {
      await findCompsBtn.click();
      console.log('  ✅ Clicked Find Comps link');
    } else {
      // Try coordinate click
      await page.mouse.click(1016, 502);
      console.log('  ✅ Clicked by coordinates');
    }
    
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/direct-comps.png', fullPage: true });
    
    // Extract all text
    const text = await page.evaluate(() => document.body.innerText);
    
    console.log('\n📋 PAGE CONTENT:');
    console.log(text.substring(0, 4000));
    
    // Look for Sanctuary comps
    const lines = text.split('\n');
    const comps = lines.filter(l => l.match(/^\d+\s/) && l.match(/Blvd|Dr|St|Ave|Ct|Way/i) && !l.includes('6085'));
    
    if (comps.length > 0) {
      console.log('\n🏠 COMPS FOUND:');
      comps.slice(0, 15).forEach(c => console.log('  ' + c));
    }
    
  } finally {
    await browser.close();
  }
})();
