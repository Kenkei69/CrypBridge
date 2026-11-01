import { createPlan, changePlan } from "./automatic";
import { Router } from "express";
import { z } from "zod";
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { db } from "../config";
import { requireSession, role } from "../security";
import { AppError } from "../errors";
import { uint } from "../engine";
import { guardianDefaults } from "../simulation-seed";
import {
  propose,
  confirm,
  continuePurchase,
  getSimulation,
  listSimulations,
  attackSchema,
  preview,
  inject,
  settleSignedResource,
  merchantOrigin,
  cancelPurchase,
} from "./engine";
export const merchantRouter = Router();
merchantRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
merchantRouter.get("/:resourceId", async (req, res) => {
  const resource = await db.mockResource.findUnique({
    where: { id: String(req.params.resourceId) },
    include: { merchant: true },
  });
  if (!resource)
    throw new AppError(
      404,
      "RESOURCE_NOT_FOUND",
      "Unknown mock merchant resource.",
    );
  const signature = req.get("PAYMENT-SIGNATURE");
  if (signature) {
    const delivery = await settleSignedResource(resource.id, signature);
    res.set(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader({
        success: true,
        transaction: "",
        network: resource.merchant.network,
        payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        extensions: { mock: { ledgerEntryId: delivery.ledgerEntryId } },
      } as any),
    );
    return res.json(delivery);
  }
  const requirements = {
    x402Version: 2,
    resource: {
      url: `${merchantOrigin()}/mock/merchant/${resource.id}`,
      description: resource.name,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: resource.merchant.network,
        amount: resource.price,
        asset: resource.merchant.asset,
        payTo: resource.merchant.recipient,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" },
      },
    ],
  };
  res.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(requirements as any));
  res.status(402).json({
    mode: "mock",
    environmentLabel: "Test Environment",

    message: "Payment required. Only isolated mock proofs are accepted.",
    ...requirements,
  });
});
export const simulationRouter = Router();
simulationRouter.use(requireSession);
simulationRouter.use(
  ["/simulations/:id", "/blue/simulations/:id", "/red/simulations/:id"],
  async (req, res, next) => {
    try {
      const simulation = await db.simulation.findFirst({
        where: { id: String(req.params.id), userId: res.locals.session.userId },
      });
      if (
        simulation?.automatic &&
        simulation.sandboxId !== res.locals.session.sandboxId
      )
        throw new AppError(
          404,
          "SIMULATION_NOT_FOUND",
          "Payment not found in this test session.",
        );
      if (
        simulation?.automatic &&
        req.method === "POST" &&
        req.baseUrl.includes("/red/simulations/")
      )
        throw new AppError(
          409,
          "AUTOMATIC_ATTACK_REQUIRED",
          "Arm an attack plan for automatic checkout.",
        );
      next();
    } catch (e) {
      next(e);
    }
  },
);

