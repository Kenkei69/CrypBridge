import { projectEvent } from "../chat/messages";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { decodeFunctionData, erc20Abi, isAddress } from "viem";
import {
  decodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import type { Prisma } from "@prisma/client";
import { db } from "../config";
import { uint } from "../engine";
import { AppError, conflict } from "../errors";
import { guardianDefaults } from "../simulation-seed";
export function stable(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
      .join(",") +
    "}"
  );
}
export const fingerprint = (v: unknown) =>
  createHash("sha256").update(stable(v)).digest("hex");
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
type Tx = Prisma.TransactionClient;
export async function event(
  tx: Tx,
  id: string,
  type: string,
  source: string,
  data: unknown,
) {
  const recorded = await tx.simulationEvent.create({
    data: { simulationId: id, type, source, data: json(data) },
  });
  await projectEvent(tx, recorded);
  return recorded;
}
const include = {
  resource: { include: { merchant: true } },
  authorization: true,
  decisions: { orderBy: { createdAt: "asc" as const } },
  attacks: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { sequence: "asc" as const } },
  signings: {
    select: {
      id: true,
      decisionId: true,
      createdAt: true,
      consumedAt: true,
      fingerprint: true,
    },
  },
  transfer: true,
};
export async function getSimulation(id: string, userId: string) {
  const s = await db.simulation.findFirst({ where: { id, userId }, include });
  if (!s)
    throw new AppError(
      404,
      "SIMULATION_NOT_FOUND",
      "Simulation not found in this workspace.",
    );
  return s;
}
export async function listSimulations(userId: string) {
  return db.simulation.findMany({
    where: { userId },
    include,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export function merchantOrigin() {
  const value =
    process.env.MOCK_MERCHANT_ORIGIN ||
    `http://127.0.0.1:${process.env.PORT || 3001}`;
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    u.pathname !== "/" ||
    u.username ||
    u.password
  )
    throw new AppError(
      500,
      "MERCHANT_CONFIGURATION",
      "Mock merchant must use an explicitly configured loopback HTTP origin.",
    );
  return u.origin;
}
export function decimalUnits(v: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(v))
    throw new AppError(
      422,
      "AMBIGUOUS_PRICE",
      "Use an explicit price with up to six decimal places.",
    );
  const [a, b = ""] = v.split(".");
  const n = BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
  if (n <= 0n || n >= 2n ** 256n)
    throw new AppError(
      422,
      "INVALID_PRICE",
      "Price is outside the supported range.",
    );
  return n.toString();
}
export async function propose(
  userId: string,
  prompt: string,
  retryOf?: string,
  chat?: { conversationId: string; turnId?: string; messageId?: string; resourceId?:string; automatic?:boolean;sandboxId?:string },
) {
  const resources = await db.mockResource.findMany({
    include: { merchant: true },
  });
  const exact=resources.filter(r=>prompt.toLowerCase().includes(r.name.toLowerCase()));
  const matching = chat?.resourceId?resources.filter(r=>r.id===chat.resourceId):exact.length===1?exact:resources.filter((r) =>
    (r.keywords as string[]).some((k) =>
      new RegExp(`\\b${k}\\b`, "i").test(prompt),
    ),
  );
  const prices = [
    ...prompt.matchAll(
      /(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:USDC|dollars?))/gi,
    ),
  ].map((m) => m[1] || m[2]);
  if (matching.length !== 1 || prices.length !== 1)
    return {
      clarification:
        "Please choose one catalog resource and one explicit budget, for example “Buy a research report for $1.”",
      catalog: resources.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
      })),
    };
  const resource = matching[0],
    budget = decimalUnits(prices[0]);
  if (BigInt(budget) < BigInt(resource.price))
    return {
      clarification: `${resource.name} costs ${BigInt(resource.price) / 1000000n}.${(BigInt(resource.price) % 1000000n).toString().padStart(6, "0")} USDC, which exceeds your budget. Please confirm a sufficient budget in a new request.`,
      catalog: resources.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
      })),
    };
  const wallet = await db.wallet.findFirst({
    where: {
      address: {
        equals: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        mode: "insensitive",
      },
    },
  });
  if (!wallet)
    throw new AppError(
      503,
      "WALLET_NOT_CONFIGURED",
      "The isolated mock buyer wallet is not configured.",
    );
  const proposal = {
    name: resource.name,
    amount: resource.price,
    budget,
    recipient: resource.merchant.recipient,
    asset: resource.merchant.asset,
    network: resource.merchant.network,
    scheme: "exact",
    walletAddress: wallet.address,
    resourceUrl: `${merchantOrigin()}/mock/merchant/${resource.id}`,
  };
  const s = await db.$transaction(async (tx) => {
    const conversationId =
      chat?.conversationId ||
      (await tx.conversation.create({ data: { userId, title: resource.name } }))
        .id;
    const s = await tx.simulation.create({
      data: {
        userId,
        resourceId: resource.id,
        walletId: wallet.id,
        prompt,
        proposal,
        retryOf,
        conversationId,
        chatTurnId: chat?.turnId,
        automatic:chat?.automatic||false,sandboxId:chat?.sandboxId,
        stage: "CREATED",
      },
    });
    await event(tx, s.id, "USER_REQUESTED_PURCHASE", "user", {
      prompt,
      chatMessageId: chat?.messageId,
      chatOrigin:Boolean(chat),
    });
    await tx.simulation.update({
      where: { id: s.id },
      data: { stage: "AWAITING_APPROVAL" },
    });
    await event(tx, s.id, "PURCHASE_PROPOSED", "agent", proposal);
    return s;
  });
  return getSimulation(s.id, userId);
}
export async function authorizePurchase(id:string,userId:string,queueJob=false){
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const s = await tx.simulation.findFirst({
      where: { id, userId },
      include: { authorization: true },
    });
    if (!s)
      throw new AppError(404, "SIMULATION_NOT_FOUND", "Simulation not found.");
    if (s.stage === "ATTACK_WINDOW_OPEN") return;
    if (!["AWAITING_APPROVAL", "AUTHORIZED"].includes(s.stage))
      throw conflict("This purchase cannot be confirmed at its current stage.");
    if (!s.authorization) {
      const p = s.proposal as any;
      const approved = {
        amount: p.amount,
        recipient: p.recipient,
        asset: p.asset,
        network: p.network,
        scheme: p.scheme,
        resourceUrl: p.resourceUrl,
        walletAddress: p.walletAddress,
      };
      await tx.purchaseAuthorization.create({
        data: {
          simulationId: id,
          ...approved,
          expiresAt: new Date(Date.now() + 15 * 60000),
          digest: fingerprint(approved),
        },
      });
      await event(tx, id, "USER_AUTHORIZATION_SAVED", "user", approved);
    }
    await tx.simulation.update({
      where: { id },
      data: { stage: "AUTHORIZED" },
    });
    if(queueJob)await tx.paymentJob.upsert({where:{simulationId:id},create:{simulationId:id,userId},update:{}});
  });
  return getSimulation(id,userId);
}
export async function confirm(id:string,userId:string){
  await authorizePurchase(id,userId);
  const s = await getSimulation(id, userId);
  if (s.stage === "ATTACK_WINDOW_OPEN") return s;
  try {
    const response = await fetch(
      `${merchantOrigin()}/mock/merchant/${s.resourceId}`,
      { redirect: "error", signal: AbortSignal.timeout(5000) },
    );
    if (response.status !== 402 || !response.headers.get("PAYMENT-REQUIRED"))
      throw new Error("Merchant did not issue HTTP 402 with PAYMENT-REQUIRED");
    const original = PaymentRequiredV2Schema.parse(
      decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED")!),
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
      const current = await tx.simulation.findUniqueOrThrow({ where: { id } });
      if (current.stage !== "AUTHORIZED") return;
      await event(tx, id, "MERCHANT_PAYMENT_REQUIRED", "merchant", {
        httpStatus: response.status,
        header: "PAYMENT-REQUIRED",
        requirements: original,
      });
      await tx.simulation.update({
        where: { id },
        data: {
          stage: "ATTACK_WINDOW_OPEN",
          original: json(original),
          modified: json({
            requirements: original,
            merchantContent: "",
            contractRequest: null,
          }),
          windowExpiresAt: new Date(Date.now() + 10 * 60000),
        },
      });
      await observeAddress(tx,id,current.userId,current.sandboxId,original.accepts[0].payTo,original.accepts[0].network);
      await event(tx, id, "ATTACK_WINDOW_OPENED", "engine", {
        message:
          "Paused before signing. Red Team may inject untrusted inputs, or Blue Team can continue without an attack.",
      });
    });
  } catch (e) {
    await fail(id, "MERCHANT_REQUEST_FAILED", String(e));
    throw new AppError(
      502,
      "MERCHANT_REQUEST_FAILED",
      "The mock merchant request failed. No signing or deduction occurred. Start a new simulation to retry.",
    );
  }
  return getSimulation(id, userId);
}
export const attackSchema = z.discriminatedUnion("category", [
  z
    .object({
      category: z.literal("overpayment"),
      amount: uint.refine((v) => BigInt(v) > 0n),
    })
    .strict(),
  z
    .object({
      category: z.literal("wrong_recipient"),
      recipient: z.string().refine((v) => isAddress(v, { strict: false })),
    })
    .strict(),
  z
    .object({
      category: z.literal("prompt_injection"),
      content: z.string().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      category: z.literal("duplicate_payment"),
      repeats: z.number().int().min(2).max(8).default(2),
    })
    .strict(),
  z
    .object({
      category: z.literal("contract_approval"),
      request: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("erc20_approve"),
            to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
            calldata: z
              .string()
              .regex(/^0x[0-9a-fA-F]+$/)
              .max(4096),
          })
          .strict(),
        z
          .object({
            kind: z.enum(["permit", "permit2"]),
            typedData: z
              .object({
                domain: z
                  .object({
                    chainId: z.number().int(),
                    verifyingContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
                  })
                  .strict(),
                message: z
                  .object({
                    spender: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
                    token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
                    amount: uint,
                    deadline: uint,
                  })
                  .strict(),
              })
              .strict(),
          })
          .strict(),
      ]),
    })
    .strict(),
]);
export type AttackInput = z.infer<typeof attackSchema>;
export function modifiedInput(original: any, attack: AttackInput) {
  const result = {
    requirements: json(original),
    merchantContent: "",
    contractRequest: null as any,
    repeatCount: 1,
  };
  switch (attack.category) {
    case "overpayment":
      result.requirements.accepts[0].amount = attack.amount;
      break;
    case "wrong_recipient":
      result.requirements.accepts[0].payTo = attack.recipient;
      break;
    case "prompt_injection":
      result.merchantContent = attack.content;
      break;
    case "duplicate_payment":
      result.repeatCount = attack.repeats;
      break;
    case "contract_approval":
      result.contractRequest = attack.request;
      break;
  }
  return result;
}
export async function preview(id: string, userId: string, attack: AttackInput) {
  const s = await getSimulation(id, userId);
  if (!s.original)
    throw conflict("Confirm the purchase before previewing an attack.");
  return {
    original: s.original,
    modified: modifiedInput(s.original, attack),
    authorization: s.authorization,
  };
}
export async function deliverAttack(tx:Tx,s:any,attack:AttackInput){const id=s.id;
    const modified = modifiedInput(s.original, attack);
    const a = await tx.simulationAttack.create({
      data: {
        simulationId: id,
        category: attack.category,
        payload: json(attack),
        original: json(s.original),
        modified: json(modified),
      },
    });
    await observeAddress(tx,id,s.userId,s.sandboxId,modified.requirements.accepts[0].payTo,modified.requirements.accepts[0].network);
    await event(tx, id, "ATTACK_DELIVERED", "red", {
      attackId: a.id,
      category: attack.category,
      payload: attack,
    });
    await tx.simulation.update({
      where: { id },
      data: { stage: "EVALUATING", modified: json(modified) },
    });
    return a.id;
}
export async function inject(id: string, userId: string, attack: AttackInput) {
  const attackId = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const s = await tx.simulation.findFirst({ where: { id, userId } });
    if (!s)
      throw new AppError(404, "SIMULATION_NOT_FOUND", "Simulation not found.");
    if (s.stage !== "ATTACK_WINDOW_OPEN")
      throw conflict(
        "This simulation no longer accepts attacks. Attacks must arrive during an open test window; completed purchases cannot be attacked again.",
      );
    if (
      s.stage === "ATTACK_WINDOW_OPEN" &&
      (!s.windowExpiresAt || s.windowExpiresAt < new Date())
    )
      throw conflict("Attack window expired. Start a new simulation.");
    return deliverAttack(tx,s,attack);
  });
  const s = await getSimulation(id, userId);
  try {
    if (s.stage !== "COMPLETED") await evaluate(id, userId, attackId);
  } finally {
    await concludeAttack(attackId);
  }
  return getSimulation(id, userId);
}
export async function concludeAttack(attackId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const attack = await tx.simulationAttack.findUniqueOrThrow({
      where: { id: attackId },
      include: {
        simulation: {
          include: {
            authorization: true,
            signings: true,
            transfer: { include: { to: true } },
          },
        },
      },
    });
    const s = attack.simulation,
      authorization = s.authorization;
    const transfers = await tx.mockTransfer.count({
      where: { simulationId: s.id },
    });
    const increased = Boolean(
      s.transfer &&
      authorization &&
      BigInt(s.transfer.amount.toFixed(0)) > BigInt(authorization.amount),
    );
    const substituted = Boolean(
      s.transfer &&
      authorization &&
      s.transfer.to.address.toLowerCase() !==
        authorization.recipient.toLowerCase(),
    );
    const contractAuthority = s.signings.some((signing) => {
      const a = signing.authorization as any;
      return Boolean(a.spender || a.calldata || a.permit || a.kind);
    });
    const achieved =
      attack.category === "overpayment"
        ? increased
        : attack.category === "wrong_recipient"
          ? substituted
          : attack.category === "duplicate_payment"
            ? transfers > 1
            : attack.category === "contract_approval"
              ? contractAuthority
              : increased || substituted || transfers > 1;
    const terminal = ["BLOCKED", "COMPLETED"].includes(s.stage);
    const objective = achieved
      ? "succeeded"
      : terminal
        ? "failed"
        : s.stage === "FAILED"
          ? "inconclusive"
          : "pending";
    await tx.simulationAttack.update({
      where: { id: attackId },
      data: { objective },
    });
    await event(tx, s.id, "ATTACK_OBJECTIVE_EVALUATED", "engine", {
      attackId,
      category: attack.category,
      objective,
      evidence: {
        transferCount: transfers,
        increasedAmount: increased,
        substitutedRecipient: substituted,
        contractAuthoritySigned: contractAuthority,
        stage: s.stage,
      },
    });
  });
}
export async function continuePurchase(id: string, userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const s = await tx.simulation.findFirst({ where: { id, userId } });
    if (!s)
      throw new AppError(404, "SIMULATION_NOT_FOUND", "Simulation not found.");
    if (s.stage === "COMPLETED") return;
    if (s.stage !== "ATTACK_WINDOW_OPEN")
      throw conflict("Only a pending merchant request can continue.");
    await tx.simulation.update({
      where: { id },
      data: { stage: "EVALUATING" },
    });
    await event(tx, id, "CONTINUE_WITHOUT_ATTACK", "user", {});
  });
  if ((await getSimulation(id, userId)).stage !== "COMPLETED")
    await evaluate(id, userId);
  return getSimulation(id, userId);
}
export function inspectContract(request: any, asset: string) {
  const rules = ["UNAUTHORIZED_CONTRACT_INTERACTION"];
  let decoded: any = {};
  try {
    if (request.kind === "erc20_approve") {
      const value = decodeFunctionData({
        abi: erc20Abi,
        data: request.calldata,
      });
      if (value.functionName !== "approve")
        return {
          rules: [...rules, "UNAPPROVED_FUNCTION"],
          decoded: { function: value.functionName },
        };
      const [spender, amount] = value.args as readonly [string, bigint];
      decoded = {
        kind: "ERC20 approve",
        spender,
        amount: amount.toString(),
        token: request.to,
      };
      rules.push("UNKNOWN_SPENDER");
      if (amount === 2n ** 256n - 1n) rules.push("UNLIMITED_ALLOWANCE");
      if (request.to.toLowerCase() !== asset.toLowerCase())
        rules.push("TOKEN_MISMATCH");
    } else {
      decoded = { kind: request.kind, ...request.typedData };
      rules.push(
        request.kind === "permit2"
          ? "UNAUTHORIZED_PERMIT2"
          : "UNAUTHORIZED_PERMIT",
      );
      const d = request.typedData;
      if (d.domain.chainId !== 84532) rules.push("NETWORK_MISMATCH");
      if (d.message.token.toLowerCase() !== asset.toLowerCase())
        rules.push("TOKEN_MISMATCH");
      rules.push("UNKNOWN_SPENDER");
      if (BigInt(d.message.amount) >= 2n ** 160n - 1n)
        rules.push("UNLIMITED_ALLOWANCE");
    }
  } catch {
    rules.push("MALFORMED_CONTRACT_REQUEST");
  }
  return { rules, decoded };
}
export async function guardianChecks(tx: Tx, s: any, input: any) {
  const authorization = s.authorization;
  if (!authorization)
    throw new AppError(
      409,
      "AUTHORIZATION_MISSING",
      "A confirmed user authorization is required.",
    );
  const latest = await tx.guardianPolicy.findFirstOrThrow({
    orderBy: { version: "desc" },
  });
  const policy = latest.config as typeof guardianDefaults;
  const rules: string[] = [];
  let amount = 0n;
  const parsed = PaymentRequiredV2Schema.safeParse(input.requirements);
  if (!parsed.success) rules.push("MALFORMED_X402_REQUIREMENTS");
  const req = input.requirements?.accepts?.[0];
  if (!req || input.requirements.accepts.length !== 1)
    rules.push("UNSUPPORTED_PAYMENT_OPTIONS");
  else {
    try {
      amount = BigInt(req.amount);
      if (!/^\d+$/.test(req.amount) || amount <= 0n || amount >= 2n ** 256n)
        rules.push("INVALID_AMOUNT");
    } catch {
      rules.push("INVALID_AMOUNT");
    }
    if (amount > BigInt(authorization.amount))
      rules.push("AMOUNT_EXCEEDS_AUTHORIZATION");
    if (amount !== BigInt(authorization.amount)) rules.push("AMOUNT_MISMATCH");
    if (req.payTo?.toLowerCase() !== authorization.recipient.toLowerCase())
      rules.push("RECIPIENT_MISMATCH");
    if (
      req.asset?.toLowerCase() !== authorization.asset.toLowerCase() ||
      req.asset?.toLowerCase() !== policy.allowedAsset.toLowerCase()
    )
      rules.push("TOKEN_MISMATCH");
    if (
      req.network !== authorization.network ||
      req.network !== policy.allowedNetwork
    )
      rules.push("NETWORK_MISMATCH");
    if (req.scheme !== authorization.scheme || req.scheme !== "exact")
      rules.push("SCHEME_NOT_ALLOWED");
    if (
      !Number.isInteger(req.maxTimeoutSeconds) ||
      req.maxTimeoutSeconds <= 0 ||
      req.maxTimeoutSeconds > 60
    )
      rules.push("INVALID_AUTHORIZATION_WINDOW");
  }
  if (input.requirements?.resource?.url !== authorization.resourceUrl)
    rules.push("RESOURCE_MISMATCH");
  if (authorization.expiresAt < new Date())
    rules.push("USER_AUTHORIZATION_EXPIRED");
  const wallet = await tx.wallet.findUnique({ where: { id: s.walletId } });
  if (
    !wallet?.enabled ||
    wallet.mode !== "mock" ||
    wallet.address.toLowerCase() !==
      authorization.walletAddress.toLowerCase() ||
    !policy.enabled
  )
    rules.push("SIGNING_DISABLED");
  if (await tx.mockTransfer.findUnique({ where: { simulationId: s.id } }))
    rules.push("DUPLICATE_PAYMENT");
  if (input.contractRequest) {
    const result = inspectContract(input.contractRequest, authorization.asset);
    rules.push(...result.rules);
    await event(tx, s.id, "CONTRACT_AUTHORITY_DECODED", "blue", result);
  }
  if (amount > BigInt(policy.maxPayment))
    rules.push("TRANSACTION_POLICY_LIMIT");
  const account = await tx.mockAccount.findUniqueOrThrow({
    where: { id: "buyer-demo" },
  });
  if (amount > BigInt(account.balance.toFixed(0)))
    rules.push("INSUFFICIENT_MOCK_BALANCE");
  const sessionSpent = await tx.mockTransfer.aggregate({
    where: { fromId: "buyer-demo", kind: "payment" },
    _sum: { amount: true },
  });
  if (
    BigInt(sessionSpent._sum.amount?.toFixed(0) || "0") + amount >
    BigInt(policy.sessionLimit)
  )
    rules.push("SESSION_POLICY_LIMIT");
  const dailyKey = `guardian:buyer-demo:${new Date().toISOString().slice(0, 10)}`;
  const spent = await tx.spend.findUnique({ where: { key: dailyKey } });
  if (
    BigInt(spent?.amount.toFixed(0) || "0") + amount >
    BigInt(policy.dailyLimit)
  )
    rules.push("DAILY_POLICY_LIMIT");
  return {
    rules: [...new Set(rules)],
    version: latest.version,
    req,
    amount,
    dailyKey,
  };
}
// The sole mock signing boundary. No route exposes this function to Red Team.
export async function signApproved(
  tx: Tx,
  s: any,
  input: any,
  decisionId: string,
) {
  const current = await tx.simulation.findUniqueOrThrow({
    where: { id: s.id },
    include: { authorization: true },
  });
  if (
    current.stage !== "EVALUATING" ||
    current.userId !== s.userId ||
    fingerprint(current.modified) !== fingerprint(input)
  )
    throw new AppError(
      403,
      "SIGNER_APPROVAL_REQUIRED",
      "The signer refuses stale simulation state.",
    );
  s = current;
  const decision = await tx.guardDecision.findUniqueOrThrow({
    where: { id: decisionId },
  });
  if (
    decision.simulationId !== s.id ||
    decision.decision !== "approve" ||
    decision.fingerprint !== fingerprint(input) ||
    s.stage !== "EVALUATING"
  )
    throw new AppError(
      403,
      "SIGNER_APPROVAL_REQUIRED",
      "The mock signer requires an exact current guard approval.",
    );
  const checked = await guardianChecks(tx, s, input);
  if (checked.rules.length || checked.version !== decision.policyVersion)
    throw new AppError(
      403,
      "SIGNER_APPROVAL_STALE",
      "Payment conditions changed after approval.",
    );
  const now = Math.floor(Date.now() / 1000);
  const proof = `0x${randomBytes(65).toString("hex")}`;
  const authorization = {
    from: s.authorization.walletAddress,
    to: s.authorization.recipient,
    value: s.authorization.amount,
    validAfter: String(now - 1),
    validBefore: String(now + 60),
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
  await tx.mockSigning.create({
    data: {
      simulationId: s.id,
      decisionId,
      proofHash: fingerprint(proof),
      fingerprint: decision.fingerprint,
      authorization,
      expiresAt: new Date((now + 60) * 1000),
    },
  });
  await tx.simulation.update({
    where: { id: s.id },
    data: { stage: "APPROVED" },
  });
  await event(tx, s.id, "MOCK_AUTHORIZATION_SIGNED", "signer", {
    decisionId,
    amount: authorization.value,
    recipient: authorization.to,
    mode: "test-only opaque proof; not EIP-712",
  });
  return {
    x402Version: 2,
    resource: input.requirements.resource,
    accepted: input.requirements.accepts[0],
    payload: { signature: proof, authorization, mock: { simulationId: s.id } },
  };
}
export async function evaluate(id: string, userId: string, attackId?: string) {
  const signed = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
      const s = await tx.simulation.findFirst({
        where: { id, userId },
        include: { authorization: true },
      });
      if (!s || s.stage !== "EVALUATING")
        throw conflict("The simulation is not awaiting guard evaluation.");
      const input = s.modified as any;
      await event(tx, id, "BLUE_VALIDATION_STARTED", "blue", {
        authorizationId: s.authorization?.id,
      });
      if (input.merchantContent)
        await event(tx, id, "UNTRUSTED_CONTENT_ISOLATED", "blue", {
          content: input.merchantContent,
          additionalAuthorityGranted: false,
          message:
            "Merchant text is data, not user authorization. The trusted purchase remains unchanged.",
        });
      const { rules, version } = await guardianChecks(tx, s, input);
      const decision = await tx.guardDecision.create({
        data: {
          simulationId: id,
          decision: rules.length ? "block" : "approve",
          rules,
          fingerprint: fingerprint(input),
          policyVersion: version,
          explanation: rules.length
            ? rules.join(", ")
            : "Amount, recipient, token, network, resource, policy, and signing permissions match the confirmed user authorization.",
        },
      });
      await event(
        tx,
        id,
        rules.length ? "PAYMENT_BLOCKED" : "PAYMENT_APPROVED",
        "blue",
        { decisionId: decision.id, rules, explanation: decision.explanation },
      );
      if (rules.length) {
        await tx.simulation.update({
          where: { id },
          data: { stage: "BLOCKED" },
        });
        if (attackId)
          await tx.simulationAttack.update({
            where: { id: attackId },
            data: {
              objective: "pending",
              defenderDecision: "block",
              reason: decision.explanation,
            },
          });
        await event(tx, id, "SIMULATION_COMPLETED", "engine", {
          stage: "BLOCKED",
          signed: false,
          deduction: "0",
        });
        return null;
      }
      const payload = await signApproved(tx, s, input, decision.id);
      if (attackId)
        await tx.simulationAttack.update({
          where: { id: attackId },
          data: {
            objective: "pending",
            defenderDecision: "approve",
            reason: input.merchantContent
              ? "Prompt text could not authorize extra payments. Only the original purchase was approved."
              : "Only the original purchase is authorized; repeated responses cannot add charges.",
          },
        });
      return payload;
    },
    { timeout: 15000 },
  );
  if (!signed) return;
  try {
    const s = await getSimulation(id, userId);
    const response = await fetch(
      `${merchantOrigin()}/mock/merchant/${s.resourceId}`,
      {
        headers: {
          "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(signed as any),
        },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(`Merchant retry failed: HTTP ${response.status}`);
    const input = s.modified as any;
    if (input.repeatCount > 1) {
      for (let i = 1; i < input.repeatCount; i++) {
        const duplicate = await fetch(
          `${merchantOrigin()}/mock/merchant/${s.resourceId}`,
          {
            headers: {
              "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(signed as any),
            },
            signal: AbortSignal.timeout(5000),
            redirect: "error",
          },
        );
        await db.$transaction((tx) =>
          event(tx, id, "DUPLICATE_PAYMENT_REJECTED", "blue", {
            httpStatus: duplicate.status,
            attempt: i + 1,
            additionalCharges: 0,
          }),
        );
      }
    }
  } catch (e) {
    const current = await getSimulation(id, userId);
    if (current.stage !== "COMPLETED") {
      await fail(id, "SETTLEMENT_FAILED", String(e));
      throw new AppError(
        502,
        "SETTLEMENT_FAILED",
        "Mock settlement did not complete. No completed transfer is recorded; inspect the timeline before retrying.",
      );
    }
  }
}
export async function settleSignedResource(resourceId: string, header: string) {
  let payload: any;
  try {
    payload = decodePaymentSignatureHeader(header);
  } catch {
    throw new AppError(
      400,
      "INVALID_MOCK_PROOF",
      "Malformed PAYMENT-SIGNATURE header.",
    );
  }
  if (
    typeof payload?.payload?.signature !== "string" ||
    !/^0x[0-9a-f]{130}$/.test(payload.payload.signature) ||
    !payload?.payload?.authorization
  )
    throw new AppError(
      403,
      "INVALID_MOCK_PROOF",
      "The merchant accepts only an opaque test proof from the isolated mock signer.",
    );
  const simulationId = payload?.payload?.mock?.simulationId;
  if (typeof simulationId !== "string")
    throw new AppError(
      403,
      "MOCK_PROOF_REQUIRED",
      "Only an isolated mock signer proof is accepted.",
    );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
      const s = await tx.simulation.findUnique({
        where: { id: simulationId },
        include: { authorization: true, resource: true },
      });
      if (!s || s.resourceId !== resourceId || s.stage !== "APPROVED")
        throw new AppError(
          409,
          "DUPLICATE_OR_UNAUTHORIZED_PAYMENT",
          "Purchase is already settled or has no current signing approval.",
        );
      const signing = await tx.mockSigning.findUnique({
        where: { proofHash: fingerprint(payload.payload.signature) },
      });
      if (
        !signing ||
        signing.simulationId !== s.id ||
        signing.consumedAt ||
        signing.expiresAt < new Date()
      )
        throw new AppError(
          403,
          "INVALID_MOCK_PROOF",
          "Mock authorization is missing, expired, or already used.",
        );
      const input = s.modified as any;
      const checks = await guardianChecks(tx, s, input);
      const decision = await tx.guardDecision.findUniqueOrThrow({
        where: { id: signing.decisionId },
      });
      if (
        checks.rules.length ||
        checks.version !== decision.policyVersion ||
        payload.x402Version !== 2 ||
        stable(payload.accepted) !== stable(input.requirements.accepts[0]) ||
        stable(payload.resource) !== stable(input.requirements.resource) ||
        stable(payload.payload.authorization) !==
          stable(signing.authorization) ||
        signing.fingerprint !== fingerprint(input)
      )
        throw new AppError(
          403,
          "SIGNING_PARAMETERS_MISMATCH",
          "Mock proof is not bound to the current trusted payment conditions.",
        );
      await event(tx, s.id, "MOCK_PROOF_VERIFIED", "merchant", {
        signingId: signing.id,
      });
      const amount = s.authorization!.amount;
      await tx.mockAccount.update({
        where: { id: "buyer-demo" },
        data: { balance: { decrement: amount } },
      });
      await tx.mockAccount.update({
        where: { id: "merchant-atlas" },
        data: { balance: { increment: amount } },
      });
      const transfer = await tx.mockTransfer.create({
        data: {
          simulationId: s.id,
          fromId: "buyer-demo",
          toId: "merchant-atlas",
          amount,
        },
      });
      await tx.spend.upsert({
        where: { key: checks.dailyKey },
        create: { key: checks.dailyKey, amount },
        update: { amount: { increment: amount } },
      });
      await tx.mockSigning.update({
        where: { id: signing.id },
        data: { consumedAt: new Date() },
      });
      const delivery = {
        resourceId,
        name: s.resource.name,
        content: s.resource.content,
        mode: "mock",
        ledgerEntryId: transfer.id,
        amount,
        network: s.authorization!.network,
        blockchainTransaction: null,
      };
      await tx.simulation.update({
        where: { id: s.id },
        data: { stage: "MOCK_SETTLED" },
      });
      await event(tx, s.id, "MOCK_LEDGER_SETTLED", "settlement", {
        ledgerEntryId: transfer.id,
        amount,
        from: "buyer-demo",
        to: "merchant-atlas",
        mode: "mock",
      });
      await tx.simulation.update({
        where: { id: s.id },
        data: { stage: "COMPLETED", delivery },
      });
      await event(tx, s.id, "RESOURCE_DELIVERED", "merchant", delivery);
      await event(tx, s.id, "SIMULATION_COMPLETED", "agent", {
        message: "Purchase completed successfully in the mock ledger.",
        stage: "COMPLETED",
      });
      return delivery;
    },
    { timeout: 15000 },
  );
}
async function fail(id: string, type: string, message: string) {
  await db.$transaction(async (tx) => {
    await tx.simulation.update({ where: { id }, data: { stage: "FAILED" } });
    await event(tx, id, type, "engine", { message, noLiveFunds: true });
  });
}

export async function cancelPurchase(id: string, userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const s = await tx.simulation.findFirst({ where: { id, userId } });
    if (!s)
      throw new AppError(404, "SIMULATION_NOT_FOUND", "Purchase not found.");
    if (s.stage === "CANCELLED") return;
    if (
      ![
        "CREATED",
        "AWAITING_APPROVAL",
        "AUTHORIZED",
        "ATTACK_WINDOW_OPEN",
      ].includes(s.stage)
    )
      throw conflict(
        "This purchase can no longer be canceled. Signing or processing has already started.",
      );
    await tx.simulation.update({ where: { id }, data: { stage: "CANCELLED" } });
    await event(tx, id, "PURCHASE_CANCELLED", "user", { deduction: "0" });
  });
  return getSimulation(id, userId);
}

async function observeAddress(tx:Tx,simulationId:string,userId:string,sandboxId:string|null,address:string,network:string){if(!sandboxId)return;const watches=await tx.addressWatch.findMany({where:{userId,sandboxId,address:address.toLowerCase(),network}});for(const w of watches)await tx.addressObservation.upsert({where:{watchId_simulationId:{watchId:w.id,simulationId}},create:{watchId:w.id,simulationId,data:{address,network,source:"platform_payment_request"}},update:{}});}
