import "dotenv/config";
import { spawn, ChildProcess } from "node:child_process";
import { once } from "node:events";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const port = Number(process.env.RESTART_TEST_PORT || 3005),
  origin = "http://127.0.0.1:" + port;
let child: ChildProcess | undefined;
const cookies = new Map<string, string>();
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CRYPBRIDGE_MODE: "simulation",
      DEMO_MODE: "true",
      NODE_ENV: "development",
    },
    stdio: "ignore",
  });
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null)
      throw new Error("Temporary simulator backend exited before readiness");
    try {
      const r = await fetch(origin + "/api/runtime");
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Temporary simulator readiness timeout");
}
async function stop() {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  child = undefined;
}
async function api(path: string, body?: unknown) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const cookie of r.headers.getSetCookie()) {
    const c = cookie.split(";")[0],
      index = c.indexOf("=");
    cookies.set(c.slice(0, index), c.slice(index + 1));
  }
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      "Restart verification HTTP " + r.status + ": " + (data.error || path),
    );
  return data;
}
try {
  await start();
  await api("/api/session", { workspace: "blue" });
  const p = await api("/api/lab/purchases", {
    productId: "ai-security-report",
    clientKey: randomUUID(),
    prompt: "Restart persistence verification",
  });
  const before = await api("/api/lab/purchases/" + p.id + "/approve", {
    approve: true,
  });
  if (before.state !== "COMPLETED")
    throw new Error("Initial virtual purchase failed");
  const balanceBefore = await api("/api/lab/balance");
  const checkpointBefore = (await api("/api/lab/status")).checkpoint;
  await stop();
  await start();
  const after = await api("/api/lab/purchases/" + p.id),
    balanceAfter = await api("/api/lab/balance");
  if (
    after.state !== "COMPLETED" ||
    after.transactions[0].reference !== before.transactions[0].reference ||
    after.events.at(-1).integrity !== before.events.at(-1).integrity ||
    balanceAfter.usdcAtomic !== balanceBefore.usdcAtomic
  )
    throw new Error(
      "Persisted purchase or audit evidence changed across backend restart",
    );
  const checkpointAfter = (await api("/api/lab/status")).checkpoint;
  if (JSON.stringify(checkpointBefore) !== JSON.stringify(checkpointAfter))
    throw new Error("Indexer checkpoint changed across backend restart");
  const repeated = await api("/api/lab/purchases/" + p.id + "/approve", {
    approve: true,
  });
  if (repeated.transactions.length !== 1 || repeated.signings.length !== 1)
    throw new Error("Restart retry duplicated settlement");
  const proof = {
    checkedAt: new Date().toISOString(),
    simulation: true,
    backendProcessRestarted: true,
    purchaseId: p.id,
    environmentId: p.environmentId,
    state: after.state,
    transactionReference: after.transactions[0].reference,
    signatureCount: after.signings.length,
    transactionCount: after.transactions.length,
    auditTailIntegrity: after.events.at(-1).integrity,
    buyerBalanceAtomic: balanceAfter.usdcAtomic,
    idempotentAfterRestart: true,
    checkpointBefore,
    checkpointAfter,
  };
  await mkdir("artifacts/simulation", { recursive: true });
  await writeFile(
    "artifacts/simulation/restart-verification.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await stop();
}
