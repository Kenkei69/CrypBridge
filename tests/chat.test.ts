import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../server/index";
import { db } from "../server/config";
import { seedSimulation } from "../server/simulation-seed";
import { projectEvent } from "../server/chat/messages";
import { encodeFunctionData, erc20Abi } from "viem";
let server: any;
const blue = request.agent(app),
  red = request.agent(app);
beforeAll(async () => {
  await seedSimulation();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  process.env.MOCK_MERCHANT_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  await blue.post("/api/session").send({ workspace: "blue" });
  await red.post("/api/session").send({ workspace: "red" });
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  delete process.env.MOCK_MERCHANT_ORIGIN;
  await db.$disconnect();
});
async function conversation() {
  return (await blue.post("/api/conversations").send({}).expect(201)).body;
}
async function send(id: string, text: string, key = randomUUID()) {
  return (
    await blue
      .post(`/api/conversations/${id}/messages`)
      .send({ text, clientKey: key })
      .expect(200)
  ).body;
}
async function select(cid: string) {
  let c = await send(cid, "Buy me a research report about AI security.");
  const discovery = c.messages.find((m: any) => m.type === "PRODUCT_RESULTS");
  expect(discovery.data.products.length).toBeGreaterThan(1);
  c = (
    await blue
      .post(`/api/conversations/${cid}/products/research-report/select`)
      .send({ discoveryId: discovery.id, clientKey: randomUUID() })
      .expect(200)
  ).body;
  const methods = c.messages.find((m: any) => m.type === "PAYMENT_METHODS");
  expect(
    methods.data.methods.find((m: any) => m.id === "usdt-bnb").available,
  ).toBe(false);
  c = (
    await blue
      .post(
        `/api/conversations/${cid}/selections/${methods.data.selectionId}/method`,
      )
      .send({ methodId: "usdc-base-sepolia" })
      .expect(200)
  ).body;
  return c;
}
it("discovers real products and requires a supported method before authorization", async () => {
  const c = await select((await conversation()).id);
  expect(c.simulations).toHaveLength(1);
  expect(c.simulations[0].authorization).toBeNull();
  expect(
    c.messages.filter((m: any) => m.type === "APPROVAL_RECEIPT"),
  ).toHaveLength(1);
});
it("persists message idempotency without creating a payment", async () => {
  const c = await conversation(),
    key = randomUUID();
  const a = await send(c.id, "research report", key),
    b = await send(c.id, "research report", key);
  expect(a.messages).toEqual(b.messages);
  expect(b.simulations).toHaveLength(0);
});
it("queues approval once and updates the same receipt on cancellation", async () => {
  const c = await select((await conversation()).id),
    id = c.simulations[0].id;
  await blue
    .post(`/api/conversations/${c.id}/purchases/${id}/cancel`)
    .send({ clientKey: randomUUID() })
    .expect(200);
  const stored = (await blue.get(`/api/conversations/${c.id}`)).body;
  expect(
    stored.messages.filter((m: any) => m.type === "CANCELED_RECEIPT"),
  ).toHaveLength(1);
  expect(stored.simulations[0].signings).toHaveLength(0);
});
it("scopes armed attacks to the test sandbox and consumes a plan once", async () => {
  const c = await select((await conversation()).id),
    sim = c.simulations[0];
  const { createPlan, runAutomatic } = await import(
    "../server/simulation/automatic"
  );
  const { confirm } = await import("../server/simulation/engine");
  const plan = await createPlan(sim.userId, sim.sandboxId, {
    payload: { category: "overpayment", amount: "100000000" },
    targetKind: "next",
  });
  await confirm(sim.id, sim.userId);
  await runAutomatic(sim.id, sim.userId);
  await runAutomatic(sim.id, sim.userId);
  const stored = (await blue.get(`/api/conversations/${c.id}`)).body;
  expect(stored.simulations[0].stage).toBe("BLOCKED");
  expect(stored.simulations[0].signings).toHaveLength(0);
  expect(stored.simulations[0].transfer).toBeNull();
  expect(
    stored.messages.filter((m: any) => m.type === "BLOCKED_RECEIPT"),
  ).toHaveLength(1);
  expect(
    (await db.attackPlan.findUniqueOrThrow({ where: { id: plan.id } })).status,
  ).toBe("COMPLETED");
});

it("does not consume an armed attack from another sandbox", async () => {
  const c = await select((await conversation()).id),
    s = c.simulations[0];
  const { createPlan, runAutomatic } = await import(
    "../server/simulation/automatic"
  );
  const { confirm } = await import("../server/simulation/engine");
  const plan = await createPlan(s.userId, "unrelated-authorized-test-session", {
    payload: { category: "overpayment", amount: "100000000" },
    targetKind: "next",
  });
  await confirm(s.id, s.userId);
  await runAutomatic(s.id, s.userId);
  expect(
    (await db.simulation.findUniqueOrThrow({ where: { id: s.id } })).stage,
  ).toBe("COMPLETED");
  expect(
    (await db.attackPlan.findUniqueOrThrow({ where: { id: plan.id } })).status,
  ).toBe("ARMED");
});

it("consumes one armed attack atomically when payments race", async () => {
  const c1 = await select((await conversation()).id),
    c2 = await select((await conversation()).id);
  const a = c1.simulations[0],
    b = c2.simulations[0];
  const { createPlan, runAutomatic } = await import(
    "../server/simulation/automatic"
  );
  const { confirm } = await import("../server/simulation/engine");
  const plan = await createPlan(a.userId, a.sandboxId, {
    payload: { category: "overpayment", amount: "100000000" },
    targetKind: "next",
  });
  await Promise.all([confirm(a.id, a.userId), confirm(b.id, b.userId)]);
  await Promise.all([
    runAutomatic(a.id, a.userId),
    runAutomatic(b.id, b.userId),
  ]);
  const states = await db.simulation.findMany({
    where: { id: { in: [a.id, b.id] } },
  });
  expect(states.map((s) => s.stage).sort()).toEqual(["BLOCKED", "COMPLETED"]);
  const stored = await db.attackPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: { events: true },
  });
  expect(stored.events.filter((e) => e.status === "TRIGGERED")).toHaveLength(1);
});

it("does not expose automatic payment or conversation records to an unrelated test browser", async () => {
  const c = await select((await conversation()).id),
    s = c.simulations[0];
  const outsider = request.agent(app);
  await outsider.post("/api/session").send({ workspace: "blue" }).expect(200);
  await outsider.get(`/api/conversations/${c.id}`).expect(404);
  await outsider.get(`/api/simulations/${s.id}`).expect(404);
  const state = (await outsider.get("/api/simulations").expect(200)).body;
  expect(state.simulations.some((r: any) => r.id === s.id)).toBe(false);
});
