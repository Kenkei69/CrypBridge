import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../config";
import { AppError } from "../errors";
export const ENGINE = "crypbridge-sim/3.1.0",
  RULES = "guardian/3.1.0";
export const NETWORK = "eip155:84532" as const,
  CHAIN = 84532,
  ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const EPOCH = 1767225600000;
export type Tx = Prisma.TransactionClient;
export type Scope = { userId: string; sandboxId: string };
export function canonical(v: any): string {
  if (typeof v === "bigint") return JSON.stringify(v.toString());
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
      .join(",") +
    "}"
  );
}
export const digest = (v: any) =>
  createHash("sha256").update(canonical(v)).digest("hex");
export const json = (v: any) =>
  JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)),
  );
export const atomic = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) < 2n ** 256n, "uint256 overflow");
export const positive = atomic.refine(
  (v) => BigInt(v) > 0n,
  "Amount must be positive",
);
export const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const seedSchema = z.string().min(1).max(120);
export const initialDefaults = {
  buyerUsdc: "50000000",
  buyerEth: "1000000000000000000",
  facilitatorEth: "1000000000000000000",
  taskBudget: "1000000",
  dailyLimit: "10000000",
};
export function testAccount(seed: string, role: string) {
  return privateKeyToAccount(
    ("0x" +
      digest({
        warning: "SIMULATION-ONLY PUBLICLY DERIVABLE TEST KEY; NEVER FUND",
        seed,
        role,
      })) as `0x${string}`,
  );
}
export const walletId = (env: string, role: string) => env + ":" + role;
export async function locked<T>(
  environmentId: string,
  fn: (tx: Tx) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext(${environmentId}))`;
      return fn(tx);
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
export async function owned(
  environmentId: string,
  scope: Scope,
  tx: Tx | typeof db = db,
) {
  const e = await tx.labEnvironment.findFirst({
    where: {
      id: environmentId,
      userId: scope.userId,
      sandboxId: scope.sandboxId,
    },
  });
  if (!e)
    throw new AppError(
      404,
      "LAB_NOT_FOUND",
      "Simulation not found in this test session",
    );
  return e;
}
export async function emit(
  tx: Tx,
  environmentId: string,
  type: string,
  actor: string,
  metadata: any = {},
  purchaseId?: string,
  relatedId?: string,
  advance = 10,
) {
  const env = await tx.labEnvironment.findUniqueOrThrow({
    where: { id: environmentId },
  });
  const sequence = env.eventSequence + 1,
    timestamp = env.clock + advance;
  const content = {
    sequence,
    timestamp,
    type,
    actor,
    purchaseOrdinal: purchaseId
      ? (await tx.labPurchase.findUnique({ where: { id: purchaseId } }))
          ?.ordinal
      : null,
    metadata,
  };
  const integrity = digest({ previousHash: env.eventHash, ...content });
  const event = await tx.labEvent.create({
    data: {
      environmentId,
      purchaseId,
      actor,
      type,
      relatedId,
      timestamp,
      sequence,
      metadata: json(metadata),
      previousHash: env.eventHash,
      integrity,
    },
  });
  await tx.labEnvironment.update({
    where: { id: environmentId },
    data: { clock: timestamp, eventSequence: sequence, eventHash: integrity },
  });
  return event;
}
export async function amount(
  tx: Tx,
  environmentId: string,
  role: string,
  asset = "USDC",
) {
  const sum = await tx.labLedger.aggregate({
    where: { environmentId, walletId: walletId(environmentId, role), asset },
    _sum: { delta: true },
  });
  return BigInt(sum._sum.delta?.toFixed(0) || "0");
}
export async function journal(
  tx: Tx,
  environmentId: string,
  role: string,
  asset: string,
  delta: bigint,
  kind: string,
  transactionId?: string,
) {
  const wallet = walletId(environmentId, role);
  const current = await amount(tx, environmentId, role, asset);
  if (current + delta < 0n)
    throw new AppError(
      409,
      "INSUFFICIENT_VIRTUAL_BALANCE",
      "Virtual ledger cannot become negative",
    );
  const sequence = (await tx.labLedger.count({ where: { environmentId } })) + 1;
  await tx.labLedger.create({
    data: {
      id: environmentId + ":ledger:" + sequence,
      environmentId,
      transactionId,
      walletId: wallet,
      asset,
      delta: delta.toString(),
      kind,
      sequence,
    },
  });
  await tx.labBalance.upsert({
    where: { walletId_asset: { walletId: wallet, asset } },
    create: {
      id: wallet + ":" + asset,
      environmentId,
      walletId: wallet,
      asset,
      amount: (current + delta).toString(),
    },
    update: { amount: (current + delta).toString() },
  });
}
export async function createEnvironment(
  scope: Scope,
  seed = "crypbridge-demo",
  kind = "NORMAL",
  initial = initialDefaults,
  transaction?: Tx,
) {
  const create = async (tx: Tx) => {
    const e = await tx.labEnvironment.create({
      data: {
        ...scope,
        seed,
        kind,
        engineVersion: ENGINE,
        ruleVersion: RULES,
        initial,
      },
    });
    for (const role of [
      "buyer",
      "merchant",
      "attacker",
      "facilitator",
      "relay",
      "custodian",
    ]) {
      await tx.labWallet.create({
        data: {
          id: walletId(e.id, role),
          environmentId: e.id,
          role,
          address: testAccount(seed, role).address,
        },
      });
      await journal(
        tx,
        e.id,
        role,
        "USDC",
        role === "buyer" ? BigInt(initial.buyerUsdc) : 0n,
        "GENESIS_ALLOCATION",
      );
      await journal(
        tx,
        e.id,
        role,
        "ETH",
        role === "buyer"
          ? BigInt(initial.buyerEth)
          : role === "facilitator"
            ? BigInt(initial.facilitatorEth)
            : 0n,
        "GENESIS_ALLOCATION",
      );
    }
    await emit(tx, e.id, "ENVIRONMENT_CREATED", "engine", {
      engineVersion: ENGINE,
      ruleVersion: RULES,
      seed,
      kind,
      initial,
      signatureKind: "test-only EIP-712 ECDSA",
      publicNetworkSubmission: false,
    });
    return e;
  };
  return transaction ? create(transaction) : db.$transaction(create);
}
export async function environment(scope: Scope) {
  const key = scope.userId + ":" + scope.sandboxId;
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext(${key}))`;
      const found = await tx.labWorkspace.findUnique({ where: { id: key } });
      if (found) {
        const current = await owned(found.environmentId, scope, tx);
        if (current.engineVersion === ENGINE && current.ruleVersion === RULES)
          return current;
        const replacement = await createEnvironment(
          scope,
          current.seed,
          "NORMAL",
          initialDefaults,
          tx,
        );
        await tx.labWorkspace.update({
          where: { id: key },
          data: { environmentId: replacement.id },
        });
        await emit(
          tx,
          replacement.id,
          "ENGINE_VERSION_WORKSPACE_CREATED",
          "engine",
          {
            previousEnvironment: current.id,
            previousVersion: current.engineVersion,
            previousEvidencePreserved: true,
          },
        );
        return replacement;
      }
      const e = await createEnvironment(
        scope,
        "crypbridge-demo",
        "NORMAL",
        initialDefaults,
        tx,
      );
      await tx.labWorkspace.create({
        data: { id: key, ...scope, environmentId: e.id },
      });
      return e;
    },
    { timeout: 30000 },
  );
}
export async function seedCatalog() {
  const rows = [
    {
      id: "ai-security-report",
      merchantId: "atlas-research",
      merchantName: "Atlas Research",
      merchantRole: "merchant",
      name: "AI Security Research Report",
      description:
        "A practical research report on AI agents, prompt injection, and payment security.",
      amount: "1000000",
      content:
        "SIMULATED PURCHASE · AI Security Research Report\nProtect trusted user approvals. Bind exact amounts, recipients, tokens and signing payloads. Reconcile idempotent settlement against the authoritative ledger.",
      keywords: ["report", "research", "AI", "security"],
    },
    {
      id: "agent-defense-guide",
      merchantId: "atlas-research",
      merchantName: "Atlas Research",
      merchantRole: "merchant",
      name: "Agent Defense Handbook",
      description:
        "A hands-on handbook for defending autonomous purchasing agents.",
      amount: "2000000",
      content:
        "SIMULATED PURCHASE · Agent Defense Handbook\nKeep untrusted merchant instructions separate from spending authority.",
      keywords: ["handbook", "guide", "defense"],
    },
    {
      id: "micro-security-brief",
      merchantId: "atlas-research",
      merchantName: "Atlas Research",
      merchantRole: "merchant",
      name: "Security Brief",
      description:
        "A short security briefing, also used by the installment-budget regression fixture.",
      amount: "100000",
      content:
        "SIMULATED PURCHASE · Security Brief\nEnforce cumulative task budgets.",
      keywords: ["brief", "micro"],
    },
  ];
  for (const r of rows)
    await db.labProduct.upsert({ where: { id: r.id }, create: r, update: r });
}

export function executable(env: {
  engineVersion: string;
  ruleVersion: string;
}) {
  if (env.engineVersion !== ENGINE || env.ruleVersion !== RULES)
    throw new AppError(
      409,
      "RECORDED_ENGINE_VERSION_UNAVAILABLE",
      "This historical environment is inspectable but requires its recorded engine version to execute. Use a current-version isolated fixture.",
    );
}
