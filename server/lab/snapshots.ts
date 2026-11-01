import { randomUUID } from "node:crypto";
import { db } from "../config";
import { Scope, ENGINE, digest, owned, emit, locked, json } from "./core";
import { exportEnvironment } from "./runner";
export async function snapshot(
  scope: Scope,
  environmentId: string,
  label: string,
) {
  const data = await exportEnvironment(scope, environmentId);
  return db.labSnapshot.create({
    data: { environmentId, label, version: ENGINE, data, digest: digest(data) },
  });
}
export async function restore(scope: Scope, id: string, activate = false) {
  const s = await db.labSnapshot.findUniqueOrThrow({ where: { id } });
  await owned(s.environmentId, scope);
  const state = s.data as any;
  if (s.version !== ENGINE || !state.environment || digest(state) !== s.digest)
    throw new Error("Unsupported or corrupted simulation snapshot");
  if (activate && state.environment.kind !== "NORMAL")
    throw new Error(
      "A vulnerable baseline cannot replace the normal Guardian workspace",
    );
  return db.$transaction(
    async (tx) => {
      const old = state.environment,
        newId = randomUUID();
      const collections: [string, string][] = [
        ["wallets", "labWallet"],
        ["balances", "labBalance"],
        ["ledger", "labLedger"],
        ["tasks", "labTask"],
        ["purchases", "labPurchase"],
        ["authorizations", "labAuthorization"],
        ["attacks", "labAttack"],
        ["attempts", "labAttempt"],
        ["decisions", "labDecision"],
        ["rules", "labRuleResult"],
        ["signings", "labSigning"],
        ["movementAuthorizations", "labMovementAuthorization"],
        ["settlements", "labSettlement"],
        ["blocks", "labBlock"],
        ["transactions", "labTransaction"],
        ["executions", "labExecution"],
        ["logs", "labLog"],
        ["flows", "labFlowEdge"],
        ["incidents", "labIncident"],
        ["exchangeCases", "labExchangeCase"],
        ["allowances", "labAllowance"],
        ["conversations", "labConversation"],
        ["messages", "labMessage"],
      ];
      const mapping = new Map<string, string>([[old.id, newId]]);
      for (const [key] of collections)
        for (const row of state[key] || [])
          if (row.id)
            mapping.set(
              row.id,
              row.id.startsWith(old.id)
                ? row.id.replace(old.id, newId)
                : randomUUID(),
            );
      for (const e of state.events || []) mapping.set(e.id, randomUUID());
      function copy(v: any): any {
        if (typeof v === "string") return mapping.get(v) || v;
        if (Array.isArray(v)) return v.map(copy);
        if (v && typeof v === "object")
          return Object.fromEntries(
            Object.entries(v).map(([k, x]) => [k, copy(x)]),
          );
        return v;
      }
      await tx.labEnvironment.create({
        data: {
          ...old,
          id: newId,
          userId: scope.userId,
          sandboxId: scope.sandboxId,
          createdAt: new Date(),
          eventHash: "genesis",
        },
      });
      for (const [key, model] of collections) {
        const rows = state[key] || [];
        for (const raw of rows) {
          const row = copy(raw);
          if (key === "wallets") {
            delete row.usdcAtomic;
            delete row.ethWei;
          }
          await (tx as any)[model].create({ data: row });
        }
      }
      // Balance snapshots are recomputed from the copied authoritative journal, never trusted as independent money.
      for (const w of state.wallets) {
        for (const asset of ["USDC", "ETH"]) {
          const wallet = mapping.get(w.id)!;
          const sum = await tx.labLedger.aggregate({
            where: { walletId: wallet, asset },
            _sum: { delta: true },
          });
          await tx.labBalance.upsert({
            where: { walletId_asset: { walletId: wallet, asset } },
            create: {
              id: wallet + ":" + asset,
              environmentId: newId,
              walletId: wallet,
              asset,
              amount: sum._sum.delta || "0",
            },
            update: { amount: sum._sum.delta || "0" },
          });
        }
      }
      let previousHash = "genesis";
      for (const raw of state.events) {
        const event = copy(raw);
        event.previousHash = previousHash;
        const purchase = event.purchaseId
          ? await tx.labPurchase.findUnique({ where: { id: event.purchaseId } })
          : null;
        event.integrity = digest({
          previousHash,
          sequence: event.sequence,
          timestamp: event.timestamp,
          type: event.type,
          actor: event.actor,
          purchaseOrdinal: purchase?.ordinal || null,
          metadata: event.metadata,
        });
        await tx.labEvent.create({ data: event });
        previousHash = event.integrity;
      }
      await tx.labEnvironment.update({
        where: { id: newId },
        data: { eventHash: previousHash },
      });
      if (state.checkpoint)
        await tx.labCheckpoint.create({
          data: { ...copy(state.checkpoint), environmentId: newId },
        });
      await emit(tx, newId, "SIMULATION_SNAPSHOT_RESTORED", "engine", {
        sourceSnapshotDigest: s.digest,
        sourceEnvironment: old.id,
        productionStateAffected: false,
      });
      if (activate)
        await tx.labWorkspace.update({
          where: { userId_sandboxId: scope },
          data: { environmentId: newId },
        });
      return tx.labEnvironment.findUniqueOrThrow({ where: { id: newId } });
    },
    { timeout: 30000 },
  );
}
