import { test, expect } from "@playwright/test";
test("reference homepage, live wallet, navigation and responsive drawer", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/blue-team/ai-agent");
  await expect(
    page.getByRole("heading", { name: "Buy Anything With Crypto" }),
  ).toBeVisible();
  expect(await page.locator(".cb-quick-actions>button").count()).toBe(3);
  await expect(page.locator(".cb-wallet-balances strong")).toHaveText(/USDC/, {
    timeout: 30000,
  });
  const balanceResponse = await page.request.get("/api/live/balance");
  expect(balanceResponse.ok()).toBe(true);
  const balance = await balanceResponse.json();
  await expect(page.locator(".cb-wallet-balances strong")).toHaveText(
    `${BigInt(balance.usdcAtomic) / 1000000n}.00 USDC`,
  );
  await page.screenshot({
    path: "artifacts/redesign/desktop.png",
    fullPage: true,
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy wallet address", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    balance.address,
  );
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(page.locator(".cb-app")).toHaveClass(/cb-collapsed/);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".cb-app")).not.toHaveClass(/cb-collapsed/);
  const nav = page.getByRole("navigation");
  for (const [label, heading] of [
    ["Purchases", "Purchases"],
    ["Payments", "Payments"],
    ["Tracking", "Tracking"],
    ["Reports", "Reports"],
    ["Account", "Account"],
    ["Settings", "Settings"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
  await nav.getByRole("link", { name: "Chat", exact: true }).click();
  await page
    .getByRole("button", { name: "Verify Payment", exact: false })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Transaction hash or wallet address" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Transaction hash or wallet address" })
    .fill(balance.address);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Address read", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/blue-team/ai-agent");
  await page.screenshot({
    path: "artifacts/redesign/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    nav.getByRole("link", { name: "Purchases", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/redesign/tablet.png",
    fullPage: true,
  });
});
test("chat persists, cancellation is real, payment is blocked before signing, Red Team stays independent", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/blue-team/ai-agent");
  await page
    .getByRole("button", { name: "Buy a Product", exact: false })
    .click();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toHaveValue(/AI security research report/);
  await composer.press("Shift+Enter");
  await expect(composer).toHaveValue(/\n/);
  await composer.press("Enter");
  await expect(
    page.getByRole("button", { name: "Approve & Pay", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Approve & Pay", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Cancelled by user before signing", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await composer.fill("Buy me an AI security research report for 1 USDC.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve & Pay", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const merchant = await page.request.get("/merchant/report");
  expect(merchant.status()).toBe(402);
  expect(merchant.headers()["payment-required"]).toBeTruthy();
  await page
    .getByRole("button", { name: "Approve & Pay", exact: true })
    .click();
  await expect(
    page.getByText("Insufficient testnet USDC", { exact: true }),
  ).toBeVisible({ timeout: 40000 });
  await expect(
    page.getByText("Signing was not requested. No payment was submitted.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator(".cb-receipt").count()).toBe(1);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(page.locator(".cb-conversation-link")).toHaveCount(2);
  await page.locator(".cb-conversation-link").last().click();
  await expect(
    page.getByText("Cancelled by user before signing", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("link", { name: "Red Team workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Red Team workspace", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Overpayment",
    "Wrong recipient",
    "Prompt injection",
    "Duplicate payment",
    "Unauthorized contract signing",
  ]) {
    await page.getByRole("button", { name: new RegExp("^" + name) }).click();
    await expect(page.locator(".cb-attack-result .cb-status")).toHaveText(
      "Blocked by Guardian",
    );
  }
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveCount(0);
});
test("disconnected services never show healthy Guardian or fabricated wallet balance", async ({
  page,
}) => {
  await page.route("**/api/live/status", (route) => route.abort());
  await page.route("**/api/live/balance", (route) => route.abort());
  await page.route("**/api/live/events*", (route) => route.abort());
  await page.goto("/blue-team/ai-agent");
  await expect(page.locator(".cb-guardian")).toContainText("Unavailable", {
    timeout: 20000,
  });
  await expect(page.locator(".cb-wallet-balances")).toContainText(
    "Balance unavailable",
  );
  await expect(page.locator(".cb-wallet-balances")).not.toContainText(
    "0.00 USDC",
  );
});
