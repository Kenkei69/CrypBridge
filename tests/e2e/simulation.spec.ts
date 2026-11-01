import { test, expect, type Page, type BrowserContext } from "@playwright/test";
// Respect the deployed application's unchanged request budget during rapid UI tests.
test.beforeEach(async ({ request }) => {
  test.setTimeout(95000);
  const r = await request.get("/api/conversations");
  const remaining = Number(r.headers()["x-ratelimit-remaining"] ?? 180);
  if (remaining < 45) {
    let wait =
      Number(r.headers()["x-ratelimit-reset"]) * 1000 - Date.now() + 500;
    while (wait > 0) {
      const chunk = Math.min(wait, 15000);
      await new Promise((resolve) => setTimeout(resolve, chunk));
      wait -= chunk;
    }
  }
});

async function newChat(page: Page) {
  await page.goto("/blue-team/ai-agent");
  await expect(
    page.getByRole("textbox", { name: "Message Guardian", exact: true }),
  ).toBeEnabled();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/conversations") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const c = await (await response).json();
  await expect(page.locator('[data-message-type="AI_MESSAGE"]')).toHaveCount(1);
  return c.id as string;
}
async function send(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Message Guardian", exact: true })
    .fill(text);
  const response = page.waitForResponse(
    (r) =>
      /\/api\/conversations\/[^/]+\/messages$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const r = await response;
  expect(r.status()).toBe(200);
  return r.json();
}
async function pending(page: Page) {
  const cid = await newChat(page);
  let c = await send(page, "Buy a research report for $1.");
  const s = c.simulations[0];
  await expect(
    page.locator('[data-message-type="PURCHASE_CARD"]'),
  ).toContainText("1.00 USDC");
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/purchases/${s.id}/approve`),
  );
  await page
    .getByRole("button", { name: "Approve purchase", exact: true })
    .click();
  c = await (await response).json();
  expect(c.simulations[0].stage).toBe("ATTACK_WINDOW_OPEN");
  await expect(
    page.getByText(/Payment request received. Waiting for security evaluation/),
  ).toBeVisible();
  return { cid, sid: s.id as string };
}
async function builder(context: BrowserContext, sid: string) {
  const page = await context.newPage();
  await page.goto("/red-team");
  const row = page.locator(`[data-simulation-id="${sid}"]`);
  await expect(row).toContainText("Awaiting attack");
  await row.getByRole("button", { name: "Attack this request" }).click();
  await expect(page).toHaveURL(/\/red-team\/attack-builder/);
  await expect(page.getByLabel("Target simulation")).toHaveValue(sid);
  return page;
}
async function launch(page: Page, sid: string) {
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/api/red/simulations/${sid}/attacks`),
  );
  await page
    .getByRole("button", { name: "Launch attack", exact: true })
    .click();
  const r = await response;
  expect(r.status()).toBe(200);
  return r.json();
}
for (const category of ["overpayment", "wrong_recipient"])
  test(`two-tab ${category} reaches chat, blocks before signing, preserves balance and survives reload`, async ({
    page,
    context,
  }) => {
    const { cid, sid } = await pending(page);
    const before = await page
      .getByTestId("wallet-balance")
      .getAttribute("data-balance");
    const attacker = await builder(context, sid);
    if (category === "overpayment") {
      await attacker.getByLabel("Modified payment amount").fill("100000000");
      await attacker.getByRole("button", { name: "Preview changes" }).click();
      await expect(attacker.locator(".payload-comparison")).toContainText(
        "100.00 USDC",
      );
    } else
      await attacker
        .getByRole("button", { name: /Wrong recipient Replace/ })
        .click();
    const s = await launch(attacker, sid);
    expect(s.stage).toBe("BLOCKED");
    expect(s.signings).toHaveLength(0);
    expect(s.transfer).toBeNull();
    await expect(
      page.locator('[data-message-type="SECURITY_ALERT"]'),
    ).toBeVisible();
    const blocked = page.locator('[data-message-type="TRANSACTION_BLOCKED"]');
    await expect(blocked).toContainText(
      category === "overpayment"
        ? "100.00 USDC"
        : "0x1111111111111111111111111111111111111111",
    );
    await expect(
      page.locator('[data-message-type="AI_MESSAGE"]').last(),
    ).toContainText("I blocked this purchase");
    await expect(
      page.locator('[data-message-type="AI_MESSAGE"]').last(),
    ).toContainText("balance remains unchanged");
    await expect(page.getByTestId("wallet-balance")).toHaveAttribute(
      "data-balance",
      before!,
    );
    await expect(attacker.locator(".attack-outcomes").first()).toContainText(
      "Failed",
    );
    const ids = await page
      .locator("[data-message-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-message-id")),
      );
    await page.reload();
    await expect(
      page.locator('[data-message-type="TRANSACTION_BLOCKED"]'),
    ).toBeVisible();
    expect(
      await page
        .locator("[data-message-id]")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-message-id")),
        ),
    ).toEqual(ids);
    await attacker.reload();
    await expect(attacker.locator(".decision-surface")).toContainText(
      "Blocked",
    );
    await attacker.close();
  });
