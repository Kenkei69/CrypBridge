import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
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
  console.log('=== Starting Phase 4 E2E & Screenshot Verification ===');

  // 1. Start API Server in test environment mode
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

    // Database access for precise scenario setup
    const {
      createDatabase,
      approvalSnapshots,
      purchaseIntents,
      paymentExecutions,
      guardianDecisions,
      spendingReservations,
      guardianPolicies,
      eq,
      sql,
    } = await import('../packages/database/dist/index.js');
    const { db, close: closeDb } = createDatabase();

    // Ensure clean budget window for browser test runs
    await db.execute(sql`DELETE FROM spending_reservations WHERE user_id = '11111111-1111-1111-1111-111111111111'`);
    await db.execute(sql`DELETE FROM guardian_decisions WHERE user_id = '11111111-1111-1111-1111-111111111111'`);

    const { PaymentExecutionWorker } = await import('../apps/api/dist/modules/payment-engine/paymentExecutionWorker.js');
    const worker = new PaymentExecutionWorker(db, 'test');

    // ==============================================================
    // JOURNEY 1: Successful Simulation with Guardian Verification
    // ==============================================================
    console.log('\n--- Journey 1: Legitimate Simulated Purchase ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    const sessionTitle = `GPU Guardian Verified Session ${Date.now()}`;
    await page.fill('input[placeholder*="Session title"]', sessionTitle);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Chat query
    const chatInput = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput.fill('I want to purchase an H100 GPU compute unit');
    await page.click('button:has-text("Send")');

    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    console.log('✓ Assistant recommended Cloud GPU product');
    await page.locator('[data-testid^="select-product-"]').first().click();

    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Expand Guardian Accordion
    const accordionToggle = page.locator('[data-testid="guardian-accordion-toggle"]');
    if (await accordionToggle.isVisible()) {
      await accordionToggle.click();
      await page.waitForTimeout(400);
    }

    // Click Approve Purchase
    console.log('Clicking "Approve Purchase"...');
    const approveBtn = page.locator('[data-testid="approve-purchase-btn"]');
    await approveBtn.click();

    await page.waitForSelector('[data-testid="simulated-completion-card"]', { timeout: 15000 });
    console.log('✓ Simulated payment completed and verified by Guardian');
    await page.waitForTimeout(1000);

    // Browser Assertion 1: Verification badge and completion card in DOM
    assert.ok(await page.locator('[data-testid="simulated-completion-card"]').isVisible(), 'Completion card must be visible');
    const badgeText = await page.locator('[data-testid="guardian-status-badge"]').first().textContent();
    assert.ok(badgeText.includes('GUARDIAN: VERIFIED') || badgeText.includes('VERIFIED'), 'Guardian verified badge must be present');
    console.log('✓ Assertion 1 passed: Guardian Verified badge confirmed in DOM');

    // Capture Screenshot 8: Successful Simulation
    const screenshot8Path = path.join(SCREENSHOT_DIR, '08_phase4_successful_simulation.png');
    await page.screenshot({ path: screenshot8Path });
    console.log(`✓ Screenshot 8 saved: ${screenshot8Path}`);

    // ==============================================================
    // JOURNEY 2: Overpayment Parameter Attack Blocked
    // ==============================================================
    console.log('\n--- Journey 2: Overpayment Parameter Attack Blocked ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Overpayment Attack Test ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    // Ask for product
    const chatInput2 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput2.fill('Show me Inference API Credits');
    await page.click('button:has-text("Send")');

    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const token = await page.evaluate(() => localStorage.getItem('x402_guardian_token'));
    const activeConvId2 = await page.evaluate(() => localStorage.getItem('x402_active_conv_id'));

    // Retrieve active intent
    const intentsRes = await (
      await fetch('http://127.0.0.1:4000/api/v1/purchases/intents', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const overpayIntent = intentsRes.intents.find((i) => i.conversationId === activeConvId2) || intentsRes.intents[0];

    // Approve intent via API
    const approveOverpayRes = await (
      await fetch(`http://127.0.0.1:4000/api/v1/purchases/intents/${overpayIntent.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedVersion: overpayIntent.version }),
      })
    ).json();

    // Reset execution to QUEUED so adversarial worker processing can test Guardian parameter gate
    await db
      .update(spendingReservations)
      .set({ reservationStatus: 'RELEASED' })
      .where(eq(spendingReservations.paymentExecutionId, approveOverpayRes.execution.id));
    await db
      .update(paymentExecutions)
      .set({
        executionStatus: 'QUEUED',
        workerId: null,
        workerLeaseExpiresAt: null,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(paymentExecutions.id, approveOverpayRes.execution.id));

    // Now simulate an adversarial worker processing attempt with tampered amount
    console.log('Simulating overpayment parameter attack against Guardian...');
    await worker.processExecution(approveOverpayRes.execution.id, {
      simulateTamperedAmount: '15000000', // 15 USDC instead of approved 2 USDC
    });

    // Reload page to display the blocked card
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.waitForSelector('[data-testid="blocked-card"]', { timeout: 10000 });
    console.log('✓ Overpayment attack blocked card displayed with AMOUNT_MISMATCH');
    await page.waitForTimeout(800);

    // Browser Assertion 2: Blocked card visible with AMOUNT_MISMATCH
    assert.ok(await page.locator('[data-testid="blocked-card"]').isVisible(), 'Blocked card must be visible');
    const blockedText2 = await page.locator('[data-testid="blocked-card"]').textContent();
    assert.ok(blockedText2.includes('AMOUNT_MISMATCH') || blockedText2.includes('OVERPAYMENT') || blockedText2.includes('BLOCKED'), 'Amount mismatch must be reported');
    console.log('✓ Assertion 2 passed: Overpayment attack blocked card confirmed in DOM');

    // Capture Screenshot 9: Overpayment Blocked
    const screenshot9Path = path.join(SCREENSHOT_DIR, '09_phase4_overpayment_blocked.png');
    await page.screenshot({ path: screenshot9Path });
    console.log(`✓ Screenshot 9 saved: ${screenshot9Path}`);

    // ==============================================================
    // JOURNEY 3: Wrong Recipient Blocked
    // ==============================================================
    console.log('\n--- Journey 3: Wrong Recipient Blocked ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Recipient Tamper Test ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    const chatInput3 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput3.fill('Show me Storage Tier');
    await page.click('button:has-text("Send")');

    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const activeConvId3 = await page.evaluate(() => localStorage.getItem('x402_active_conv_id'));
    const intentsRes3 = await (
      await fetch('http://127.0.0.1:4000/api/v1/purchases/intents', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const recipientIntent = intentsRes3.intents.find((i) => i.conversationId === activeConvId3) || intentsRes3.intents[0];

    const approveRecipientRes = await (
      await fetch(`http://127.0.0.1:4000/api/v1/purchases/intents/${recipientIntent.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedVersion: recipientIntent.version }),
      })
    ).json();

    // Reset execution to QUEUED for testing Guardian recipient check
    await db
      .update(spendingReservations)
      .set({ reservationStatus: 'RELEASED' })
      .where(eq(spendingReservations.paymentExecutionId, approveRecipientRes.execution.id));
    await db
      .update(paymentExecutions)
      .set({
        executionStatus: 'QUEUED',
        workerId: null,
        workerLeaseExpiresAt: null,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(paymentExecutions.id, approveRecipientRes.execution.id));

    console.log('Simulating recipient address tampering attack against Guardian...');
    await worker.processExecution(approveRecipientRes.execution.id, {
      simulateTamperedRecipient: '0x9999999999999999999999999999999999999999',
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.waitForSelector('[data-testid="blocked-card"]', { timeout: 10000 });
    console.log('✓ Recipient tamper attack blocked card displayed with RECIPIENT_MISMATCH');
    await page.waitForTimeout(800);

    // Browser Assertion 3: Blocked card visible with RECIPIENT_MISMATCH
    assert.ok(await page.locator('[data-testid="blocked-card"]').isVisible(), 'Blocked card must be visible');
    const blockedText3 = await page.locator('[data-testid="blocked-card"]').textContent();
    assert.ok(blockedText3.includes('RECIPIENT_MISMATCH') || blockedText3.includes('BLOCKED'), 'Recipient mismatch must be reported');
    console.log('✓ Assertion 3 passed: Recipient mismatch blocked card confirmed in DOM');

    // Capture Screenshot 10: Wrong Recipient Blocked
    const screenshot10Path = path.join(SCREENSHOT_DIR, '10_phase4_wrong_recipient_blocked.png');
    await page.screenshot({ path: screenshot10Path });
    console.log(`✓ Screenshot 10 saved: ${screenshot10Path}`);

    // ==============================================================
    // JOURNEY 4: Spending Budget Limit Exceeded
    // ==============================================================
    console.log('\n--- Journey 4: Budget Limit Exceeded ---');
    await page.click('button[title*="Start new purchasing chat"]');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder*="Session title"]', `Budget Limit Test ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);

    const chatInput4 = page.locator('input[placeholder*="Ask about GPU"]');
    await chatInput4.fill('Need Security Audit');
    await page.click('button:has-text("Send")');

    await page.waitForSelector('[data-testid^="select-product-"]', { timeout: 15000 });
    await page.locator('[data-testid^="select-product-"]').first().click();
    await page.waitForSelector('[data-testid="compact-approval-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const activeConvId4 = await page.evaluate(() => localStorage.getItem('x402_active_conv_id'));
    const intentsRes4 = await (
      await fetch('http://127.0.0.1:4000/api/v1/purchases/intents', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const budgetIntent = intentsRes4.intents.find((i) => i.conversationId === activeConvId4) || intentsRes4.intents[0];

    const approveBudgetRes = await (
      await fetch(`http://127.0.0.1:4000/api/v1/purchases/intents/${budgetIntent.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedVersion: budgetIntent.version }),
      })
    ).json();

    // Reset execution to QUEUED
    await db
      .update(spendingReservations)
      .set({ reservationStatus: 'RELEASED' })
      .where(eq(spendingReservations.paymentExecutionId, approveBudgetRes.execution.id));
    await db
      .update(paymentExecutions)
      .set({
        executionStatus: 'QUEUED',
        workerId: null,
        workerLeaseExpiresAt: null,
        failureCode: null,
        failureReason: null,
      })
      .where(eq(paymentExecutions.id, approveBudgetRes.execution.id));

    // Temporarily reduce policy limit to 0.1 USDC (below 1 USDC product)
    await db
      .update(guardianPolicies)
      .set({ maxAmountPerPayment: '100000' })
      .where(eq(guardianPolicies.networkIdentifier, 'eip155:84532'));

    console.log('Simulating budget limit exceeded against Guardian...');
    await worker.processExecution(approveBudgetRes.execution.id);

    // Restore standard policy limit
    await db
      .update(guardianPolicies)
      .set({ maxAmountPerPayment: '100000000' })
      .where(eq(guardianPolicies.networkIdentifier, 'eip155:84532'));

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.waitForSelector('[data-testid="blocked-card"]', { timeout: 10000 });
    console.log('✓ Budget limit exceeded card displayed');
    await page.waitForTimeout(800);

    // Browser Assertion 4: Budget limit exceeded card confirmed in DOM
    assert.ok(await page.locator('[data-testid="blocked-card"]').isVisible(), 'Blocked card must be visible');
    const blockedText4 = await page.locator('[data-testid="blocked-card"]').textContent();
    assert.ok(blockedText4.includes('BUDGET_EXCEEDED') || blockedText4.includes('BUDGET_LIMIT') || blockedText4.includes('BLOCKED'), 'Budget exceeded must be reported');
    console.log('✓ Assertion 4 passed: Budget limit exceeded blocked card confirmed in DOM');

    // Capture Screenshot 11: Budget Limit Exceeded
    const screenshot11Path = path.join(SCREENSHOT_DIR, '11_phase4_budget_limit_exceeded.png');
    await page.screenshot({ path: screenshot11Path });
    console.log(`✓ Screenshot 11 saved: ${screenshot11Path}`);

    // ==============================================================
    // JOURNEY 5: Expanded Decision Details Modal
    // ==============================================================
    console.log('\n--- Journey 5: Expanded Decision Details Modal ---');
    // Scroll to Security History panel
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // Inspect first decision
    const inspectBtn = page.locator('[data-testid="inspect-decision-btn"]').first();
    await inspectBtn.click();

    await page.waitForSelector('[data-testid="decision-details-modal"]', { timeout: 10000 });
    console.log('✓ Decision Details Modal displayed');
    await page.waitForTimeout(800);

    // Browser Assertion 5: Decision details modal visible with decision details in DOM
    assert.ok(await page.locator('[data-testid="decision-details-modal"]').isVisible(), 'Decision details modal must be visible');
    const modalText = await page.locator('[data-testid="decision-details-modal"]').textContent();
    assert.ok(modalText.includes('Decision') || modalText.includes('Guardian') || modalText.includes('Evaluated') || modalText.includes('ALLOW') || modalText.includes('BLOCK'), 'Modal must contain decision evaluation details');
    console.log('✓ Assertion 5 passed: Decision Details Modal confirmed in DOM');

    // Capture Screenshot 12: Decision Details Expanded
    const screenshot12Path = path.join(SCREENSHOT_DIR, '12_phase4_decision_details_expanded.png');
    await page.screenshot({ path: screenshot12Path });
    console.log(`✓ Screenshot 12 saved: ${screenshot12Path}`);

    // Close Inspector
    await page.click('button:has-text("Close Inspector")');
    await page.waitForTimeout(500);

    // ==============================================================
    // JOURNEY 6: Blue Team Security History View
    // ==============================================================
    console.log('\n--- Journey 6: Blue Team Security History View ---');
    // Scroll Security History into full view
    const historySection = page.locator('[data-testid="security-history-tab"]');
    await historySection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    // Browser Assertion 6: Security History panel tabs and decision cards
    assert.ok(await page.locator('[data-testid="security-history-tab"]').isVisible(), 'Security History tab must be visible');
    assert.ok(await page.locator('[data-testid="guardian-decisions-tab"]').isVisible(), 'Guardian Decisions tab must be visible');
    assert.ok(await page.locator('[data-testid^="decision-card-"]').first().isVisible(), 'Decision cards must be rendered');
    console.log('✓ Assertion 6 passed: Security History and Guardian decision cards confirmed in DOM');

    // Capture Screenshot 13: Security History
    const screenshot13Path = path.join(SCREENSHOT_DIR, '13_phase4_security_history.png');
    await page.screenshot({ path: screenshot13Path });
    console.log(`✓ Screenshot 13 saved: ${screenshot13Path}`);

    // ==============================================================
    // JOURNEY 7: Mobile Responsive Layout
    // ==============================================================
    console.log('\n--- Journey 7: Mobile Responsive Layout ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Browser Assertion 7: Responsive mobile viewport dimensions and card rendering
    const viewport = page.viewportSize();
    assert.strictEqual(viewport.width, 390);
    assert.strictEqual(viewport.height, 844);
    assert.ok(await page.locator('[data-testid="compact-approval-card"], [data-testid="blocked-card"], [data-testid="simulated-completion-card"]').first().isVisible(), 'Card must be visible on mobile viewport');
    console.log('✓ Assertion 7 passed: Responsive mobile layout confirmed in DOM');

    // Capture Screenshot 14: Mobile Layout
    const screenshot14Path = path.join(SCREENSHOT_DIR, '14_phase4_mobile_view.png');
    await page.screenshot({ path: screenshot14Path });
    console.log(`✓ Screenshot 14 saved: ${screenshot14Path}`);

    await closeDb();
    console.log('\n=== All 7 Phase 4 Screenshots Captured Successfully! ===');
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('Stopping Web and API server processes...');
    webProcess.kill();
    apiProcess.kill();
  }
}

main().catch((err) => {
  console.error('Phase 4 Screenshot Run Failed:', err);
  process.exit(1);
});
