#!/usr/bin/env node
/**
 * RPR Comp Finder
 * Gets comparable properties for a specific address
 * 
 * Usage: node rpr-comps.js "6085 Sanctuary Garden Blvd, Port Orange, FL" [--subdivision "Sanctuary"]
 */

const { chromium } = require('playwright');

const RPR_EMAIL = process.env.RPR_EMAIL || 'ch@thehooverhometeam.com';
const RPR_PASSWORD = process.env.RPR_PASSWORD || 'Football37!';

async function getComps(address, options = {}) {
  console.log('🏠 RPR Comp Finder');
  console.log('==================');
  console.log(`Address: ${address}`);
  if (options.subdivision) console.log(`Subdivision filter: ${options.subdivision}`);
  console.log('');

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // 1. Go to login page
    console.log('🔐 Logging into RPR...');
    await page.goto('https://auth.narrpr.com/auth/sign-in', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Screenshot for debugging
    await page.screenshot({ path: '/tmp/rpr-1-login.png' });
    
    // 2. Fill login form - try multiple selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[name*="email" i]',
      '#SignInEmail',
      'input:first-of-type'
    ];
    
    let emailFilled = false;
    for (const sel of emailSelectors) {
      try {
        const input = await page.$(sel);
        if (input) {
          await input.click();
          await input.fill(RPR_EMAIL);
          emailFilled = true;
          console.log(`  ✓ Email filled using: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!emailFilled) {
      throw new Error('Could not find email input field');
    }
    
    const pwdSelectors = [
      'input[type="password"]',
      'input[placeholder*="password" i]',
      'input[name*="password" i]',
      '#SignInPassword'
    ];
    
    let pwdFilled = false;
    for (const sel of pwdSelectors) {
      try {
        const input = await page.$(sel);
        if (input) {
          await input.click();
          await input.fill(RPR_PASSWORD);
          pwdFilled = true;
          console.log(`  ✓ Password filled using: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!pwdFilled) {
      throw new Error('Could not find password input field');
    }
    
    await page.screenshot({ path: '/tmp/rpr-2-filled.png' });
    
    // 3. Click sign in
    const signInSelectors = [
      'button:has-text("Sign In")',
      'button[type="submit"]',
      '#SignInBtn',
      'input[type="submit"]'
    ];
    
    for (const sel of signInSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          console.log(`  ✓ Clicked sign in using: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    // 4. Wait for navigation
    console.log('  ⏳ Waiting for login...');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/rpr-3-afterlogin.png' });
    
    const currentUrl = page.url();
    console.log(`  📍 Current URL: ${currentUrl}`);
    
    // Check if login succeeded
    if (currentUrl.includes('sign-in') || currentUrl.includes('auth')) {
      // Check for error message
      const errorText = await page.$eval('body', el => el.innerText).catch(() => '');
      if (errorText.toLowerCase().includes('invalid') || errorText.toLowerCase().includes('incorrect')) {
        throw new Error('Login failed - invalid credentials');
      }
      console.log('  ⚠️  May still be on login page, continuing anyway...');
    } else {
      console.log('  ✅ Login successful!');
    }
    
    // 5. Search for the property
    console.log(`\n🔍 Searching for: ${address}`);
    
    // Try to find search box on current page or navigate to search
    await page.goto('https://www.narrpr.com/home', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/rpr-4-home.png' });
    
    // Find and use search input
    const searchSelectors = [
      'input[placeholder*="address" i]',
      'input[placeholder*="search" i]',
      'input[type="search"]',
      'input[type="text"]',
      '#search-input',
      '.search-input'
    ];
    
    let searchInput = null;
    for (const sel of searchSelectors) {
      try {
        searchInput = await page.$(sel);
        if (searchInput) {
          const isVisible = await searchInput.isVisible();
          if (isVisible) {
            console.log(`  ✓ Found search input: ${sel}`);
            break;
          }
        }
      } catch (e) {}
    }
    
    if (!searchInput) {
      // Try to find it within the page
      const allInputs = await page.$$('input');
      for (const inp of allInputs) {
        const isVisible = await inp.isVisible().catch(() => false);
        const placeholder = await inp.getAttribute('placeholder').catch(() => '');
        if (isVisible && placeholder) {
          searchInput = inp;
          console.log(`  ✓ Found visible input with placeholder: ${placeholder}`);
          break;
        }
      }
    }
    
    if (searchInput) {
      await searchInput.click();
      await searchInput.fill(address);
      await page.waitForTimeout(2000);
      
      // Look for autocomplete suggestion and click it, or press Enter
      const suggestion = await page.$('.autocomplete-item, [role="option"], .suggestion');
      if (suggestion) {
        await suggestion.click();
      } else {
        await searchInput.press('Enter');
      }
      
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/rpr-5-search.png' });
    } else {
      console.log('  ❌ Could not find search input');
    }
    
    // 6. Look for property details page
    console.log('\n📋 Extracting property and comp data...');
    const pageUrl = page.url();
    console.log(`  📍 URL: ${pageUrl}`);
    
    // Take full page screenshot
    await page.screenshot({ path: '/tmp/rpr-6-result.png', fullPage: true });
    
    // Try to find "Comps" or "CMA" link/button
    const compLinks = [
      'a:has-text("Comps")',
      'button:has-text("Comps")',
      'a:has-text("CMA")',
      '[data-tab="comps"]',
      '.comp-link'
    ];
    
    for (const sel of compLinks) {
      try {
        const link = await page.$(sel);
        if (link && await link.isVisible()) {
          await link.click();
          console.log(`  ✓ Clicked comps link: ${sel}`);
          await page.waitForTimeout(5000);
          await page.screenshot({ path: '/tmp/rpr-7-comps.png', fullPage: true });
          break;
        }
      } catch (e) {}
    }
    
    // 7. Extract visible data
    const pageContent = await page.evaluate(() => {
      // Get all text content
      const getText = (el) => {
        if (!el) return '';
        return el.innerText || el.textContent || '';
      };
      
      // Try to find property info
      const results = {
        pageTitle: document.title,
        mainContent: '',
        tables: []
      };
      
      // Get main content area
      const mainSelectors = ['main', '#content', '.content', '.property-details', 'article'];
      for (const sel of mainSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          results.mainContent = getText(el).substring(0, 5000);
          break;
        }
      }
      
      if (!results.mainContent) {
        results.mainContent = getText(document.body).substring(0, 5000);
      }
      
      // Get any tables
      const tables = document.querySelectorAll('table');
      tables.forEach((table, i) => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(cell => {
            cells.push(getText(cell).trim());
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) {
          results.tables.push(rows);
        }
      });
      
      return results;
    });
    
    console.log('\n📊 Page Title:', pageContent.pageTitle);
    console.log('\n📄 Content Preview:');
    console.log(pageContent.mainContent.substring(0, 2000));
    
    if (pageContent.tables.length > 0) {
      console.log('\n📋 Tables Found:', pageContent.tables.length);
      pageContent.tables.forEach((table, i) => {
        console.log(`\nTable ${i + 1}:`);
        table.slice(0, 10).forEach(row => {
          console.log('  ' + row.join(' | '));
        });
      });
    }
    
    console.log('\n✅ Screenshots saved to /tmp/rpr-*.png');
    console.log('Check them for visual verification.');
    
    return pageContent;
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: '/tmp/rpr-error.png' }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

// Parse args and run
const args = process.argv.slice(2);
const address = args[0] || '6085 Sanctuary Garden Blvd, Port Orange, FL';
const options = {};

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--subdivision' && args[i + 1]) {
    options.subdivision = args[i + 1];
    i++;
  }
}

getComps(address, options)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
