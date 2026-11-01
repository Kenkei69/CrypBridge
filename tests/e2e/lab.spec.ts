import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  test.setTimeout(180000);
  if (test.info().title.startsWith("development server")) return;
  const requiredBudget = test.info().title.startsWith("complete Red/Blue")
    ? 175
    : 50;
  const r = await request.get("/api/runtime");
  const remaining = Number(r.headers()["x-ratelimit-remaining"] || 180);
  if (remaining < requiredBudget) {
    const delay =
      Number(r.headers()["x-ratelimit-reset"]) * 1000 - Date.now() + 350;
    if (delay > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delay, 61000)),
      );
  }
});
async function buyReport(page: any) {
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Buy me a research report about AI security for 1 USDC.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Select product", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use simulated USDC", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
}
test("complete Red/Blue acceptance: arm 100 USDC, block without signing, normal purchase, replay and isolated vulnerable forensics", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/red-team");
  await expect(
    page.getByRole("heading", { name: "Red Team attack lab", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Attack scenario" }),
  ).toHaveValue("overpayment");
  await page
    .getByRole("textbox", { name: "Attempted USDC amount" })
    .fill("100");
  await page.getByRole("button", { name: "Arm Attack", exact: true }).click();
  await expect(page.locator(".sim-armed-row .cb-status")).toHaveText("ARMED");
  const initial = (await (await page.request.get("/api/lab/balance")).json())
    .usdcAtomic;
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Chat", exact: true })
    .click();
  await buyReport(page);
  await expect(
    page.getByRole("heading", { name: "Payment Blocked", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText(
      "No signature created. No settlement transaction. No funds moved.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.locator(".sim-payment-card").count()).toBe(1);
  const state = await (await page.request.get("/api/lab/state")).json(),
    purchase = await (
      await page.request.get("/api/lab/purchases/" + state.purchases[0].id)
    ).json();
  expect(purchase.authorization.amount).toBe("1000000");
  expect(purchase.attempts[0].modified.requirements.accepts[0].amount).toBe(
    "100000000",
  );
  expect(purchase.signings).toHaveLength(0);
  expect(purchase.transactions).toHaveLength(0);
  expect(
    (await (await page.request.get("/api/lab/balance")).json()).usdcAtomic,
  ).toBe(initial);
  await page.locator(".sim-inspector>summary").click();
  await expect(
    page.getByRole("heading", {
      name: "Authoritative execution timeline",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".sim-timeline")).toContainText(
    "RED TEAM MUTATION APPLIED",
  );
  await expect(page.locator(".sim-timeline")).toContainText("SIGNING DENIED");
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({
    path: "artifacts/simulation/blue-blocked.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Red Team workspace", exact: true })
    .click();
  await page.getByRole("tab", { name: "Armed Attacks", exact: true }).click();
  await expect(page.locator(".sim-armed-row .cb-status")).toHaveText(
    "COMPLETED",
  );
  await page.locator(".sim-armed-row>details>summary").click();
  await expect(page.locator(".sim-payload-diff")).toContainText("100000000");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Chat", exact: true })
    .click();
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await buyReport(page);
  await expect(
    page.getByRole("heading", { name: "Payment Successful", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".sim-reference code")).toHaveText(/^simtx:/);
  await page
    .getByRole("button", { name: "Open purchased resource", exact: false })
    .click();
  await expect(page.locator(".sim-delivery")).toContainText(
    "SIMULATED PURCHASE",
  );
  await expect(page.locator(".cb-wallet-balances strong")).toHaveText(
    "49.00 USDC",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Payment Successful", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({
    path: "artifacts/simulation/blue-success.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Red Team workspace", exact: true })
    .click();
  await page.getByRole("tab", { name: "Attack Builder", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Attempted USDC amount" })
    .fill("100");
  await page
    .getByRole("button", { name: "Run single scenario", exact: false })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Replay deterministically",
      exact: false,
    }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Replay deterministically", exact: false })
    .click();
  await expect(page.locator(".sim-replay-result")).toContainText(
    "produced equivalent semantic results",
    { timeout: 30000 },
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export evidence report", exact: false })
    .click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/simulation/exported-attack-evidence.json");
  await page.getByRole("tab", { name: "Attack Builder", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Attack scenario" })
    .selectOption("wrong-recipient");
  await page
    .getByRole("combobox", { name: "Guardian test target" })
    .selectOption("baseline");
  await page
    .getByRole("textbox", { name: "Simulation seed" })
    .fill("acceptance-vulnerable-baseline");
  await page
    .getByRole("button", { name: "Run single scenario", exact: false })
    .click();
  await expect(page.locator(".sim-run-summary")).toContainText(
    "Yes — within simulator only",
    { timeout: 30000 },
  );
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({
    path: "artifacts/simulation/red-baseline.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Trace virtual funds", exact: false })
    .click();
  await expect(
    page.getByRole("img", { name: "Virtual fund-flow graph", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sim-flow-row")).toHaveCount(4);
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({
    path: "artifacts/simulation/fund-tracing.png",
    fullPage: true,
  });
  const env = new URL(page.url()).searchParams.get("environmentId");
  await page.goto("/platform/scam-reports?environmentId=" + env);
  await page
    .getByRole("button", {
      name: "Request simulated exchange review",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "HOLD APPROVED", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(
      "No real exchange was contacted and no real funds were frozen.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("simulated catalog, receipt rejection, server history and mobile navigation persist without real network calls", async ({
  page,
}) => {
  test.setTimeout(60000);
  let liveRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/live") || r.url().includes("sepolia.base.org"))
      liveRequests++;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/blue-team/ai-agent");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Buy the AI security report for 1 USDC.");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Select product", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use simulated USDC", exact: true })
    .click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment Rejected", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Payment Rejected", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(liveRequests).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Virtual wallet accounts", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await expect(page.locator(".sim-wallet-grid article")).toHaveCount(6);
  await page.screenshot({
    path: "artifacts/simulation/mobile-wallets.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("development server blocks direct, raw-import and @fs access to private files", async ({
  request,
}) => {
  const name = "security-probe-" + randomUUID() + ".env",
    file = resolve(".secrets", name),
    marker = "CRYPBRIDGE_FILE_POLICY_CANARY_NOT_A_SECRET";
  await mkdir(".secrets", { recursive: true, mode: 0o700 });
  await writeFile(file, marker + "=true\n", { mode: 0o600, flag: "wx" });
  try {
    for (const path of [
      "/.secrets/" + name,
      "/.secrets/" + name + "?raw",
      "/.secrets/" + name + "?raw&import",
      "/@fs" + file,
    ]) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(403);
      expect((await r.text()).includes(marker)).toBe(false);
    }
  } finally {
    await unlink(file);
  }
});
