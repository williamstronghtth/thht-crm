#!/usr/bin/env node
/**
 * RPR Comps Final - Proper CMA flow
 * 1. Confirm Facts → 2. Find Comps → Extract results
 */

const { chromium } = require('playwright');

async function getComps() {
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
    console.log('🔍 Searching: 6085 Sanctuary Garden Blvd...');
    await page.goto('https://www.narrpr.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const searchInput = await page.$('input[placeholder*="address" i]');
    await searchInput.fill('6085 Sanctuary Garden Blvd, Port Orange, FL');
    await page.waitForTimeout(2000);
    await searchInput.press('Enter');
    await page.waitForTimeout(8000);
    
    // Click Create CMA
    console.log('📊 Opening CMA...');
    await page.click('a:has-text("Create CMA")');
    await page.waitForTimeout(5000);
    
    // STEP 1: Click "Confirm Facts" first
    console.log('1️⃣ Confirming home facts...');
    try {
      await page.click('button:has-text("Confirm Facts"), a:has-text("Confirm Facts")', { timeout: 5000 });
      await page.waitForTimeout(3000);
      console.log('  ✅ Facts confirmed');
    } catch (e) {
      console.log('  ⚠️ Confirm Facts not found, continuing...');
    }
    
    await page.screenshot({ path: '/tmp/final-1-facts.png' });
    
    // STEP 2: Click "Find Comps"
    console.log('2️⃣ Finding comps...');
    try {
      // Look for the Find Comps button specifically
      await page.waitForSelector('button:has-text("Find Comps"), a:has-text("Find Comps")', { timeout: 5000 });
      await page.click('button:has-text("Find Comps"), a:has-text("Find Comps")');
      await page.waitForTimeout(8000);
      console.log('  ✅ Clicked Find Comps');
    } catch (e) {
      console.log('  ⚠️ Find Comps click failed, trying alternative...');
      // Try clicking on step 2 area
      await page.click('text=Search for Comps');
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/tmp/final-2-comps.png', fullPage: true });
    
    // Check for comp search modal or new page
    const currentUrl = page.url();
    console.log('  📍 URL:', currentUrl);
    
    // Look for comp grid/list
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Check if we're on a comp selection page
    if (pageText.includes('Select') || pageText.includes('Sold') || pageText.includes('Comp')) {
      console.log('  ✅ Comp selection page detected');
    }
    
    // Try to find any property cards or comp listings
    const cards = await page.$$('[class*="card"], [class*="property"], [class*="comp"], [class*="result"]');
    console.log(`  📋 Found ${cards.length} potential comp cards`);
    
    // Extract all addresses from page
    console.log('\n📋 EXTRACTING DATA...');
    
    // Look for table with comp data
    const tableData = await page.$$eval('table tr', rows => 
      rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.innerText.trim()).join(' | '))
    );
    
    if (tableData.length > 1) {
      console.log('\n📋 TABLE DATA:');
      tableData.slice(0, 20).forEach(row => console.log('  ' + row));
    }
    
    // Look for Sanctuary addresses with prices
    const lines = pageText.split('\n');
    console.log('\n🏠 LOOKING FOR SANCTUARY COMPS...');
    
    // Find all lines with addresses
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\d+\s+\w+/) && line.match(/(?:Blvd|Dr|St|Ave|Ct|Ln|Way)/i)) {
        // Check nearby lines for price/details
        const context = lines.slice(i, i+6).join(' ');
        const priceMatch = context.match(/\$[\d,]+/);
        const sqftMatch = context.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        
        if (priceMatch) {
          console.log(`  ${line} - ${priceMatch[0]} ${sqftMatch ? sqftMatch[0] : ''}`);
        }
      }
    }
    
    // Check for Sanctuary specifically
    const sanctuaryLines = lines.filter(l => l.toLowerCase().includes('sanctuary'));
    if (sanctuaryLines.length > 0) {
      console.log('\n🏘️ SANCTUARY MENTIONS:');
      sanctuaryLines.slice(0, 10).forEach(l => console.log('  ' + l));
    }
    
    // If we're still on CMA wizard, dump all visible text for debugging
    console.log('\n📝 PAGE CONTENT (first 3000 chars):');
    console.log(pageText.substring(0, 3000));
    
    console.log('\n✅ Screenshots: /tmp/final-*.png');
    
  } finally {
    await browser.close();
  }
}

getComps().catch(e => console.error('Error:', e.message));
