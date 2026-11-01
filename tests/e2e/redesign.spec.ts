import { test, expect, type Page } from "@playwright/test";
async function openPage(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1280) <= 760) {
    const toggle = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await toggle.waitFor({ state: "visible" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("Lab search, chips, quick actions, and real assessment", async ({
  page,
}) => {
  await page.goto("/legacy");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await openPage(page, "Red Team Lab");
  await expect(
    page.getByRole("heading", { name: "What would you like to test today?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prompt Injection Planned" }).click();
  await expect(page.getByText("No available scenarios match")).toBeVisible();
  await page.getByRole("button", { name: "Show available scenarios" }).click();
  await page.getByLabel("Search attack scenarios").fill("token");
  await expect(
    page.getByRole("button", { name: /Token substitution Swap/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Wrong party Replace/ }),
  ).toHaveCount(0);
  await page.getByLabel("Search attack scenarios").fill("");
  await page.getByRole("button", { name: "Overpayment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Overpayment", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Target guard")
    .selectOption({ label: "Sentinel · native guard" });
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/attacks/run-batch") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Run assessment", exact: true })
    .click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("status")).toContainText("Assessment complete");
  await expect(page.locator(".activity-result").first()).toContainText(
    "Test passed",
  );
  await page.getByRole("button", { name: /Custom Attack Configure/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Configure a mock payment" }),
  ).toBeVisible();
  await page.getByLabel("Amount (USDC base units)").fill("10000000");
  await page.getByRole("button", { name: "Validate mock payment" }).click();
  await expect(
    page.getByRole("dialog", { name: "Payment decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Blocked", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("pre")).not.toBeVisible();
  await page
    .getByText("Payment requirements, authorization, and rule results")
    .click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "TRANSACTION_LIMIT",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("registration errors remain visible without closing the form", async ({
  page,
}) => {
  await page.goto("/legacy");
  await openPage(page, "Guard testing");
  await page.getByRole("button", { name: "Register guard" }).click();
  await page.getByLabel("Name", { exact: true }).fill("UI test invalid guard");
  await page
    .getByLabel("Approved HTTPS endpoint")
    .fill("https://unapproved-ui-test.example/guard");
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "operator-approved HTTPS origin",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "UI test invalid guard",
  );
});
test("wallet permission changes require confirmation and can be cancelled", async ({
  page,
}) => {
  await page.goto("/legacy");
  await openPage(page, "Wallet security");
  const permission = page.getByRole("switch").first();
  const prior = await permission.getAttribute("aria-checked");
  await permission.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(permission).toHaveAttribute("aria-checked", prior!);
});
test("preserves policy persistence and payment filtering", async ({ page }) => {
  await page.goto("/legacy");
  await openPage(page, "Security policies");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/security/policies") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save policy version" }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await openPage(page, "Payment monitor");
  await page.getByLabel("Filter by payment decision").selectOption("block");
  await expect(page.locator("tbody .status").first()).toHaveText("Blocked");
  await page.getByLabel("Search payments").fill("unfindable-query-123");
  await expect(page.getByText("No matching payments")).toBeVisible();
});
test("all navigation destinations render and placeholders are explicit", async ({
  page,
}) => {
  await page.goto("/legacy");
  for (const [nav, title] of [
    ["Overview", "Overview"],
    ["Wallet security", "Wallet Security"],
    ["Payment monitor", "Payment Monitor"],
    ["Security policies", "Security Policies"],
    ["Red Team Lab", "Red Team Lab"],
    ["Attack simulator", "Attack Simulator"],
    ["Guard testing", "Guard Testing"],
    ["Blockchain tracing", "Blockchain Tracing"],
    ["Scam reports", "Scam Reports"],
    ["Exchange response", "Exchange Response"],
    ["Reports", "Reports"],
    ["API & integrations", "API & Integrations"],
    ["Settings", "Settings"],
  ]) {
    await openPage(page, nav);
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
    await noOverflow(page);
    if (
      ["Blockchain tracing", "Scam reports", "Exchange response"].includes(nav)
    )
      await expect(
        page.getByText("Planned capability · frontend preview"),
      ).toBeVisible();
  }
});
for (const width of [1440, 1024, 768, 390, 320])
  test(`responsive navigation and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/legacy");
    await openPage(page, "Red Team Lab");
    await expect(
      page.getByRole("heading", { name: "What would you like to test today?" }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: `test-results/lab-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    for (const nav of [
      "Overview",
      "Payment monitor",
      "Wallet security",
      "Security policies",
      "Attack simulator",
      "Reports",
      "Scam reports",
    ]) {
      await openPage(page, nav);
      await noOverflow(page);
    }
    if (width > 760) {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(
        page.getByRole("button", { name: "Expand sidebar" }),
      ).toBeVisible();
      await noOverflow(page);
    } else {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page
          .getByRole("complementary")
          .getByRole("button", { name: "Close navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toHaveAttribute("aria-expanded", "false");
    }
  });
test("initial API errors are surfaced with a retry action", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Origin rejected" }),
    }),
  );
  await page.goto("/legacy");
  await expect(page.getByRole("alert")).toContainText("Origin rejected");
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
  await expect(page.getByText("Unable to load the workspace")).toBeVisible();
});
