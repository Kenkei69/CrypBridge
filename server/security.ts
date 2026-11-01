import {simulationMode} from './runtime';
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db } from "./config";
import { AppError } from "./errors";
export function allowedOrigins() {
  const origins = new Set([
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  for (const v of [
    process.env.APP_ORIGIN,
    ...(process.env.APP_ORIGINS || "").split(","),
    ...(process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((d) => (d ? `https://${d}` : "")),
    process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "",
    ...(process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((d) => (d ? `https://${d}:5000` : "")),
    process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}:5000`
      : "",
  ]) {
    if (!v) continue;
    try {
      const u = new URL(v.trim());
      if (
        ["https:", "http:"].includes(u.protocol) &&
        u.origin === v.trim().replace(/\/$/, "")
      )
        origins.add(u.origin);
    } catch {}
  }
  return origins;
}
export function checkOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().has(origin)) {
    console.warn(
      JSON.stringify({ event: "origin.rejected", origin, path: req.path }),
    );
    return next(
      new AppError(
        403,
        "ORIGIN_REJECTED",
        "This frontend origin is not authorized. Configure its exact URL in APP_ORIGINS on the API.",
      ),
    );
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !origin &&
    req.headers["sec-fetch-site"] === "cross-site"
  )
    return next(
      new AppError(403, "ORIGIN_REJECTED", "Cross-site mutation rejected."),
    );
  next();
}
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  if (
    process.env.DEMO_MODE !== "true" &&
    (!process.env.ADMIN_TOKEN ||
      req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`)
  )
    return next(
      new AppError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An authenticated operator is required.",
      ),
    );
  next();
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function demoUser() {
  return db.user.upsert({
    where: { email: "operator@mock.x402.local" },
    create: { email: "operator@mock.x402.local", name: "Demo operator" },
    update: {},
  });
}
export async function createSession(
  req: Request,
  res: Response,
  workspace: "blue" | "red",
) {
  const user = await demoUser();
  const sandboxToken=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('guardian_sandbox='))?.slice(17);
  let sandbox=sandboxToken?await db.testSandbox.findFirst({where:{tokenHash:hash(sandboxToken),userId:user.id}}):null;
  const newSandboxToken=sandbox?null:randomBytes(32).toString('hex');
  if(!sandbox)sandbox=await db.testSandbox.create({data:{userId:user.id,tokenHash:hash(newSandboxToken!)}});
  const token = randomBytes(32).toString("hex");
  await db.workspaceSession.create({
    data: {
      tokenHash: hash(token),
      userId: user.id,
      workspace,
      sandboxId:sandbox.id,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  const secure =
    req.headers.origin?.startsWith("https:") ||
    req.secure ||
    process.env.SESSION_SECURE === "true";
  res.cookie("x402_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 8 * 3600000,
  });
  if(newSandboxToken)res.cookie('guardian_sandbox',newSandboxToken,{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:30*24*3600000});
  return {
    workspace,
    sandboxId:sandbox.id,
    user: { id: user.id, name: user.name },
    mode: simulationMode()?"simulation":"testnet",
    authentication: process.env.DEMO_MODE === "true" ? "demo" : "operator",
  };
}
export async function session(req: Request) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("x402_session="))
    ?.slice(13);
  if (!cookie) return null;
  return db.workspaceSession.findFirst({
    where: { tokenHash: hash(cookie), expiresAt: { gt: new Date() } },
    include: { user: true },
  });
}
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const s = await session(req);
    if (!s)
      throw new AppError(
        401,
        "SESSION_REQUIRED",
        "Open a team workspace to establish an operator session.",
      );
    res.locals.session = s;
    next();
  } catch (e) {
    next(e);
  }
}
export function role(workspace: "blue" | "red") {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (res.locals.session?.workspace !== workspace)
      return next(
        new AppError(
          403,
          "WORKSPACE_FORBIDDEN",
          `This operation requires the ${workspace === "blue" ? "Blue" : "Red"} Team workspace.`,
        ),
      );
    next();
  };
}
