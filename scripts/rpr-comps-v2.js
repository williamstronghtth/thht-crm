#!/usr/bin/env node
/**
 * RPR Comps v2 - More robust selectors
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
    
    // Click Create CMA link
    console.log('📊 Opening CMA...');
    await page.click('a:has-text("Create CMA")');
    await page.waitForTimeout(6000);
    await page.screenshot({ path: '/tmp/v2-1-cma-page.png', fullPage: true });
    
    // Debug: print all buttons and links
    const allButtons = await page.$$eval('button, a, [role="button"]', els => 
      els.map(e => ({ tag: e.tagName, text: e.innerText?.substring(0, 50), classes: e.className }))
    );
    console.log('\n📌 Buttons/links found:');
    allButtons.filter(b => b.text).slice(0, 30).forEach(b => 
      console.log(`  ${b.tag}: "${b.text}"`)
    );
    
    // Try clicking Find Comps with various selectors
    console.log('\n🏘️ Looking for Find Comps...');
    const findCompsSelectors = [
      'a:has-text("Find Comps")',
      'button:has-text("Find Comps")',
      ':has-text("Find Comps")',
      '[class*="btn"]:has-text("Find")',
      'text="Find Comps"',
      'text=/Find.*Comps/i'
    ];
    
    let clicked = false;
    for (const sel of findCompsSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const visible = await el.isVisible();
          console.log(`  Trying: ${sel} (visible: ${visible})`);
          if (visible) {
            await el.click();
            clicked = true;
            console.log('  ✅ Clicked!');
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }
    
    if (!clicked) {
      // Try clicking by coordinates based on the known button location
      console.log('  Trying coordinate click (right side of step 2)...');
      // Step 2 "Find Comps" button is on the right side around y=502
      await page.mouse.click(1016, 502);
    }
    
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/v2-2-after-click.png', fullPage: true });
    
    // Now look for comp data
    console.log('\n📋 Extracting comps...');
    
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Parse for addresses
    const addressRegex = /\d+\s+[\w\s]+(?:Blvd|Dr|St|Ave|Ct|Ln|Way|Cir|Pl|Ter|Loop)/gi;
    const addresses = pageText.match(addressRegex) || [];
    
    console.log('\n🏠 Addresses found:');
    [...new Set(addresses)].slice(0, 25).forEach((a, i) => console.log(`  ${i+1}. ${a}`));
    
    // Look for Sanctuary specifically
    const sanctuaryMatches = pageText.match(/\d+\s+Sanctuary[\w\s]+(?:Blvd|Dr|Way|Ct)/gi) || [];
    console.log('\n🏘️ Sanctuary properties:');
    [...new Set(sanctuaryMatches)].forEach((a, i) => console.log(`  ${i+1}. ${a}`));
    
    // Look for price data near sanctuary
    const lines = pageText.split('\n');
    console.log('\n💰 Lines with prices:');
    lines.filter(l => l.includes('$') && l.match(/\d+,?\d{3}/))
      .slice(0, 20)
      .forEach(l => console.log('  ' + l.trim().substring(0, 100)));
    
    console.log('\n✅ Screenshots: /tmp/v2-*.png');
    
  } finally {
    await browser.close();
  }
}

findComps().catch(e => console.error('Error:', e.message));
