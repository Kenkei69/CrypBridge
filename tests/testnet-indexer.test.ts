import { it, expect, vi, afterEach, afterAll } from "vitest";
import { db } from "../server/config";
import { chain, token } from "../server/testnet/chain";
import { indexOnce } from "../server/testnet/indexer";
const hash = ("0x" + "a".repeat(64)) as `0x${string}`,
  blockHash = ("0x" + "b".repeat(64)) as `0x${string}`;
function rpc() {
  vi.spyOn(chain, "getChainId").mockResolvedValue(84532);
  vi.spyOn(chain, "getCode").mockResolvedValue("0x1234");
  vi.spyOn(chain, "readContract").mockResolvedValue(6);
  vi.spyOn(chain, "getBlockNumber").mockResolvedValue(102n);
  vi.spyOn(chain, "getBlock").mockResolvedValue({
    hash: blockHash,
    timestamp: 1000n,
  } as any);
}
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());
it("retains durable cursor on RPC failure, catches up, deduplicates, and marks a removed log reorganized", async () => {
  rpc();
  await db.chainCheckpoint.upsert({
    where: { id: "usdc" },
    create: { id: "usdc", nextBlock: 90n },
    update: { nextBlock: 90n },
  });
  const log = {
    transactionHash: hash,
    logIndex: 1,
    blockNumber: 95n,
    blockHash,
    args: {
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      value: 1000000n,
    },
  };
  const logs = vi
    .spyOn(chain, "getLogs")
    .mockRejectedValueOnce(new Error("Injected RPC outage"));
  await expect(indexOnce()).rejects.toThrow("Injected RPC outage");
  expect(
    (await db.chainCheckpoint.findUniqueOrThrow({ where: { id: "usdc" } }))
      .nextBlock,
  ).toBe(90n);
  logs.mockResolvedValue([log] as any);
  await indexOnce();
  await db.$disconnect();
  await indexOnce();
  expect(await db.usdcTransfer.count({ where: { txHash: hash } })).toBe(1);
  expect(
    (await db.chainCheckpoint.findUniqueOrThrow({ where: { id: "usdc" } }))
      .nextBlock,
  ).toBe(101n);
  logs.mockResolvedValue([]);
  await indexOnce();
  expect(
    (await db.usdcTransfer.findUniqueOrThrow({ where: { id: `${hash}:1` } }))
      .status,
  ).toBe("Reorganized");
}, 30000);
