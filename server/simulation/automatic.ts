import { z } from "zod";
import { db } from "../config";
import { AppError, conflict } from "../errors";
import {
  attackSchema,
  deliverAttack,
  evaluate,
  concludeAttack,
  event,
  confirm,
  getSimulation,
} from "./engine";
import { refreshClients } from "../realtime";
export const planSchema = z
  .object({
    payload: attackSchema,
    targetKind: z.enum(["next", "simulation", "resource", "merchant"]),
    targetId: z.string().min(1).max(100).optional(),
    expiresMinutes: z.number().int().min(1).max(1440).default(60),
    arm: z.boolean().default(true),
  })
  .strict();
async function planEvent(
  tx: any,
  id: string,
  status: string,
  data: unknown = {},
) {
  await tx.attackPlanEvent.create({ data: { planId: id, status, data } });
}
export async function createPlan(
  userId: string,
  sandboxId: string,
  raw: unknown,
) {
  if (!sandboxId)
    throw new AppError(
      401,
      "TEST_SESSION_REQUIRED",
      "Open a test workspace first.",
    );
  const b = planSchema.parse(raw);
  if (b.targetKind !== "next" && !b.targetId)
    throw new AppError(400, "TARGET_REQUIRED", "Choose a target.");
  if (b.targetKind === "simulation") {
    const target = await db.simulation.findFirst({
      where: {
        id: b.targetId,
        userId,
        sandboxId,
        automatic: true,
        stage: {
          in: ["AWAITING_APPROVAL", "AUTHORIZED", "ATTACK_WINDOW_OPEN"],
        },
      },
    });
    if (!target)
      throw conflict(
        "That purchase is not an eligible transaction in this test session.",
      );
  }
  if (b.targetKind === "resource")
    await db.mockResource.findUniqueOrThrow({ where: { id: b.targetId } });
  if (b.targetKind === "merchant")
    await db.merchant.findUniqueOrThrow({ where: { id: b.targetId } });
  return db.$transaction(async (tx) => {
    const p = await tx.attackPlan.create({
      data: {
        userId,
        sandboxId,
        category: b.payload.category,
        payload: b.payload,
        targetKind: b.targetKind,
        targetId: b.targetKind === "next" ? null : b.targetId,
        expiresAt: new Date(Date.now() + b.expiresMinutes * 60000),
      },
    });
    await planEvent(tx, p.id, "DRAFT");
    if (b.arm) {
      await planEvent(tx, p.id, "ARMED");
      return tx.attackPlan.update({
        where: { id: p.id },
        data: { status: "ARMED" },
      });
    }
    return p;
  });
}
export async function changePlan(
  id: string,
  userId: string,
  sandboxId: string,
  action: "arm" | "cancel" | "rearm",
) {
  const p = await db.attackPlan.findFirst({ where: { id, userId, sandboxId } });
  if (!p)
    throw new AppError(
      404,
      "PLAN_NOT_FOUND",
      "Attack configuration not found.",
    );
  if (action === "rearm")
    return createPlan(userId, sandboxId, {
      payload: p.payload,
      targetKind: p.targetKind,
      targetId: p.targetId || undefined,
      expiresMinutes: 60,
      arm: true,
    });
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const current = await tx.attackPlan.findUniqueOrThrow({ where: { id } });
    if (action === "cancel" && !["DRAFT", "ARMED"].includes(current.status))
      throw conflict("A consumed attack cannot be canceled.");
    if (
      action === "arm" &&
      (current.status !== "DRAFT" || current.expiresAt <= new Date())
    )
      throw conflict("Only an unexpired draft can be armed.");
    const status = action === "cancel" ? "CANCELED" : "ARMED";
    await planEvent(tx, id, status);
    return tx.attackPlan.update({ where: { id }, data: { status } });
  });
}
export async function expirePlans() {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const plans = await tx.attackPlan.findMany({
      where: {
        status: { in: ["DRAFT", "ARMED"] },
        expiresAt: { lte: new Date() },
      },
      take: 100,
    });
    for (const p of plans) {
      await tx.attackPlan.update({
        where: { id: p.id },
        data: { status: "EXPIRED" },
      });
      await planEvent(tx, p.id, "EXPIRED");
    }
  });
}
export async function runAutomatic(id: string, userId: string) {
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    const s = await tx.simulation.findFirstOrThrow({
      where: { id, userId },
      include: { resource: true },
    });
    if (["COMPLETED", "BLOCKED", "CANCELLED", "FAILED"].includes(s.stage))
      return null;
    if (!s.automatic || !s.sandboxId || s.stage !== "ATTACK_WINDOW_OPEN")
      throw conflict("This payment is not at its automatic evaluation stage.");
    const plan = await tx.attackPlan.findFirst({
      where: {
        userId,
        sandboxId: s.sandboxId,
        status: "ARMED",
        expiresAt: { gt: new Date() },
        OR: [
          { targetKind: "next" },
          { targetKind: "simulation", targetId: id },
          { targetKind: "resource", targetId: s.resourceId },
          { targetKind: "merchant", targetId: s.resource.merchantId },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (plan) {
      await tx.attackPlan.update({
        where: { id: plan.id },
        data: { status: "TRIGGERED", triggeredSimulationId: id },
      });
      await planEvent(tx, plan.id, "TRIGGERED", { simulationId: id });
      const attackId = await deliverAttack(
        tx,
        s,
        attackSchema.parse(plan.payload),
      );
      await tx.attackPlan.update({
        where: { id: plan.id },
        data: { status: "EVALUATING", attackId },
      });
      await planEvent(tx, plan.id, "EVALUATING", { attackId });
      return { planId: plan.id, attackId };
    }
    await tx.simulation.update({
      where: { id },
      data: { stage: "EVALUATING" },
    });
    await event(tx, id, "AUTOMATIC_EVALUATION_STARTED", "engine", {
      attackApplied: false,
    });
    return { planId: null, attackId: undefined };
  });
  if (!claim) return getSimulation(id, userId);
  refreshClients();
  try {
    await evaluate(id, userId, claim.attackId);
    if (claim.attackId) await concludeAttack(claim.attackId);
    if (claim.planId) {
      const s = await getSimulation(id, userId);
      const a = s.attacks.find((a) => a.id === claim.attackId);
      const result = {
        delivery: a?.deliveryStatus || "unknown",
        decision: a?.defenderDecision,
        objective: a?.objective,
        reason: a?.reason,
        signed: s.signings.length > 0,
        settled: Boolean(s.transfer),
        simulationId: id,
      };
      await db.$transaction(async (tx) => {
        await tx.attackPlan.update({
          where: { id: claim.planId! },
          data: { status: "COMPLETED", result },
        });
        await planEvent(tx, claim.planId!, "COMPLETED", result);
      });
    }
  } catch (e) {
    if (claim.planId)
      await db.$transaction(async (tx) => {
        await tx.attackPlan.update({
          where: { id: claim.planId! },
          data: {
            status: "FAILED",
            result: { error: String(e), simulationId: id },
          },
        });
        await planEvent(tx, claim.planId!, "FAILED", { error: String(e) });
      });
    throw e;
  } finally {
    refreshClients();
  }
  return getSimulation(id, userId);
}
let pumping = false;
export async function runPaymentJobs() {
  if (pumping) return;
  pumping = true;
  try {
    await expirePlans();
    // A crashed worker must not leave an approval processing forever or replay a signer.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
      const stale = await tx.paymentJob.findMany({
        where: {
          status: "RUNNING",
          startedAt: { lt: new Date(Date.now() - 120000) },
        },
        take: 20,
      });
      for (const job of stale) {
        const simulation = await tx.simulation.findUniqueOrThrow({
          where: { id: job.simulationId },
        });
        const terminal = [
          "COMPLETED",
          "BLOCKED",
          "CANCELLED",
          "FAILED",
        ].includes(simulation.stage);
        if (!terminal) {
          await tx.simulation.update({
            where: { id: simulation.id },
            data: { stage: "FAILED" },
          });
          await event(tx, simulation.id, "SETTLEMENT_FAILED", "engine", {
            message:
              "Payment processing was interrupted. Review the recorded evidence before starting another purchase.",
          });
        }
        await tx.paymentJob.update({
          where: { id: job.id },
          data: {
            status: terminal ? "COMPLETED" : "FAILED",
            finishedAt: new Date(),
            error: terminal
              ? null
              : "Interrupted worker; signing is not replayed.",
          },
        });
        const plan = await tx.attackPlan.findFirst({
          where: {
            triggeredSimulationId: simulation.id,
            status: { in: ["TRIGGERED", "EVALUATING"] },
          },
        });
        if (plan) {
          await tx.attackPlan.update({
            where: { id: plan.id },
            data: {
              status: "FAILED",
              result: {
                simulationId: simulation.id,
                reason: "Processing interrupted. Review payment evidence.",
              },
            },
          });
          await planEvent(tx, plan.id, "FAILED", {
            reason: "Processing interrupted",
          });
        }
      }
    });
    for (let i = 0; i < 8; i++) {
      const job = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
        const j = await tx.paymentJob.findFirst({
          where: { status: "QUEUED" },
          orderBy: { createdAt: "asc" },
        });
        if (!j) return null;
        return tx.paymentJob.update({
          where: { id: j.id },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      });
      if (!job) break;
      try {
        const s = await getSimulation(job.simulationId, job.userId);
        if (
          !["CANCELLED", "COMPLETED", "BLOCKED", "FAILED"].includes(s.stage)
        ) {
          await confirm(s.id, s.userId);
          await runAutomatic(s.id, s.userId);
        }
        await db.paymentJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", finishedAt: new Date() },
        });
      } catch (e) {
        const s = await getSimulation(job.simulationId, job.userId);
        if (!["COMPLETED", "BLOCKED", "CANCELLED", "FAILED"].includes(s.stage))
          await db.$transaction(async (tx) => {
            await tx.simulation.update({
              where: { id: s.id },
              data: { stage: "FAILED" },
            });
            await event(tx, s.id, "SETTLEMENT_FAILED", "engine", {
              message:
                "Payment processing failed. Review the payment evidence before retrying.",
              error: String(e),
            });
          });
        await db.paymentJob.update({
          where: { id: job.id },
          data: { status: "FAILED", error: String(e), finishedAt: new Date() },
        });
      }
      refreshClients();
    }
  } finally {
    pumping = false;
  }
}
export function startPaymentWorker() {
  const timer = setInterval(
    () =>
      runPaymentJobs().catch((e) =>
        console.error("Payment worker:", e.message),
      ),
    500,
  );
  timer.unref();
  return () => clearInterval(timer);
}
