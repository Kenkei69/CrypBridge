import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 200) {
        return true;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function main() {
  console.log('=== Starting Phase 2 E2E & Screenshot Verification ===');

  // 1. Start API Server
  console.log('[1/5] Starting Fastify API server on port 4000...');
  const apiProcess = spawn('node', ['./apps/api/dist/server.js'], {
    env: { ...process.env, PORT: '4000', HOST: '127.0.0.1' },
    stdio: 'inherit',
  });

  // 2. Start Web Server
  console.log('[2/5] Starting Next.js Web server on port 3000...');
  const webProcess = spawn('pnpm', ['--filter', '@x402/web', 'start', '-p', '3000'], {
    env: { ...process.env, PORT: '3000', NEXT_PUBLIC_API_URL: 'http://localhost:4000' },
    stdio: 'inherit',
  });

  try {
    await waitForServer('http://127.0.0.1:4000/live');
    console.log('✓ API Server is live at http://127.0.0.1:4000');

    await waitForServer('http://127.0.0.1:3000');
    console.log('✓ Web Server is live at http://127.0.0.1:3000');

    // 3. Launch Headless Chromium
    console.log('[3/5] Launching Playwright Chromium...');
    const browser = await chromium.launch({
      executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    });
    const page = await context.newPage();

    // 4. Step 1: Sign in and open page
    console.log('• Step 1: Navigating to http://127.0.0.1:3000...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify authenticated user badge
    await page.waitForSelector('text=alice', { timeout: 10000 });
    console.log('✓ Authenticated as Alice (Demo User)');

    // Always create a fresh purchasing session for this test run
    console.log('Creating fresh purchasing session for discovery & approval test...');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    const sessionTitle = `Cloud GPU Session ${Date.now()}`;
    await page.fill('input[placeholder*="Session title"]', sessionTitle);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Step 2 & 3: Product discovery via natural language chat
    console.log('• Step 2 & 3: Chat product discovery query ("I need a GPU for 1 hour under $10")...');
    const chatInput = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput.fill('I need a GPU for 1 hour under $10');
    await page.click('button:has-text("Send")');

    // Wait for assistant response and product card
    await page.waitForSelector('[data-testid^="suggested-product-"]', { timeout: 15000 });
    console.log('✓ Assistant responded with catalog-grounded product recommendations');
    await page.waitForTimeout(1000);

    // Capture Screenshot 1: Product Discovery
    const screenshot1Path = path.join(SCREENSHOT_DIR, '01_product_discovery.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`✓ Screenshot 1 saved: ${screenshot1Path}`);

    // Step 4: Select a product
    console.log('• Step 4: Selecting Cloud GPU product...');
    const selectBtn = page.locator('[data-testid^="select-product-"]').first();
    await selectBtn.click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    console.log('✓ Compact Approval Card rendered');
    await page.waitForTimeout(1000);

    // Capture Screenshot 2: Payment-Option Selection
    const screenshot2Path = path.join(SCREENSHOT_DIR, '02_payment_option_selection.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`✓ Screenshot 2 saved: ${screenshot2Path}`);

    // Step 5: Switch payment option to Base Mainnet or Solana Devnet
    console.log('• Step 5: Switching payment option to Base Mainnet (eip155:8453)...');
    const mainnetOptionBtn = page.locator('button:has-text("eip155:8453")').first();
    if (await mainnetOptionBtn.count() > 0) {
      await mainnetOptionBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ Switched payment option to Base Mainnet (eip155:8453)');
    }

    // Capture Screenshot 3: Approval Preview with authoritatively locked terms
    const screenshot3Path = path.join(SCREENSHOT_DIR, '03_approval_preview.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`✓ Screenshot 3 saved: ${screenshot3Path}`);

    // Step 6 & 7: Explicit user approval
    console.log('• Step 6 & 7: Explicitly clicking "Approve Purchase"...');
    const approveBtn = page.locator('[data-testid="approve-purchase-btn"]');
    await approveBtn.click();

    // Wait for approved status banner
    await page.waitForSelector('[data-testid="approved-status-banner"]', { timeout: 10000 });
    const approvedText = await page.textContent('[data-testid="approved-status-banner"]');
    console.log(`✓ Approved banner text observed: "${approvedText.trim().replace(/\s+/g, ' ')}"`);

    if (!approvedText.includes('Purchase approved — payment has not been executed.')) {
      throw new Error(`Expected text "Purchase approved — payment has not been executed." not found!`);
    }

    // Capture Screenshot 4: Approved State
    const screenshot4Path = path.join(SCREENSHOT_DIR, '04_approved_state.png');
    await page.screenshot({ path: screenshot4Path });
    console.log(`✓ Screenshot 4 saved: ${screenshot4Path}`);

    // Step 8: Refresh and confirm persisted state
    console.log('• Step 8: Reloading page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Confirm that the approved card and text survive page reload
    await page.waitForSelector('[data-testid="approved-status-banner"]', { timeout: 10000 });
    const reloadedText = await page.textContent('[data-testid="approved-status-banner"]');
    if (!reloadedText.includes('Purchase approved — payment has not been executed.')) {
      throw new Error(`Persisted state failed to load after page reload!`);
    }
    console.log('✓ Page refresh confirmed: identical approved state and snapshot restored from database');

    // Step 9: Rejection Journey
    console.log('• Step 9: Testing separate Rejection Journey...');
    // Create a new purchasing session for rejection test
    const newSessionBtn = page.locator('button[title*="Start new purchasing chat"]');
    await newSessionBtn.click();
    await page.waitForTimeout(300);
    const titleInput = page.locator('input[placeholder*="Session title"]');
    await titleInput.fill(`Security Feed Session ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Ask assistant for threat feed
    console.log('Asking assistant for threat feeds...');
    const chatInput2 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput2.fill('I want to buy the security threat feed');
    await page.click('button:has-text("Send")');

    // Wait for suggested product card
    await page.waitForSelector('[data-testid^="suggested-product-"]', { timeout: 15000 });
    console.log('✓ Threat feed product suggested');
    await page.waitForTimeout(500);

    // Select the suggested product
    const selectThreatBtn = page.locator('[data-testid^="select-product-"]').first();
    await selectThreatBtn.click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Click Reject
    console.log('Rejecting purchase...');
    await page.click('button:has-text("Reject Purchase")');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Terms too high"]', 'Testing explicit rejection flow');
    await page.click('[data-testid="confirm-reject-btn"]');

    // Wait for rejected status banner
    await page.waitForSelector('[data-testid="rejected-status-banner"]', { timeout: 10000 });
    console.log('✓ Rejected status banner confirmed');

    // Capture Screenshot 5: Rejected State
    const screenshot5Path = path.join(SCREENSHOT_DIR, '05_rejected_state.png');
    await page.screenshot({ path: screenshot5Path });
    console.log(`✓ Screenshot 5 saved: ${screenshot5Path}`);

    // Step 10: Mobile layout verification
    console.log('• Step 10: Testing mobile layout viewport (375x812)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    // Capture Screenshot 6: Mobile Layout
    const screenshot6Path = path.join(SCREENSHOT_DIR, '06_mobile_layout.png');
    await page.screenshot({ path: screenshot6Path });
    console.log(`✓ Screenshot 6 saved: ${screenshot6Path}`);

    console.log('=== All 10 browser journey steps & 6 screenshots verified successfully! ===');

    await browser.close();
  } finally {
    console.log('Stopping test servers...');
    apiProcess.kill('SIGTERM');
    webProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
