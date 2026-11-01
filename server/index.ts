import {simulationMode} from './runtime';
import {labRouter} from './lab/routes';
import {seedCatalog} from './lab/core';
import {liveRouter} from './testnet/routes';
import {merchant} from './testnet/merchant';
import {startIndexer} from './testnet/indexer';
import {startPaymentWorker} from "./simulation/automatic";
import {realtime} from "./realtime";
import { chatRouter } from "./chat/routes";
import {
  checkOrigin,
  allowedOrigins,
  authenticate,
  createSession,
  requireSession,
  role,
} from "./security";
import { AppError } from "./errors";
import { merchantRouter, simulationRouter } from "./simulation/routes";
import { seedSimulation } from "./simulation-seed";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { db, defaultPolicy } from "./config";
import { fixture, validate, uint } from "./engine";
import { assess, categories } from "./attacks";
export const app = express();
app.use(helmet());
app.use(express.json({ limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          code: "RATE_LIMITED",
          error:
            "Too many requests. Please wait for the current rate-limit window to reset before trying again.",
        }),
  }),
);
app.use("/api", checkOrigin, authenticate);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.path !== "/session")
    res.on("finish", () => {
      broadcast();
    });
  next();
});
app.post("/api/session", async (req, res) => {
  const { workspace } = z
    .object({ workspace: z.enum(["blue", "red"]) })
    .strict()
    .parse(req.body);
  res.json(await createSession(req, res, workspace));
});
app.get('/api/runtime',(_req,res)=>res.json({mode:simulationMode()?'simulation':'testnet',financialSimulation:simulationMode(),label:simulationMode()?'SIMULATION · NO REAL FUNDS':'Base Sepolia Testnet'}));
app.use('/api/lab',(_req,res,next)=>{if(!simulationMode()){res.status(423).json({error:'Simulation engine is isolated from testnet mode'});return;}next();},labRouter);
const realOnly:express.RequestHandler=(_req,res,next)=>{if(simulationMode()){res.status(423).json({error:'Real blockchain signing and submission are disabled in simulation mode'});return;}next();};
app.use('/merchant',realOnly, merchant);
app.use('/api/live',realOnly,liveRouter);
// Legacy simulation handlers are retained for archival tests only.
if(process.env.NODE_ENV !== 'test' || process.env.LEGACY_SIMULATION_TESTS !== 'true') app.use(['/mock', '/api'], (req,res,next)=> {
 if(req.path==='/session')return next();
 return res.status(410).json({error:'Simulation endpoints retired. Use /api/live for Base Sepolia testnet.'});
});
app.use("/mock/merchant", merchantRouter);
app.use("/api", chatRouter);
app.use("/api", simulationRouter);
app.use("/api", async (req, res, next) => {
  if (req.method === "GET") return next();
  return requireSession(req, res, () => {
    if (/^\/(wallets|agents|security\/policies)/.test(req.path))
      return role("blue")(req, res, next);
    next();
  });
});
app.get("/api/state", async (_, res) =>
  res.json({
    wallets: await db.wallet.findMany(),
    agents: await db.agent.findMany(),
    policy: await db.policy.findFirst({ orderBy: { version: "desc" } }),
    payments: await db.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    guards: await db.guard.findMany(),
    reports: await db.report.findMany({
      include: { guard: true },
      orderBy: { createdAt: "desc" },
    }),
    categories,
  }),
);
app.get("/api/wallets", async (_, res) => res.json(await db.wallet.findMany()));
app.post("/api/wallets", async (req, res) => {
  const data = z
    .object({
      name: z.string().min(1).max(80),
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      mode: z.literal("mock"),
    })
    .parse(req.body);
  res.json(await db.wallet.create({ data }));
});
app.delete("/api/wallets/:id", async (req, res) =>
  res.json(await db.wallet.delete({ where: { id: req.params.id } })),
);
app.patch("/api/wallets/:id", async (req, res) =>
  res.json(
    await db.wallet.update({
      where: { id: req.params.id },
      data: z.object({ enabled: z.boolean() }).parse(req.body),
    }),
  ),
);
app.get("/api/agents", async (_, res) => res.json(await db.agent.findMany()));
app.post("/api/agents", async (req, res) =>
  res.json(
    await db.agent.create({
      data: z
        .object({ name: z.string().min(1), walletId: z.string() })
        .parse(req.body),
    }),
  ),
);
app.get("/api/security/policies", async (_, res) =>
  res.json(await db.policy.findMany({ orderBy: { version: "desc" } })),
);
app.post("/api/security/policies", async (req, res) => {
  const config = z
    .object({
      maxPayment: uint,
      dailyLimit: uint,
      sessionLimit: uint,
      approvalAbove: uint,
      expectedPrice: uint,
      deviationBps: z.number().int().min(0).max(10000),
      recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      asset: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      network: z.literal("eip155:84532"),
      scheme: z.literal("exact"),
      service: z.string().url(),
      enabled: z.boolean(),
    })
    .parse(req.body);
  res.json(
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(403)`;
      const previous = await tx.policy.findFirst({
        orderBy: { version: "desc" },
      });
      const row = await tx.policy.create({
        data: { version: (previous?.version || 0) + 1, config },
      });
      await tx.audit.create({
        data: { action: "policy.updated", data: { version: row.version } },
      });
      return row;
    }),
  );
});
app.post("/api/payments/inspect", async (req, res) => {
  if (req.body.paymentRequiredHeader)
    return res.json({
      requirements: decodePaymentRequiredHeader(req.body.paymentRequiredHeader),
      note: "Parsed only, not verified or authorized",
    });
  res.json(await validate(req.body));
});
app.post("/api/security/validate", async (req, res) => {
  const result = await validate(req.body);
  broadcast();
  res.json(result);
});
app.post("/api/demo/:scenario", async (req, res) => {
  const agent = await db.agent.findFirstOrThrow();
  const e: any = fixture(agent.id);
  if (req.params.scenario === "overpayment") {
    e.payment.accepted.amount = "10000000";
    e.authorization.value = "10000000";
  }
  if (req.params.scenario === "wrong_party")
    e.payment.accepted.payTo = "0x1111111111111111111111111111111111111111";
  if (req.params.scenario === "replay") await validate(e);
  const result = await validate(e);
  broadcast();
  res.json(result);
});
app.get("/api/payments", async (_, res) =>
  res.json(
    await db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ),
);
app.get("/api/payments/:id", async (req, res) =>
  res.json(
    await db.payment.findUniqueOrThrow({ where: { id: req.params.id } }),
  ),
);
app.get("/api/security/events", async (_, res) =>
  res.json(
    await db.payment.findMany({
      where: { decision: { not: "approve" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
app.get("/api/attacks", (_, res) => res.json(categories));
app.post("/api/guards", async (req, res) => {
  const data = z
    .object({
      name: z.string().min(1).max(80),
      endpoint: z.string().url(),
      adapterVersion: z.literal("x402-guard/1").default("x402-guard/1"),
      authenticationReference: z
        .string()
        .regex(/^GUARD_SECRET_[A-Z0-9_]+$/)
        .optional(),
    })
    .strict()
    .parse(req.body);
  const url = new URL(data.endpoint);
  if (
    url.protocol !== "https:" ||
    !process.env.GUARD_ALLOWED_ORIGINS?.split(",").includes(url.origin)
  )
    return res
      .status(400)
      .json({ error: "Endpoint must be an operator-approved HTTPS origin" });
  res.json(await db.guard.create({ data }));
});
app.get("/api/guards", async (_, res) => res.json(await db.guard.findMany()));
app.post(
  ["/api/attacks/run", "/api/attacks/run-batch", "/api/guards/:id/test"],
  async (req, res) => {
    const body = z
      .object({
        guardId: z.string().optional(),
        categories: z
          .array(z.enum(categories as [string, ...string[]]))
          .max(10)
          .optional(),
      })
      .parse(req.body);
    res.json(
      await assess(
        String(req.params.id || body.guardId || ""),
        body.categories,
      ),
    );
    broadcast();
  },
);
app.get("/api/reports", async (_, res) =>
  res.json(await db.report.findMany({ include: { guard: true } })),
);
app.get("/api/reports/:id/export", async (req, res) => {
  const report = await db.report.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { guard: true },
  });
  if (req.query.format === "pdf") {
    res.type("pdf");
    res.attachment(`x402-${report.id}.pdf`);
    const pdf = new PDFDocument();
    pdf.pipe(res);
    pdf.fontSize(22).text("x402 Red/Blue Security Assessment");
    pdf
      .fontSize(12)
      .text(
        `${report.guard.name}\nScore: ${report.score}/100\nMock suite 1.0.0\n${JSON.stringify(report.results, null, 2)}`,
      );
    pdf.end();
  } else {
    res.attachment(`x402-${report.id}.json`).json(report);
  }
});
app.use((err: any, req: any, res: any, _next: any) => {
  const status =
    err instanceof z.ZodError
      ? 400
      : err instanceof AppError
        ? err.status
        : err?.code === "P2025"
          ? 404
          : 500;
  const code =
    err instanceof z.ZodError
      ? "VALIDATION_ERROR"
      : err instanceof AppError
        ? err.code
        : status === 404
          ? "NOT_FOUND"
          : "INTERNAL_ERROR";
  console.error(
    JSON.stringify({
      event: "request.failed",
      code,
      path: req.path,
      message: req.path.startsWith("/api/live")||req.path.startsWith("/merchant") ? "Testnet operation failed" : err.message,
    }),
  );
  res.status(status).json({
    error:
      err instanceof z.ZodError
        ? "Invalid request"
        : err instanceof AppError
          ? err.message
          : status === 404
            ? "Record not found"
            : "Operation failed. No success has been recorded.",
    code,
    details: err instanceof z.ZodError ? err.issues : undefined,
  });
});
const server = createServer(app),
  wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: (info: { origin: string }) =>
      Boolean(info.origin && allowedOrigins().has(info.origin)),
  });
realtime.on("refresh",()=>broadcast());
function broadcast() {
  for (const c of wss.clients)
    if (c.readyState === 1) c.send(JSON.stringify({ type: "refresh" }));
}
if(process.env.NODE_ENV!=='test'){const start=()=>server.listen(Number(process.env.PORT||3001),'0.0.0.0',()=>{if(!simulationMode())startIndexer();console.log(simulationMode()?'CrypBridge · SIMULATION ONLY · no public blockchain submission':'CrypBridge · Base Sepolia Testnet');});if(simulationMode())seedCatalog().then(start).catch(()=>{console.error('Simulation database initialization failed. Apply the committed migration.');process.exitCode=1;});else start();}
