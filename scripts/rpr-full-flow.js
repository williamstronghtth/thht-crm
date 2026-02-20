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
    await page.screenshot({ path: '/tmp/flow-1-cma.png' });
    
    // Step 1: Click Confirm Facts button (blue button)
    console.log('1️⃣ Confirm Facts...');
    // The button ID from earlier debug: Valuation_ConfirmFactsBtn or similar
    const confirmBtn = await page.$('#Valuation_ConfirmFactsBtn, button:has-text("Confirm Facts"), a:has-text("Confirm Facts")');
    if (confirmBtn) {
      await confirmBtn.click();
      console.log('  ✅ Clicked Confirm Facts');
    } else {
      // Try clicking by visible text
      await page.click('text="Confirm Facts"');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/flow-2-modal.png' });
    
    // Modal is now open - need to close it by clicking X or scrolling and saving
    console.log('  Closing modal...');
    
    // Try to find close/save/confirm button in modal
    // Modal has class ui-dialog
    const modalBtns = [
      '.ui-dialog-titlebar-close',  // X button
      '.ui-dialog button:has-text("Save")',
      '.ui-dialog button:has-text("Close")',
      '.ui-dialog button:has-text("Confirm")',
      'button.ui-button:has-text("Save")',
      '[aria-label="Close"]'
    ];
    
    let closed = false;
    for (const sel of modalBtns) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          console.log(`  ✅ Closed modal with: ${sel}`);
          closed = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!closed) {
      // Try pressing Escape
      await page.keyboard.press('Escape');
      console.log('  Tried Escape key');
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/flow-3-aftermodal.png' });
    
    // Step 2: Now click Find Comps (should be enabled now)
    console.log('2️⃣ Find Comps...');
    const findBtn = await page.$('#Valuation_FindCompsBtn, a:has-text("Find Comps")');
    const isDisabled = await findBtn?.getAttribute('class');
    console.log(`  Button class: ${isDisabled}`);
    
    if (isDisabled && !isDisabled.includes('disabled')) {
      await findBtn.click();
      console.log('  ✅ Clicked Find Comps');
    } else {
      console.log('  ⚠️ Button still disabled, forcing click...');
      await page.evaluate(() => {
        const btn = document.querySelector('#Valuation_FindCompsBtn');
        if (btn) {
          btn.classList.remove('disabled', 'is-outlined');
          btn.click();
        }
      });
    }
    
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/flow-4-comps.png', fullPage: true });
    
    // Extract comps
    console.log('\n📋 COMPS DATA:');
    const text = await page.evaluate(() => document.body.innerText);
    
    // Parse for comp listings
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+\s+\w+/) && line.match(/(?:Blvd|Dr|St|Ave|Ct|Ln|Way)/i)) {
        const ctx = lines.slice(i, i+5).join(' ');
        const price = ctx.match(/\$[\d,]+/);
        if (price && !line.includes('6085')) {
          console.log(`  ${line} - ${price[0]}`);
        }
      }
    }
    
    // Show full text if no comps found
    if (!text.includes('Sold')) {
      console.log('\n📝 Full page (first 3000 chars):');
      console.log(text.substring(0, 3000));
    }
    
  } finally {
    await browser.close();
  }
})();
