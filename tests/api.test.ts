import { it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server/index";
import { db } from "../server/config";
const client = request.agent(app);
beforeAll(async () => {
  await client.post("/api/session").send({ workspace: "blue" }).expect(200);
});
afterAll(() => db.$disconnect());
it("serves persisted dashboard records", async () => {
  const r = await client.get("/api/state");
  expect(r.status).toBe(200);
  expect(r.body.wallets.length).toBeGreaterThan(0);
});
it("blocks unapproved guard destinations", async () => {
  const r = await client
    .post("/api/guards")
    .send({ name: "Internal", endpoint: "http://127.0.0.1:3001" });
  expect(r.status).toBe(400);
});
it("rejects malformed policy updates", async () => {
  const r = await client
    .post("/api/security/policies")
    .send({ maxPayment: "-1" });
  expect(r.status).toBe(400);
});
it("rejects foreign browser origins", async () => {
  const r = await client
    .post("/api/demo/legitimate")
    .set("Origin", "https://untrusted.example")
    .send({});
  expect(r.status).toBe(403);
});