test("legitimate purchase settles exactly once and is delivered inside the conversation", async ({
  page,
}) => {
  const { sid } = await pending(page);
  const before = BigInt(
    (await page.getByTestId("wallet-balance").getAttribute("data-balance"))!,
  );
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/purchases/${sid}/continue`),
  );
  await page.getByRole("button", { name: "Continue without attack" }).click();
  const c = await (await response).json();
  expect(c.simulations[0].stage).toBe("COMPLETED");
  expect(c.simulations[0].transfer.amount).toBe("1000000");
  await expect(
    page.locator('[data-message-type="TRANSACTION_APPROVED"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-message-type="PURCHASE_COMPLETE"]'),
  ).toContainText("Research report: AI payment security");
  await expect(page.getByTestId("wallet-balance")).toHaveAttribute(
    "data-balance",
    (before - 1000000n).toString(),
  );
  await page.reload();
  await expect(
    page.locator('[data-message-type="PURCHASE_COMPLETE"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-message-type="PURCHASE_COMPLETE"]'),
  ).toContainText(c.simulations[0].transfer.id);
});
test("conversational clarification, approval follow-up, cancellation, and balance queries work without an AI key", async ({
  page,
}) => {
  await newChat(page);
  let c = await send(page, "Buy a research report");
  expect(c.simulations).toHaveLength(0);
  await expect(
    page.locator('[data-message-type="AI_MESSAGE"]').last(),
  ).toContainText("explicit budget");
  c = await send(page, "$1");
  expect(c.simulations[0].stage).toBe("AWAITING_APPROVAL");
  c = await send(page, "yes");
  expect(c.simulations[0].stage).toBe("ATTACK_WINDOW_OPEN");
  c = await send(page, "cancel it");
  expect(c.simulations[0].stage).toBe("CANCELLED");
  await expect(page.getByText(/I canceled this purchase/)).toBeVisible();
  await send(page, "What is my balance?");
  await expect(
    page.locator('[data-message-type="AI_MESSAGE"]').last(),
  ).toContainText("mock ledger");
});
for (const category of [
  "prompt_injection",
  "duplicate_payment",
  "contract_approval",
])
  test(`${category} produces actual Guardian monitoring in chat`, async ({
    page,
    context,
  }) => {
    const { sid } = await pending(page);
    const attacker = await builder(context, sid);
    await attacker
      .getByRole("button", {
        name:
          category === "prompt_injection"
            ? /Prompt injection Inject/
            : category === "duplicate_payment"
              ? /Duplicate payment Repeat/
              : /Malicious contract approval Propose/,
      })
      .click();
    const s = await launch(attacker, sid);
    if (category === "contract_approval") {
      expect(s.stage).toBe("BLOCKED");
      await expect(
        page.locator('[data-message-type="TRANSACTION_BLOCKED"]'),
      ).toContainText("unlimited");
    } else {
      expect(s.stage).toBe("COMPLETED");
      expect(s.transfer.amount).toBe("1000000");
      expect(s.signings).toHaveLength(1);
      await expect(
        page.locator('[data-message-type="PURCHASE_COMPLETE"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-message-type="SECURITY_ALERT"]').first(),
      ).toContainText(
        category === "prompt_injection"
          ? "untrusted data"
          : "Duplicate payment detected",
      );
    }
    await attacker.close();
  });
test("completed targets disappear and late attacks are rejected, not re-evaluated", async ({
  page,
  context,
}) => {
  const { sid } = await pending(page);
  await page.getByRole("button", { name: "Continue without attack" }).click();
  await expect(
    page.locator('[data-message-type="PURCHASE_COMPLETE"]'),
  ).toBeVisible();
  const attacker = await context.newPage();
  await attacker.goto("/red-team");
  await expect(attacker.locator(`[data-simulation-id="${sid}"]`)).toHaveCount(
    0,
  );
  const response = await attacker.request.post(
    `/api/red/simulations/${sid}/attacks`,
    { data: { category: "duplicate_payment", repeats: 3 } },
  );
  expect(response.status()).toBe(409);
  expect((await response.json()).error).toContain(
    "completed purchases cannot be attacked",
  );
  await attacker.close();
});
for (const width of [1440, 768, 390])
  test(`chat composer stays visible and workspace layouts fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await newChat(page);
    await send(page, "Buy a research report for $1.");
    const composer = page.locator(".chat-compose-dock");
    await expect(composer).toBeInViewport();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/chat-${width}.png`,
      animations: "disabled",
    });
    await page.goto("/red-team");
    await expect(
      page.getByRole("heading", { name: "Pending authorized simulations" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/red-chat-${width}.png`,
      animations: "disabled",
    });
  });
test("reading older messages preserves scroll position when a new server message arrives", async ({
  page,
}) => {
  const cid = await newChat(page);
  for (let i = 0; i < 3; i++) await send(page, "Buy a research report for $1.");
  const transcript = page.getByRole("log");
  await transcript.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  const before = await transcript.evaluate((el) => el.scrollTop);
  const result = await page.request.post(`/api/conversations/${cid}/messages`, {
    data: { text: "thanks", clientKey: crypto.randomUUID() },
  });
  expect(result.status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "New messages", exact: true }),
  ).toBeVisible();
  expect(await transcript.evaluate((el) => el.scrollTop)).toBe(before);
  await page.getByRole("button", { name: "New messages", exact: true }).click();
  await expect(
    page.locator('[data-message-type="AI_MESSAGE"]').last(),
  ).toBeInViewport();
});

test("typing the next draft while a real request is in flight preserves that draft", async ({
  page,
}) => {
  await newChat(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/conversations/*/messages", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  const input = page.getByRole("textbox", {
    name: "Message Guardian",
    exact: true,
  });
  await input.fill("hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await input.fill("What is my balance?");
  release();
  await expect(
    page.locator('[data-message-type="USER_MESSAGE"]').last(),
  ).toContainText("hello");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue("What is my balance?");
});