simulationRouter.use((_req, _res, next) => {
  if (
    process.env.DEMO_MODE !== "true" &&
    process.env.MOCK_SIMULATION_ENABLED !== "true"
  )
    return next(
      new AppError(
        403,
        "MOCK_ENVIRONMENT_DISABLED",
        "Mock simulations must be explicitly enabled on this deployment.",
      ),
    );
  next();
});
simulationRouter.get("/simulations", async (_req, res) => {
  res.json({
    user: {
      name: res.locals.session.user.name,
      email: res.locals.session.user.email,
    },
    workspace: res.locals.session.workspace,
    conversationHeads: await db.conversation.findMany({
      where: {
        userId: res.locals.session.userId,
        sandboxId: res.locals.session.sandboxId,
      },
      select: { id: true, updatedAt: true },
    }),
    simulations: (await listSimulations(res.locals.session.userId)).filter(
      (s) => !s.automatic || s.sandboxId === res.locals.session.sandboxId,
    ),
    catalog: await db.mockResource.findMany({ include: { merchant: true } }),
    policy: await db.guardianPolicy.findFirst({ orderBy: { version: "desc" } }),
    accounts: await db.mockAccount.findMany(),
    mode: "mock",
    environmentLabel: "Test Environment",
    attackPlans: await db.attackPlan.findMany({
      where: {
        userId: res.locals.session.userId,
        sandboxId: res.locals.session.sandboxId,
      },
      include: { events: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  });
});
simulationRouter.get("/simulations/:id", async (req, res) =>
  res.json(
    await getSimulation(String(req.params.id), res.locals.session.userId),
  ),
);
simulationRouter.get("/simulations/:id/events", async (req, res) => {
  const s = await getSimulation(
    String(req.params.id),
    res.locals.session.userId,
  );
  res.json(s.events);
});
simulationRouter.get("/simulations/:id/export", async (req, res) => {
  const s = await getSimulation(
    String(req.params.id),
    res.locals.session.userId,
  );
  res.attachment(`mock-simulation-${s.id}.json`).json(s);
});
simulationRouter.post("/blue/purchases", role("blue"), async (req, res) => {
  const { prompt } = z
    .object({ prompt: z.string().min(3).max(1000) })
    .strict()
    .parse(req.body);
  res.status(201).json(await propose(res.locals.session.userId, prompt));
});
simulationRouter.post(
  "/blue/simulations/:id/confirm",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(await confirm(String(req.params.id), res.locals.session.userId));
  },
);
simulationRouter.post(
  "/blue/simulations/:id/continue",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      await continuePurchase(String(req.params.id), res.locals.session.userId),
    );
  },
);
simulationRouter.post(
  "/blue/simulations/:id/rerun",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    const previous = await getSimulation(
      String(req.params.id),
      res.locals.session.userId,
    );
    res
      .status(201)
      .json(
        await propose(res.locals.session.userId, previous.prompt, previous.id),
      );
  },
);
simulationRouter.post(
  "/red/simulations/:id/preview",
  role("red"),
  async (req, res) =>
    res.json(
      await preview(
        String(req.params.id),
        res.locals.session.userId,
        attackSchema.parse(req.body),
      ),
    ),
);
simulationRouter.post(
  "/red/simulations/:id/attacks",
  role("red"),
  async (req, res) =>
    res.json(
      await inject(
        String(req.params.id),
        res.locals.session.userId,
        attackSchema.parse(req.body),
      ),
    ),
);
simulationRouter.post(
  "/blue/guardian-policies",
  role("blue"),
  async (req, res) => {
    const config = z
      .object({
        enabled: z.boolean(),
        maxPayment: uint,
        dailyLimit: uint,
        sessionLimit: uint,
        allowedNetwork: z.literal("eip155:84532"),
        allowedAsset: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        allowContractCalls: z.literal(false),
      })
      .strict()
      .parse(req.body);
    res.json(
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
        const previous = await tx.guardianPolicy.findFirstOrThrow({
          orderBy: { version: "desc" },
        });
        const p = await tx.guardianPolicy.create({
          data: { version: previous.version + 1, config },
        });
        await tx.audit.create({
          data: {
            action: "guardian.policy.updated",
            data: { userId: res.locals.session.userId, version: p.version },
          },
        });
        return p;
      }),
    );
  },
);

simulationRouter.post(
  "/blue/simulations/:id/cancel",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(
      await cancelPurchase(String(req.params.id), res.locals.session.userId),
    );
  },
);

simulationRouter.post("/red/attack-plans", role("red"), async (req, res) =>
  res
    .status(201)
    .json(
      await createPlan(
        res.locals.session.userId,
        res.locals.session.sandboxId,
        req.body,
      ),
    ),
);
simulationRouter.post(
  "/red/attack-plans/:id/:action",
  role("red"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    const action = z.enum(["arm", "cancel", "rearm"]).parse(req.params.action);
    res.json(
      await changePlan(
        String(req.params.id),
        res.locals.session.userId,
        res.locals.session.sandboxId,
        action,
      ),
    );
  },
);

