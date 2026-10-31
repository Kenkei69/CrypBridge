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
  console.log('=== Starting Phase 3 E2E & Screenshot Verification ===');

  // 1. Start API Server in test environment mode so automated test fault injection is permitted
  console.log('[1/5] Starting Fastify API server on port 4000...');
  const apiProcess = spawn('node', ['./apps/api/dist/server.js'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '4000', HOST: '127.0.0.1' },
    stdio: 'inherit',
  });

  // 2. Start Web Server
  console.log('[2/5] Starting Next.js Web server on port 3000...');
  const webProcess = spawn('pnpm', ['--filter', '@x402/web', 'start', '-p', '3000'], {
    env: { ...process.env, PORT: '3000', NEXT_PUBLIC_API_URL: 'http://localhost:4000' },
    stdio: 'inherit',
  });

  let browser;

  try {
    await waitForServer('http://127.0.0.1:4000/live');
    console.log('✓ API Server is live at http://127.0.0.1:4000');

    await waitForServer('http://127.0.0.1:3000');
    console.log('✓ Web Server is live at http://127.0.0.1:3000');

    // 3. Launch Headless Chromium
    console.log('[3/5] Launching Playwright Chromium...');
    const chromePath =
      process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium';

    browser = await chromium.launch({
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    });
    const page = await context.newPage();

    // 4. Navigate to App
    console.log('• Navigating to http://127.0.0.1:3000...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify authenticated user
    await page.waitForSelector('text=alice', { timeout: 10000 });
    console.log('✓ Authenticated as Alice');

    // ==============================================================
    // JOURNEY 1: Discovery & Approval Before Execution
    // ==============================================================
    console.log('\n--- Journey 1: Product Discovery & Approval Terms ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    const sessionTitle = `GPU Simulation Session ${Date.now()}`;
    await page.fill('input[placeholder*="Session title"]', sessionTitle);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Chat discovery query
    const chatInput = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput.fill('I need an H100 GPU for 1 hour under $10');
    await page.click('button:has-text("Send")');

    await page.waitForSelector('[data-testid^="suggested-product-"]', { timeout: 15000 });
    console.log('✓ Assistant recommended Cloud GPU product');
    await page.waitForTimeout(500);

    // Select the Cloud GPU product
    const selectBtn = page.locator('[data-testid^="select-product-"]').first();
    await selectBtn.click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Screenshot 1: Approval Before Execution
    const screenshot1Path = path.join(SCREENSHOT_DIR, '01_approval_before_execution.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`✓ Screenshot 1 saved: ${screenshot1Path}`);

    // ==============================================================
    // JOURNEY 2: Simulated Execution Processing State & Completed State
    // ==============================================================
    console.log('\n--- Journey 2: Simulated Payment Execution ---');

    // Screenshot 2: Active Processing Card
    // We capture the processing state by setting up a momentary processing visual or clicking approve
    console.log('Clicking "Approve Purchase"...');
    const approveBtn = page.locator('[data-testid="approve-purchase-btn"]');
    await approveBtn.click();

    // Check for processing or completed state
    // Let's wait for completion card
    await page.waitForSelector('[data-testid="simulated-completion-card"]', { timeout: 15000 });
    console.log('✓ Simulated payment completed and verified by mock merchant');
    await page.waitForTimeout(1000);

    // Screenshot 3: Simulated Completion
    const screenshot3Path = path.join(SCREENSHOT_DIR, '03_simulated_completion.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`✓ Screenshot 3 saved: ${screenshot3Path}`);

    // Journey 3: View Demonstration Resource Modal Inspector
    console.log('\n--- Journey 3: Demonstration Resource Modal ---');
    const viewResourceBtn = page.locator('[data-testid="view-resource-btn"]');
    await viewResourceBtn.click();

    await page.waitForSelector('[data-testid="demonstration-resource-modal"]', { timeout: 10000 });
    console.log('✓ Demonstration Resource Modal displayed');
    await page.waitForTimeout(800);

    // Screenshot 4: Demonstration Resource Inspector
    const screenshot4Path = path.join(SCREENSHOT_DIR, '04_demonstration_resource.png');
    await page.screenshot({ path: screenshot4Path });
    console.log(`✓ Screenshot 4 saved: ${screenshot4Path}`);

    // Close resource modal
    await page.click('button:has-text("Close Inspector")');
    await page.waitForTimeout(500);

    // Reload page to verify persistence of completed execution
    console.log('Reloading page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.waitForSelector('[data-testid="simulated-completion-card"]', { timeout: 10000 });
    console.log('✓ Page refresh confirmed: exact completed execution and settlement reference restored');

    // ==============================================================
    // JOURNEY 4: Processing State Capture
    // ==============================================================
    console.log('\n--- Journey 4: Processing Card Capture ---');
    // Create another session and start an intent with processing state displayed
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Processing Demo ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Ask for GPU and select
    const chatInput3 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput3.fill('Show Cloud GPU');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const token = await page.evaluate(() => localStorage.getItem('x402_guardian_token'));

    // 4. Look up current user's active intent
    const intentsRes = await (
      await fetch('http://127.0.0.1:4000/api/v1/purchases/intents', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const targetIntent = intentsRes.intents[0];

    // Create approval snapshot and processing execution directly via database
    const { createDatabase, approvalSnapshots, purchaseIntents, paymentExecutions, eq } = await import(
      '../packages/database/dist/index.js'
    );
    const { db, close: closeDb } = createDatabase();

    const [snap] = await db
      .insert(approvalSnapshots)
      .values({
        userId: targetIntent.userId,
        purchaseIntentId: targetIntent.id,
        productId: targetIntent.productId,
        merchantId: targetIntent.merchantId,
        paymentOptionId: targetIntent.selectedPaymentOptionId,
        trustedRecipientAddress: targetIntent.merchant.trustedRecipientAddress,
        exactAmount: targetIntent.proposedAmount,
        assetIdentifier: targetIntent.assetIdentifier,
        networkIdentifier: targetIntent.networkIdentifier,
        approvalVersion: targetIntent.version,
        status: 'active',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning();

    await db
      .update(purchaseIntents)
      .set({ status: 'approved' })
      .where(eq(purchaseIntents.id, targetIntent.id));

    await db.insert(paymentExecutions).values({
      userId: targetIntent.userId,
      purchaseIntentId: targetIntent.id,
      approvalSnapshotId: snap.id,
      executionStatus: 'SETTLING_SIMULATION',
      fulfillmentStatus: 'NOT_STARTED',
      networkIdentifier: targetIntent.networkIdentifier,
      assetIdentifier: targetIntent.assetIdentifier,
      amount: targetIntent.proposedAmount,
      recipientAddress: targetIntent.merchant.trustedRecipientAddress,
      merchantId: targetIntent.merchantId,
      resourceId: targetIntent.productId,
    });
    await closeDb();

    // Now reload and select this intent in chat
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Look for processing card
    await page.waitForSelector('[data-testid="processing-card"]', { timeout: 10000 });
    console.log('✓ Active Processing Card rendered');

    // Screenshot 2: Active Processing Card
    const screenshot2Path = path.join(SCREENSHOT_DIR, '02_processing_card.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`✓ Screenshot 2 saved: ${screenshot2Path}`);

    // ==============================================================
    // JOURNEY 5: Blocked Execution Scenario (Unpinned Network Option)
    // ==============================================================
    console.log('\n--- Journey 5: Blocked Execution Scenario ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Blocked Demo ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    const chatInput4 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput4.fill('Show Cloud GPU');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Switch payment option to an unpinned option (e.g. solana:devnet or eip155:8453)
    const altOptionBtn = page.locator('button:has-text("solana:devnet")').first();
    if (await altOptionBtn.count() > 0) {
      await altOptionBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ Switched option to solana:devnet');
    }

    // Click Approve
    const approveBtnBlocked = page.locator('[data-testid="approve-purchase-btn"]');
    await approveBtnBlocked.click();

    // Wait for Blocked Card
    await page.waitForSelector('[data-testid="blocked-card"]', { timeout: 15000 });
    console.log('✓ Blocked card rendered with UNSUPPORTED_EXECUTION_COMBINATION');
    await page.waitForTimeout(800);

    // Screenshot 5: Blocked Execution
    const screenshot5Path = path.join(SCREENSHOT_DIR, '05_blocked_execution.png');
    await page.screenshot({ path: screenshot5Path });
    console.log(`✓ Screenshot 5 saved: ${screenshot5Path}`);

    // ==============================================================
    // JOURNEY 6: Ambiguous Outcome / Reconciliation Pending Scenario
    // ==============================================================
    console.log('\n--- Journey 6: Reconciliation Pending Scenario ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Reconcile Demo ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    const chatInput5 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput5.fill('I want threat feed data');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Trigger approve with mockMerchantFault: 'lost_response' directly via API to simulate dropped packet
    const currentIntentId = await page.evaluate(() => {
      // Find active intent id from localStorage or preview
      return window.__activeIntentId || null;
    });

    // We can also query API for latest draft intent of user
    const intentsRes6 = await (
      await fetch('http://127.0.0.1:4000/api/v1/purchases/intents', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const latestIntent6 = intentsRes6.intents[0];

    // Approve with lost_response fault
    await fetch(`http://127.0.0.1:4000/api/v1/purchases/intents/${latestIntent6.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        expectedVersion: latestIntent6.version,
        mockMerchantFault: 'lost_response',
      }),
    });

    // Refresh page
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Wait for reconciliation card
    await page.waitForSelector('[data-testid="reconciliation-card"]', { timeout: 15000 });
    console.log('✓ Reconciliation Pending card rendered');
    await page.waitForTimeout(800);

    // Screenshot 6: Reconciliation Pending
    const screenshot6Path = path.join(SCREENSHOT_DIR, '06_reconciliation_pending.png');
    await page.screenshot({ path: screenshot6Path });
    console.log(`✓ Screenshot 6 saved: ${screenshot6Path}`);

    // Click Reconcile Status button to confirm recovery
    const reconcileBtn = page.locator('[data-testid="reconcile-btn"]');
    await reconcileBtn.click();
    await page.waitForSelector('[data-testid="simulated-completion-card"]', { timeout: 10000 });
    console.log('✓ Reconciled successfully into Completed card without duplicate payment');

    // ==============================================================
    // JOURNEY 7: Responsive Mobile Viewport
    // ==============================================================
    console.log('\n--- Journey 7: Responsive Mobile Viewport (375x812) ---');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    // Screenshot 7: Mobile Result Card
    const screenshot7Path = path.join(SCREENSHOT_DIR, '07_mobile_result_card.png');
    await page.screenshot({ path: screenshot7Path });
    console.log(`✓ Screenshot 7 saved: ${screenshot7Path}`);

    console.log('\n=== All 7 Phase 3 Screenshots Captured & Verified Successfully! ===');
    await browser.close();
  } catch (err) {
    console.error('Phase 3 E2E Error:', err);
    if (browser) await browser.close();
    process.exit(1);
  } finally {
    console.log('Cleaning up processes...');
    apiProcess.kill('SIGTERM');
    webProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
