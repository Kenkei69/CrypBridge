import { Router } from "express";
import { z } from "zod";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { db } from "../config";
import { requireSession, role } from "../security";
import { AppError } from "../errors";
import { callGuard } from "../outbound";
import {
  Scope,
  ENGINE,
  RULES,
  ASSET,
  NETWORK,
  EPOCH,
  initialDefaults,
  environment,
  createEnvironment,
  seedCatalog,
  owned,
  amount,
  locked,
  emit,
  digest,
  json,
  positive,
  atomic,
  addr,
  seedSchema,
  walletId,
} from "./core";
import { categories, scenarioLibrary, validateConfig } from "./scenarios";
import {
  createPurchase,
  approveAndExecute,
  inspectPurchase,
  cancel,
  reconcile,
  quote,
  processPurchase,
} from "./engine";
import { createAttack } from "./engine";
import {
  aggregateMetrics,
  exportEnvironment,
  runScenario,
  replay,
  controlledMove,
  exchangeCase,
} from "./runner";
import { snapshot, restore } from "./snapshots";
import {
  createConversation,
  conversation,
  search,
  selectProduct,
  chooseMethod,
} from "./chat";
import { index, mine } from "./chain";
import { verifyPayload } from "./signer";
import { evaluateRules } from "./guardian";
export const labRouter = Router();
let seeded: Promise<void> | undefined;
labRouter.use(requireSession);
labRouter.use(async (_req, res, next) => {
  try {
    if (!res.locals.session.sandboxId)
      throw new AppError(
        401,
        "SIMULATION_SESSION_REQUIRED",
        "Open a team workspace to create an isolated simulation session",
      );
    if (!seeded)
      seeded = seedCatalog().catch((e) => {
        seeded = undefined;
        throw e;
      });
    await seeded;
    res.locals.scope = {
      userId: res.locals.session.userId,
      sandboxId: res.locals.session.sandboxId,
    };
    res.locals.environment = await environment(res.locals.scope);
    next();
  } catch (e) {
    next(e);
  }
});
const scope = (res: any): Scope => res.locals.scope;
const envId = (req: any, res: any) =>
  req.query.environmentId
    ? z.string().uuid().parse(req.query.environmentId)
    : res.locals.environment.id;