simulationRouter.post(
  "/incidents/:simulationId/actions",
  role("blue"),
  async (req, res) => {
    const { kind } = z
      .object({ kind: z.enum(["REPORT", "SAVE", "RESTRICT", "MONITOR"]) })
      .strict()
      .parse(req.body);
    const session = res.locals.session;
    const s = await getSimulation(
      String(req.params.simulationId),
      session.userId,
    );
    if (s.sandboxId !== session.sandboxId || s.stage !== "BLOCKED")
      throw new AppError(
        409,
        "INCIDENT_NOT_ELIGIBLE",
        "Select a blocked payment in this test session.",
      );
    const result = await db.$transaction(async (tx) => {
      const incident = await tx.incident.upsert({
        where: { simulationId: s.id },
        create: {
          userId: session.userId,
          sandboxId: session.sandboxId,
          simulationId: s.id,
          evidence: JSON.parse(JSON.stringify(s)),
        },
        update: {},
      });
      const prior = await tx.incidentAction.findUnique({
        where: { incidentId_kind: { incidentId: incident.id, kind } },
      });
      if (!prior) {
        if (kind === "RESTRICT") {
          const policy = await tx.guardianPolicy.findFirstOrThrow({
            orderBy: { version: "desc" },
          });
          await tx.guardianPolicy.create({
            data: {
              version: policy.version + 1,
              config: { ...(policy.config as any), enabled: false },
            },
          });
        }
        if (kind === "MONITOR") {
          const input = s.modified as any;
          const address =
            input?.requirements?.accepts?.[0]?.payTo ||
            (s.proposal as any).recipient;
          await tx.addressWatch.upsert({
            where: {
              userId_sandboxId_address_network: {
                userId: session.userId,
                sandboxId: session.sandboxId,
                address: address.toLowerCase(),
                network: (s.proposal as any).network,
              },
            },
            create: {
              userId: session.userId,
              sandboxId: session.sandboxId,
              address: address.toLowerCase(),
              network: (s.proposal as any).network,
              incidentId: incident.id,
            },
            update: {},
          });
        }
        await tx.incidentAction.create({
          data: {
            incidentId: incident.id,
            kind,
            data: {
              adapter: "local_test",
              fundsTransferred: Boolean(s.transfer),
            },
          },
        });
      }
      return incident;
    });
    res.json({
      incident: result,
      message:
        kind === "REPORT"
          ? "Report saved locally in the test investigation center. No external alert was sent."
          : kind === "MONITOR"
            ? "Address watch saved for future platform payment requests."
            : kind === "RESTRICT"
              ? "Payment permissions paused. Review Guardian Policy to enable payments."
              : "Incident and complete evidence saved to investigation center.",
    });
  },
);
simulationRouter.get("/incidents", async (_req, res) =>
  res.json(
    await db.incident.findMany({
      where: {
        userId: res.locals.session.userId,
        sandboxId: res.locals.session.sandboxId,
      },
      include: { actions: true },
      orderBy: { createdAt: "desc" },
    }),
  ),
);

// An explicit response drill uses dedicated simulated accounts, never the buyer's balance.
simulationRouter.post(
  "/incidents/response-drill",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    const session = res.locals.session;
    const incident = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
      const existing = await tx.incident.findFirst({
        where: {
          userId: session.userId,
          sandboxId: session.sandboxId,
          kind: "SIMULATED_LOSS",
        },
      });
      if (existing) return existing;
      const fromId = `drill-source:${session.sandboxId}`,
        toId = `drill-destination:${session.sandboxId}`;
      await tx.mockAccount.create({
        data: { id: fromId, address: fromId, balance: "9000000" },
      });
      await tx.mockAccount.create({
        data: { id: toId, address: toId, balance: "1000000" },
      });
      const transfer = await tx.mockTransfer.create({
        data: {
          fromId,
          toId,
          amount: "1000000",
          kind: "incident_response_drill",
        },
      });
      return tx.incident.create({
        data: {
          userId: session.userId,
          sandboxId: session.sandboxId,
          kind: "SIMULATED_LOSS",
          evidence: {
            environment: "test",
            settlementType: "SIMULATED",
            transferId: transfer.id,
            amount: "1000000",
            token: "USDC",
            source: fromId,
            destination: toId,
            occurredAt: transfer.createdAt.toISOString(),
            description:
              "Explicit unauthorized-transfer response drill using dedicated test accounts. Buyer funds are unchanged.",
            trace: [{ from: fromId, to: toId, paymentReference: transfer.id }],
            externalFundsMoved: false,
          },
        },
      });
    });
    res.status(201).json(incident);
  },
);
simulationRouter.post(
  "/incidents/:incidentId/escalate",
  role("blue"),
  async (req, res) => {
    z.object({}).strict().parse(req.body);
    const session = res.locals.session;
    const incident = await db.incident.findFirst({
      where: {
        id: String(req.params.incidentId),
        userId: session.userId,
        sandboxId: session.sandboxId,
        kind: "SIMULATED_LOSS",
      },
    });
    const evidence = incident?.evidence as any;
    if (
      !incident ||
      !evidence?.transferId ||
      !(await db.mockTransfer.findFirst({
        where: { id: evidence.transferId, kind: "incident_response_drill" },
      }))
    )
      throw new AppError(
        422,
        "TRANSFER_EVIDENCE_REQUIRED",
        "Escalation requires a recorded transfer and supporting evidence. Blocked payments are not eligible.",
      );
    const action = await db.incidentAction.upsert({
      where: {
        incidentId_kind: { incidentId: incident.id, kind: "ESCALATE_TEST" },
      },
      create: {
        incidentId: incident.id,
        kind: "ESCALATE_TEST",
        data: {
          adapter: "local_test_response_adapter",
          status: "TEST_ACKNOWLEDGED",
          freezeConfirmed: false,
          evidenceReference: evidence.transferId,
          message:
            "Test adapter acknowledged the evidence package. No exchange was contacted and no funds were frozen.",
        },
      },
      update: {},
    });
    res.json(action);
  },
);
