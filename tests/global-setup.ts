import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
export default async function setup() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Tests require a PostgreSQL DATABASE_URL.");
  const schema = "x402_test_" + randomUUID().replaceAll("-", "");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    DEMO_MODE: "true",
  };
  function run(args: string[]) {
    const r = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    if (r.status !== 0)
      throw new Error(
        "Disposable test database setup failed. Check PostgreSQL connectivity and schema permissions.",
      );
  }
  const prisma = resolve("node_modules/prisma/build/index.js");
  try {
    run([
      prisma,
      "db",
      "push",
      "--schema",
      "prisma/schema.prisma",
      "--skip-generate",
    ]);
    run([
      prisma,
      "db",
      "execute",
      "--schema",
      "prisma/schema.prisma",
      "--file",
      "prisma/db-invariants.sql",
    ]);
    run([prisma,"db","execute","--schema","prisma/schema.prisma","--file","prisma/testnet-invariants.sql"]);
    run([prisma,"db","execute","--schema","prisma/schema.prisma","--file","prisma/lab-invariants.sql"]);
    run(["--import", "tsx", "server/seed.ts"]);
  } catch (e) {
    const client = new PrismaClient({ datasourceUrl: base });
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
    throw e;
  }
  return async () => {
    const client = new PrismaClient({ datasourceUrl: base });
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
  };
}