async function status(res: any) {
  const e = await owned(res.locals.environment.id, scope(res)),
    product = await db.labProduct.findUniqueOrThrow({
      where: { id: "ai-security-report" },
    }),
    buyer = await db.labWallet.findUniqueOrThrow({
      where: { environmentId_role: { environmentId: e.id, role: "buyer" } },
    }),
    merchant = await db.labWallet.findUniqueOrThrow({
      where: { environmentId_role: { environmentId: e.id, role: "merchant" } },
    });
  const q = quote(product, merchant.address);
  const trusted = { merchantId: product.merchantId };
  const authorization = {
    ...trusted,
    status: "ACTIVE",
    createdAt: e.clock,
    expiresAt: e.clock + 300000,
    amount: product.amount,
    recipient: merchant.address,
    asset: ASSET,
    network: NETWORK,
    scheme: "exact",
    resource: (q.requirements as any).resource.url,
    productId: product.id,
  };
  const c: any = {
    authorization,
    trusted,
    input: {
      merchantId: product.merchantId,
      productId: product.id,
      requirements: q.requirements,
    },
    clock: e.clock,
    settled: false,
    nonceUsed: false,
    taskSpent: 0n,
    dailySpent: 0n,
    taskBudget: product.amount,
    dailyLimit: "10000000",
  };
  const bad = structuredClone(c);
  bad.input.requirements.accepts[0].amount = "100000000";
  const enabled =
    evaluateRules(c).decision === "ALLOW" &&
    evaluateRules(bad).decision === "BLOCK";
  return {
    mode: "simulation",
    label: "Base Sepolia · SIMULATED",
    simulation: true,
    publicNetworkSubmission: false,
    engineVersion: ENGINE,
    ruleVersion: RULES,
    environmentId: e.id,
    seed: e.seed,
    virtualClock: e.clock,
    guardian: { enabled, status: enabled ? "operational" : "degraded" },
    rpc: {
      mode: "virtual",
      chainId: 84532,
      network: NETWORK,
      token: ASSET,
      decimals: 6,
      block: String(e.head),
    },
    facilitator: {
      mode: "simulator",
      signatureVerification: "EIP-712 test-only ECDSA",
      realSubmissionEnabled: false,
    },
    wallets: {
      buyer: buyer.address,
      merchant: merchant.address,
      attacker: (
        await db.labWallet.findUniqueOrThrow({
          where: {
            environmentId_role: { environmentId: e.id, role: "attacker" },
          },
        })
      ).address,
    },
    checkpoint: await db.labCheckpoint.findUnique({
      where: { environmentId: e.id },
    }),
  };
}
labRouter.get("/status", async (_req, res) => res.json(await status(res)));
labRouter.get("/balance", async (_req, res) =>
  res.json(
    await locked(res.locals.environment.id, async (tx) => {
      const e = res.locals.environment,
        w = await tx.labWallet.findUniqueOrThrow({
          where: { environmentId_role: { environmentId: e.id, role: "buyer" } },
        });
      return {
        simulation: true,
        address: w.address,
        usdcAtomic: (await amount(tx, e.id, "buyer")).toString(),
        ethWei: (await amount(tx, e.id, "buyer", "ETH")).toString(),
        decimals: 6,
      };
    }),
  ),
);
labRouter.get("/state", async (req, res) => {
  const id = envId(req, res);
  const e = await owned(id, scope(res));
  res.json({
    simulation: true,
    environment: e,
    catalog: await db.labProduct.findMany({ orderBy: { id: "asc" } }),
    scenarios: scenarioLibrary,
    attacks: await db.labAttack.findMany({
      where: { environmentId: id },
      orderBy: { createdAt: "desc" },
    }),
    purchases: await db.labPurchase.findMany({
      where: { environmentId: id },
      orderBy: { ordinal: "desc" },
      take: 100,
    }),
    runs: await db.labRun.findMany({
      where: scope(res),
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    metrics: await aggregateMetrics(scope(res)),
    snapshots: await db.labSnapshot.findMany({
      where: { environmentId: id },
      select: {
        id: true,
        label: true,
        digest: true,
        version: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    externalGuards: (
      await db.guard.findMany({
        select: { id: true, name: true, endpoint: true, adapterVersion: true },
      })
    ).map((g) => ({
      ...g,
      organizerAllowed: (process.env.GUARD_ALLOWED_ORIGINS || "")
        .split(",")
        .includes(new URL(g.endpoint).origin),
    })),
    conversations: await db.labConversation.findMany({
      where: { environmentId: id },
      orderBy: { createdAt: "desc" },
    }),
  });
});
labRouter.get("/history", async (_req, res) => {
  const id = res.locals.environment.id;
  const purchases = await db.labPurchase.findMany({
    where: { environmentId: id },
    orderBy: { ordinal: "desc" },
    take: 100,
  });
  const transactions = await db.labTransaction.findMany({
    where: { environmentId: id },
  });
  const decisions = await db.labDecision.findMany({
    where: { environmentId: id },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    simulation: true,
    intents: purchases.map((p) => ({
      ...p,
      buyer: (p.trusted as any).buyer,
      payTo: (p.trusted as any).recipient,
      resource: (p.trusted as any).resource,
      createdAt: new Date(EPOCH + p.createdAt).toISOString(),
      updatedAt: new Date(EPOCH + p.updatedAt).toISOString(),
      txHash: transactions.find((t) => t.id === p.transactionId)?.reference,
    })),
    decisions: decisions.map((d) => ({
      ...d,
      intentId: d.purchaseId,
      allowed: d.decision === "ALLOW",
      rules: [],
      createdAt: new Date(EPOCH + d.createdAt).toISOString(),
    })),
    transfers: [],
  });
});
const notificationTypes = [
  "PAYMENT_SUCCESSFUL",
  "PAYMENT_BLOCKED",
  "PAYMENT_FAILED",
  "ATTACK_ARMED",
  "ATTACK_COMPLETED",
  "INCIDENT_RECORDED",
  "INDEXER_SIMULATED_FAILURE",
  "SIMULATED_EXCHANGE_HOLD_APPROVED",
];
const notification = (e: any) => ({
  sequence: e.sequence,
  environmentId: e.environmentId,
  type: e.type,
  data: e.metadata,
  createdAt: new Date(EPOCH + e.timestamp).toISOString(),
  simulation: true,
});
labRouter.get("/notifications", async (_req, res) =>
  res.json(
    (
      await db.labEvent.findMany({
        where: {
          environmentId: res.locals.environment.id,
          type: { in: notificationTypes },
        },
        orderBy: { sequence: "desc" },
        take: 50,
      })
    ).map(notification),
  ),
);
labRouter.get("/events", async (req, res) => {
  const id = res.locals.environment.id;
  const last = String(req.header("Last-Event-ID") || req.query.after || "");
  let cursor = last.startsWith(id + "/") ? Number(last.split("/")[1]) || 0 : 0;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  let busy = false,
    closed = false;
  const send = async () => {
    if (busy || closed) return;
    busy = true;
    try {
      if (res.locals.session.expiresAt.getTime() <= Date.now()) {
        res.end();
        return;
      }
      const workspace = await db.labWorkspace.findUnique({
        where: { userId_sandboxId: scope(res) },
      });
      if (workspace?.environmentId !== id) {
        res.write(`event: reset\ndata: {"simulation":true}\n\n`);
        res.end();
        return;
      }
      const rows = await db.labEvent.findMany({
        where: { environmentId: id, sequence: { gt: cursor } },
        orderBy: { sequence: "asc" },
        take: 250,
      });
      for (const e of rows) {
        cursor = e.sequence;
        if (notificationTypes.includes(e.type))
          res.write(
            `id: ${id}/${e.sequence}\ndata: ${JSON.stringify(notification(e))}\n\n`,
          );
      }
      res.write(": virtual event heartbeat\n\n");
    } catch {
      res.end();
    } finally {
      busy = false;
    }
  };
  void send();
  const timer = setInterval(() => void send(), 1000);
  req.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
});
labRouter.post("/conversations", role("blue"), async (req, res) => {
  const b = z
    .object({ clientKey: z.string().min(1).max(150) })
    .strict()
    .parse(req.body);
  res.json(
    await createConversation(
      scope(res),
      res.locals.environment.id,
      b.clientKey,
    ),
  );
});
labRouter.get("/conversations/:id", async (req, res) =>
  res.json(await conversation(scope(res), String(req.params.id))),
);
labRouter.post(
  "/conversations/:id/messages",
  role("blue"),
  async (req, res) => {
    const b = z
      .object({
        clientKey: z.string().min(1).max(150),
        text: z.string().min(1).max(1000),
      })
      .strict()
      .parse(req.body);
    await search(scope(res), String(req.params.id), b.clientKey, b.text);
    res.json(await conversation(scope(res), String(req.params.id)));
  },
);
labRouter.post("/conversations/:id/select", role("blue"), async (req, res) => {
  const b = z
    .object({
      clientKey: z.string().min(1).max(150),
      messageId: z.string(),
      productId: z.string(),
    })
    .strict()
    .parse(req.body);
  await selectProduct(
    scope(res),
    String(req.params.id),
    b.messageId,
    b.productId,
    b.clientKey,
  );
  res.json(await conversation(scope(res), String(req.params.id)));
});
labRouter.post("/conversations/:id/method", role("blue"), async (req, res) => {
  const b = z
    .object({
      clientKey: z.string().min(1).max(150),
      messageId: z.string(),
      method: z.literal("base-sepolia-usdc"),
    })
    .strict()
    .parse(req.body);
  await chooseMethod(
    scope(res),
    String(req.params.id),
    b.messageId,
    b.clientKey,
  );
  res.json(await conversation(scope(res), String(req.params.id)));
});
labRouter.post("/purchases", role("blue"), async (req, res) => {
  const b = z
    .object({
      productId: z.string(),
      clientKey: z.string().min(1).max(150),
      prompt: z.string().max(1000),
      budget: positive.optional(),
    })
    .strict()
    .parse(req.body);
  const p = await createPurchase(
    scope(res),
    res.locals.environment.id,
    b.productId,
    b.clientKey,
    b.prompt,
    { budget: b.budget },
  );
  res.json(await inspectPurchase(scope(res), p.id));
});
labRouter.get("/purchases/:id", async (req, res) =>
  res.json(await inspectPurchase(scope(res), String(req.params.id))),
);
labRouter.post("/purchases/:id/approve", role("blue"), async (req, res) => {
  z.object({ approve: z.literal(true) })
    .strict()
    .parse(req.body);
  res.json(await approveAndExecute(scope(res), String(req.params.id)));
});
labRouter.post("/purchases/:id/reject", role("blue"), async (req, res) =>
  res.json(await cancel(scope(res), String(req.params.id))),
);
labRouter.post("/purchases/:id/reconcile", role("blue"), async (req, res) =>
  res.json(await reconcile(scope(res), String(req.params.id))),
);
labRouter.get("/purchases/:id/resource", async (req, res) => {
  const p = await inspectPurchase(scope(res), String(req.params.id));
  if (
    p.state !== "COMPLETED" ||
    !p.transactions.some((t) => t.status === "SUCCESS")
  )
    throw new AppError(
      402,
      "SIMULATED_PAYMENT_REQUIRED",
      "A successful virtual settlement is required before delivery",
    );
  res.type("text/plain").send((p.trusted as any).productContent);
});
labRouter.get("/merchant/:productId", async (req, res) => {
  const p = await db.labProduct.findUniqueOrThrow({
    where: { id: String(req.params.productId) },
  });
  const merchant = await db.labWallet.findUniqueOrThrow({
    where: {
      environmentId_role: {
        environmentId: res.locals.environment.id,
        role: "merchant",
      },
    },
  });
  const q = quote(p, merchant.address);
  const header = req.header("PAYMENT-SIGNATURE");
  if (!header) {
    res
      .set(q.headers)
      .status(402)
      .json({ simulation: true, ...q.requirements });
    return;
  }
  const payload = decodePaymentSignatureHeader(header);
  const signing = await db.labSigning.findFirst({
    where: {
      environmentId: res.locals.environment.id,
      nonce: (payload.payload as any)?.authorization?.nonce,
    },
  });
  if (!signing || digest(signing.payload) !== digest(payload))
    throw new AppError(
      403,
      "UNKNOWN_SIMULATED_SIGNATURE",
      "Merchant only accepts a persisted test-only signing authorization",
    );
  let purchase = await inspectPurchase(scope(res), signing.purchaseId);
  if (purchase.state === "PENDING")
    purchase = await reconcile(scope(res), purchase.id);
  if (purchase.productId !== p.id || purchase.state !== "COMPLETED")
    throw new AppError(
      402,
      "SETTLEMENT_REQUIRED",
      "Valid signature alone does not prove settlement",
    );
  const settled = purchase.settlements.find((s) => s.state === "SETTLED");
  if (settled)
    res.set(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader(settled.response as any),
    );
  res.type("text/plain").send((purchase.trusted as any).productContent);
});
labRouter.post("/facilitator/verify", role("blue"), async (req, res) => {
  const b = z
    .object({ purchaseId: z.string(), paymentSignature: z.string().max(20000) })
    .strict()
    .parse(req.body);
  const p = await inspectPurchase(scope(res), b.purchaseId);
  const payload = decodePaymentSignatureHeader(b.paymentSignature);
  let verification = await verifyPayload(
    payload,
    (p.trusted as any).buyer,
    (await owned(p.environmentId, scope(res))).clock,
  );
  if (!p.signings.some((s) => digest(s.payload) === digest(payload)))
    verification = {
      isValid: false,
      reason: "UNKNOWN_SIMULATED_SIGNING_AUTHORIZATION",
    };
  if (
    await db.labNonce.findFirst({
      where: {
        environmentId: p.environmentId,
        authorizer: (p.trusted as any).buyer,
        nonce: (payload.payload as any)?.authorization?.nonce,
      },
    })
  )
    verification = {
      isValid: false,
      reason: "AUTHORIZATION_NONCE_ALREADY_USED",
    };
  res.json({ simulation: true, ...verification });
});
labRouter.post("/attacks", role("red"), async (req, res) => {
  const b = z
    .object({
      category: z.enum(categories),
      config: z.unknown().default({}),
      targetKind: z
        .enum(["next", "purchase", "merchant", "resource", "signing"])
        .default("next"),
      targetId: z.string().max(150).optional(),
      arm: z.boolean().default(true),
    })
    .strict()
    .parse(req.body);
  if (b.targetKind !== "next" && !b.targetId)
    throw new AppError(400, "TARGET_REQUIRED", "Choose the scoped target");
  res.json(
    await createAttack(
      scope(res),
      res.locals.environment.id,
      b.category,
      b.config,
      b.targetKind,
      b.targetId,
      b.arm,
    ),
  );
});
labRouter.post("/attacks/:id/:action", role("red"), async (req, res) => {
  const action = z.enum(["arm", "cancel"]).parse(req.params.action);
  const a = await db.labAttack.findUniqueOrThrow({
    where: { id: String(req.params.id) },
  });
  await locked(a.environmentId, async (tx) => {
    const e = await owned(a.environmentId, scope(res), tx);
    const current = await tx.labAttack.findUniqueOrThrow({
      where: { id: a.id },
    });
    if (
      !["DRAFT", "ARMED"].includes(current.status) ||
      current.expiresAt <= e.clock
    )
      throw new AppError(
        409,
        "ATTACK_ALREADY_CONSUMED",
        "Only an unconsumed, unexpired draft or armed attack can change state",
      );
    if (action === "arm" && current.status !== "DRAFT")
      throw new AppError(409, "ALREADY_ARMED", "Attack is already armed");
    await tx.labAttack.update({
      where: { id: a.id },
      data: { status: action === "arm" ? "ARMED" : "CANCELED" },
    });
    await emit(
      tx,
      e.id,
      action === "arm" ? "ATTACK_ARMED" : "ATTACK_CANCELED",
      "red-team",
      { category: a.category },
      undefined,
      a.id,
    );
  });
  res.json(await db.labAttack.findUniqueOrThrow({ where: { id: a.id } }));
});
labRouter.post("/runs", role("red"), async (req, res) => {
  const b = z
    .object({
      category: z.enum(["normal", ...categories]),
      seed: seedSchema,
      config: z.unknown().default({}),
      target: z.enum(["guardian", "baseline"]).default("guardian"),
    })
    .strict()
    .parse(req.body);
  res.json(
    await runScenario(scope(res), b.category, b.seed, b.config, b.target),
  );
});
labRouter.post("/suite", role("red"), async (req, res) => {
  const b = z
    .object({
      seed: seedSchema,
      categories: z
        .array(z.enum(["normal", ...categories]))
        .min(1)
        .max(22)
        .optional(),
    })
    .strict()
    .parse(req.body);
  const results = [];
  for (const category of b.categories || ["normal", ...categories.slice(0, 10)])
    results.push(
      await runScenario(scope(res), category, b.seed + ":" + category),
    );
  res.json({
    simulation: true,
    runs: results,
    metrics: await aggregateMetrics(scope(res)),
  });
});
labRouter.post("/runs/:id/replay", role("red"), async (req, res) =>
  res.json(await replay(scope(res), String(req.params.id))),
);
labRouter.get("/runs/:id/export", async (req, res) => {
  const run = await db.labRun.findFirstOrThrow({
    where: { id: String(req.params.id), ...scope(res) },
  });
  res.attachment("crypbridge-SIMULATED-evidence-" + run.id + ".json").json({
    simulation: true,
    run,
    records: await exportEnvironment(scope(res), run.environmentId),
  });
});
labRouter.get("/environments/:id", async (req, res) =>
  res.json(await exportEnvironment(scope(res), String(req.params.id))),
);
labRouter.post("/environments/:id/mine", role("blue"), async (req, res) => {
  const b = z
    .object({ blocks: z.number().int().min(1).max(20) })
    .strict()
    .parse(req.body);
  const id = String(req.params.id);
  await locked(id, async (tx) => {
    await owned(id, scope(res), tx);
    for (let n = 0; n < b.blocks; n++) await mine(tx, id);
    await index(tx, id);
  });
  res.json(await exportEnvironment(scope(res), id));
});
labRouter.post("/environments/:id/index", role("blue"), async (req, res) => {
  const id = String(req.params.id);
  await locked(id, async (tx) => {
    await owned(id, scope(res), tx);
    await index(tx, id);
    await emit(tx, id, "VIRTUAL_INDEXER_RECONCILED", "indexer", {
      idempotent: true,
    });
  });
  res.json(await exportEnvironment(scope(res), id));
});
labRouter.post("/environments/:id/move", role("red"), async (req, res) => {
  const b = z
    .object({
      fromRole: z.enum(["attacker", "relay", "custodian"]),
      toRole: z.enum(["attacker", "relay", "custodian"]),
      amount: positive,
    })
    .strict()
    .parse(req.body);
  res.json(
    await controlledMove(
      scope(res),
      String(req.params.id),
      b.fromRole,
      b.toRole,
      b.amount,
    ),
  );
});
labRouter.post("/exchange", role("blue"), async (req, res) => {
  const b = z
    .object({
      environmentId: z.string().uuid(),
      incidentId: z.string(),
      destination: addr,
      supportingDocumentation: z.boolean().default(true),
    })
    .strict()
    .parse(req.body);
  res.json(
    await exchangeCase(
      scope(res),
      b.environmentId,
      b.incidentId,
      b.destination,
      b.supportingDocumentation,
    ),
  );
});
labRouter.post("/snapshots", async (req, res) => {
  const b = z
    .object({
      environmentId: z.string().uuid().optional(),
      label: z.string().min(1).max(100),
    })
    .strict()
    .parse(req.body);
  res.json(
    await snapshot(
      scope(res),
      b.environmentId || res.locals.environment.id,
      b.label,
    ),
  );
});
labRouter.post("/snapshots/:id/restore", async (req, res) => {
  const activate = res.locals.session.workspace === "blue";
  res.json(await restore(scope(res), String(req.params.id), activate));
});
labRouter.post("/reset", role("blue"), async (req, res) => {
  const b = z.object({ seed: seedSchema }).strict().parse(req.body);
  const e = await createEnvironment(scope(res), b.seed);
  await db.labWorkspace.update({
    where: { userId_sandboxId: scope(res) },
    data: { environmentId: e.id },
  });
  res.json({
    simulation: true,
    environment: e,
    previousEnvironmentRetained: true,
  });
});
labRouter.post("/external-guard", role("red"), async (req, res) => {
  const b = z
    .object({
      runId: z.string(),
      guardId: z.string(),
      organizerAuthorization: z.literal(true),
    })
    .strict()
    .parse(req.body);
  const guard = await db.guard.findUniqueOrThrow({ where: { id: b.guardId } });
  if (
    !(process.env.GUARD_ALLOWED_ORIGINS || "")
      .split(",")
      .includes(new URL(guard.endpoint).origin)
  )
    throw new AppError(
      403,
      "ORGANIZER_ALLOWLIST_REQUIRED",
      "Only organizer-approved guard origins may receive tests",
    );
  const run = await db.labRun.findFirstOrThrow({
    where: { id: b.runId, ...scope(res) },
  });
  const record = await exportEnvironment(scope(res), run.environmentId);
  const response = z
    .object({
      decision: z.enum(["ALLOW", "BLOCK", "REVIEW"]),
      rules: z.array(z.unknown()),
    })
    .parse(
      await callGuard(
        guard.endpoint,
        {
          protocol: "crypbridge-lab-guard/1",
          simulation: true,
          engineVersion: ENGINE,
          ruleVersion: RULES,
          authorization: record.authorizations[0],
          input: record.attempts[0]?.modified,
        },
        guard.authenticationReference || undefined,
      ),
    );
  await locked(run.environmentId, (tx) =>
    emit(
      tx,
      run.environmentId,
      "AUTHORIZED_EXTERNAL_GUARD_RESPONSE",
      "external-adapter",
      { guardId: guard.id, response },
      undefined,
      run.id,
    ),
  );
  res.json({
    simulation: true,
    externalOnly: true,
    response,
    localPolicyOverridden: false,
  });
});
labRouter.get("/verify", async (req, res) => {
  const id = envId(req, res);
  await owned(id, scope(res));
  const q = z.string().min(1).max(160).parse(req.query.query);
  if (q.startsWith("simtx:")) {
    const transaction = await db.labTransaction.findFirstOrThrow({
      where: { environmentId: id, reference: q },
    });
    res.json({
      simulation: true,
      transaction,
      receipt: await db.labExecution.findUnique({
        where: { transactionId: transaction.id },
      }),
      logs: await db.labLog.findMany({
        where: { transactionId: transaction.id },
      }),
    });
    return;
  }
  addr.parse(q);
  const wallet = await db.labWallet.findFirstOrThrow({
    where: { environmentId: id, address: { equals: q, mode: "insensitive" } },
  });
  res.json(
    await locked(id, async (tx) => ({
      simulation: true,
      wallet,
      usdcAtomic: (await amount(tx, id, wallet.role)).toString(),
      ethWei: (await amount(tx, id, wallet.role, "ETH")).toString(),
    })),
  );
});

labRouter.post("/facilitator/settle", role("blue"), async (req, res) => {
  const b = z
    .object({ purchaseId: z.string(), paymentSignature: z.string().max(20000) })
    .strict()
    .parse(req.body);
  let p = await inspectPurchase(scope(res), b.purchaseId);
  const payload = decodePaymentSignatureHeader(b.paymentSignature);
  if (!p.signings.some((s) => digest(s.payload) === digest(payload)))
    throw new AppError(
      403,
      "UNTRUSTED_SIGNING_AUTHORIZATION",
      "Only the existing server-authorized simulation signature can settle",
    );
  if (p.state === "PENDING") p = await reconcile(scope(res), p.id);
  const record = p.settlements.find((s) => s.state === "SETTLED");
  if (!record)
    throw new AppError(
      409,
      "NO_VERIFIED_SETTLEMENT",
      "No successful settlement exists; signature alone is insufficient",
    );
  res
    .set(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader(record.response as any),
    )
    .json({ simulation: true, ...(record.response as any) });
});

labRouter.get("/facilitator/supported", async (_req, res) =>
  res.json({
    simulation: true,
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: NETWORK,
        extra: { assetTransferMethod: "eip3009", assets: [ASSET] },
      },
    ],
    extensions: [],
    signers: {
      [NETWORK]: [
        (
          await db.labWallet.findUniqueOrThrow({
            where: {
              environmentId_role: {
                environmentId: res.locals.environment.id,
                role: "facilitator",
              },
            },
          })
        ).address,
      ],
    },
    settlementModel: "IN_PROCESS_VIRTUAL_LEDGER; NO PUBLIC SUBMISSION",
  }),
);
