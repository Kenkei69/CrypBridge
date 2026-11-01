import { db } from "../config";
import { chain, token, transferEvent, connectivity } from "./chain";
export async function notify(
  userId: string,
  key: string,
  type: string,
  data: any,
) {
  return db.liveNotification.upsert({
    where: { key },
    create: { userId, key, type, data },
    update: {},
  });
}
let running = false;
export async function indexOnce() {
  if (running) return;
  running = true;
  try {
    await connectivity();
    const latest = await chain.getBlockNumber();
    const depth = BigInt(process.env.INDEXER_CONFIRMATIONS || 3);
    const head = latest - depth + 1n;
    const initial = process.env.INDEXER_START_BLOCK
      ? BigInt(process.env.INDEXER_START_BLOCK)
      : 0n;
    await db.chainCheckpoint.upsert({
      where: { id: "usdc" },
      create: {
        id: "usdc",
        nextBlock: process.env.INDEXER_START_BLOCK ? initial : head,
        startBlock: process.env.INDEXER_START_BLOCK ? initial : head,
      },
      update: {},
    });
    // A database advisory lock serializes all replicas; cursor and logs commit together.
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(current_schema()),8453201)`;
        let cursor = await tx.chainCheckpoint.findUniqueOrThrow({
          where: { id: "usdc" },
        });
        if (process.env.INDEXER_START_BLOCK && initial < cursor.startBlock) {
          cursor = await tx.chainCheckpoint.update({
            where: { id: "usdc" },
            data: { startBlock: initial, nextBlock: initial, blockHash: null },
          });
        }
        if (cursor.blockHash && cursor.nextBlock > 0n) {
          const anchor = await chain.getBlock({
            blockNumber: cursor.nextBlock - 1n,
          });
          if (anchor.hash !== cursor.blockHash) {
            await tx.usdcTransfer.updateMany({
              where: { blockNumber: { gte: cursor.startBlock } },
              data: { status: "Reorganized" },
            });
            await tx.chainTransaction.updateMany({
              where: { blockNumber: { gte: cursor.startBlock } },
              data: { status: "Reorganized" },
            });
            const hashes = (
              await tx.usdcTransfer.findMany({
                where: { status: "Reorganized" },
                select: { txHash: true },
              })
            ).map((t) => t.txHash);
            await tx.liveIntent.updateMany({
              where: { txHash: { in: hashes } },
              data: {
                state: "REORGANIZED",
                error:
                  "Canonical block changed; historical recovery in progress",
              },
            });
            cursor = await tx.chainCheckpoint.update({
              where: { id: "usdc" },
              data: { nextBlock: cursor.startBlock, blockHash: null },
            });
          }
        }
        const replay =
          cursor.nextBlock > 20n ? cursor.nextBlock - 20n : initial;
        const from = replay < initial ? initial : replay;
        const to = from + 199n < head ? from + 199n : head;
        if (from > to) return;
        const logs = await chain.getLogs({
          address: token,
          event: transferEvent,
          fromBlock: from,
          toBlock: to,
          strict: true,
        });
        const old = await tx.usdcTransfer.findMany({
          where: { blockNumber: { gte: from, lte: to } },
        });
        const ids = new Set(
          logs.map((l) => `${l.transactionHash}:${l.logIndex}`),
        );
        for (const missing of old.filter((l) => !ids.has(l.id))) {
          await tx.usdcTransfer.update({
            where: { id: missing.id },
            data: { status: "Reorganized" },
          });
          await tx.chainTransaction.updateMany({
            where: { hash: missing.txHash },
            data: { status: "Reorganized" },
          });
          await tx.liveIntent.updateMany({
            where: { txHash: missing.txHash },
            data: {
              state: "REORGANIZED",
              error: "Canonical USDC transfer removed during reconciliation",
            },
          });
        }
        const blocks = new Map<
          bigint,
          Awaited<ReturnType<typeof chain.getBlock>>
        >();
        const watches = await tx.liveWatch.findMany();
        for (const l of logs) {
          let block = blocks.get(l.blockNumber);
          if (!block) {
            block = await chain.getBlock({ blockNumber: l.blockNumber });
            blocks.set(l.blockNumber, block);
          }
          if (block.hash !== l.blockHash)
            throw new Error("Chain changed during indexing");
          const id = `${l.transactionHash}:${l.logIndex}`,
            timestamp = new Date(Number(block.timestamp) * 1000);
          const data = {
            txHash: l.transactionHash,
            logIndex: l.logIndex,
            blockNumber: l.blockNumber,
            blockHash: l.blockHash,
            contract: token,
            sender: l.args.from.toLowerCase(),
            recipient: l.args.to.toLowerCase(),
            amount: l.args.value.toString(),
            timestamp,
            status: "Confirmed",
          };
          await tx.usdcTransfer.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
          await tx.chainTransaction.upsert({
            where: { hash: l.transactionHash },
            create: {
              hash: l.transactionHash,
              blockNumber: l.blockNumber,
              blockHash: l.blockHash,
              status: "Confirmed",
              timestamp,
              confirmations: Number(latest - l.blockNumber + 1n),
            },
            update: {
              blockHash: l.blockHash,
              status: "Confirmed",
              confirmations: Number(latest - l.blockNumber + 1n),
            },
          });
          for (const w of watches.filter(
            (w) =>
              w.startBlock <= l.blockNumber &&
              (w.address === data.sender || w.address === data.recipient),
          )) {
            const key = `watch:${w.id}:${id}:${l.blockHash}`;
            await tx.liveNotification.upsert({
              where: { key },
              create: {
                key,
                userId: w.userId,
                type:
                  w.address === data.sender
                    ? "watched.sent"
                    : "watched.received",
                data: { transferId: id, transaction: l.transactionHash },
              },
              update: {},
            });
          }
        }
        await tx.chainCheckpoint.update({
          where: { id: "usdc" },
          data: {
            nextBlock: to + 1n,
            blockHash: (await chain.getBlock({ blockNumber: to })).hash,
          },
        });
      },
      { timeout: 120000 },
    );
    await updateGraphs();
    const { reconcile } = await import("./service");
    for (const i of await db.liveIntent.findMany({
      where: { state: { in: ["SUBMITTED", "CONFIRMING", "RECONCILING"] } },
      take: 50,
    })) {
      try {
        await reconcile(i.id, i.userId);
      } catch {
        /* Keep uncertain authorizations reserved; never resubmit. */
      }
    }
  } finally {
    running = false;
  }
}
export async function updateGraphs() {
  for (const c of await db.scamCase.findMany()) {
    const seed = await db.usdcTransfer.findFirst({
      where: { txHash: c.txHash, status: "Confirmed" },
      orderBy: { blockNumber: "asc" },
    });
    if (!seed) continue;
    const known = new Set([c.suspect.toLowerCase()]);
    await db.investigationEdge.deleteMany({ where: { caseId: c.id } });
    for (let hop = 1; hop <= 3; hop++) {
      const transfers = await db.usdcTransfer.findMany({
        where: {
          status: "Confirmed",
          blockNumber: { gte: seed.blockNumber },
          OR: [
            { sender: { in: [...known] } },
            { recipient: { in: [...known] } },
          ],
        },
        orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
        take: 1000,
      });
      for (const t of transfers) {
        await db.investigationEdge.upsert({
          where: { id: `${c.id}:${t.id}` },
          create: {
            id: `${c.id}:${t.id}`,
            caseId: c.id,
            transferId: t.id,
            hop,
            evidenceSource: `Base Sepolia ${token} Transfer log ${t.txHash}:${t.logIndex}`,
          },
          update: {},
        });
        await notify(
          c.userId,
          `investigation:${c.id}:${t.id}`,
          "investigation.transfer",
          { caseId: c.id, transferId: t.id, txHash: t.txHash },
        );
        known.add(t.sender);
        known.add(t.recipient);
      }
    }
  }
}
export function startIndexer() {
  const tick = () =>
    indexOnce()
      .catch(async () => {
        for (const s of await db.workspaceSession.findMany({
          distinct: ["userId"],
        }))
          await notify(
            s.userId,
            `monitor:${s.userId}:${Math.floor(Date.now() / 60000)}`,
            "monitor.failure",
            { error: "RPC/indexer failed; checkpoint retained" },
          );
      })
      .catch(() => {
        console.error(
          "Monitoring failure: database unavailable; no success recorded",
        );
      });
  void tick();
  return setInterval(() => void tick(), 15000);
}
