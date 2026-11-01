import {
  createPublicClient,
  http,
  fallback,
  erc20Abi,
  parseAbiItem,
  getAddress,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
export const network = "eip155:84532" as const;
export const token = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
export function assertConfig() {
  for (const name of ["PAYMENT_CONFIRMATIONS", "INDEXER_CONFIRMATIONS"]) {
    const n = Number(process.env[name] || 3);
    if (!Number.isSafeInteger(n) || n < 1)
      throw new Error(name + " must be a positive integer");
  }
  if (
    (process.env.CHAIN_ID || "84532") !== "84532" ||
    (process.env.NETWORK || network) !== network ||
    (process.env.PAYMENT_MODE || "testnet") !== "testnet" ||
    getAddress(process.env.USDC_CONTRACT || token) !== token
  )
    throw new Error("Only Base Sepolia Circle USDC testnet is supported");
}
export const chain = createPublicClient({
  chain: baseSepolia,
  transport: fallback(
    [
      process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      process.env.BASE_SEPOLIA_SECONDARY_RPC_URL,
    ]
      .filter(Boolean)
      .map((url) => http(url!, { timeout: 12000, retryCount: 1 })),
  ),
});
export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
export async function connectivity() {
  assertConfig();
  const id = await chain.getChainId();
  if (id !== 84532) throw new Error("RPC chain ID mismatch");
  const code = await chain.getCode({ address: token });
  if (!code || code === "0x") throw new Error("USDC contract missing");
  const decimals = await chain.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (decimals !== 6) throw new Error("USDC decimals mismatch");
  return {
    chainId: id,
    network,
    token,
    decimals,
    block: (await chain.getBlockNumber()).toString(),
  };
}
export async function balances(address: Hex) {
  await connectivity();
  const [eth, usdc] = await Promise.all([
    chain.getBalance({ address }),
    chain.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  return {
    address,
    ethWei: eth.toString(),
    usdcAtomic: usdc.toString(),
    decimals: 6,
  };
}
export async function receipt(hash: Hex) {
  const r = await chain.getTransactionReceipt({ hash });
  const b = await chain.getBlock({ blockNumber: r.blockNumber });
  if (b.hash !== r.blockHash) throw new Error("Reorganized receipt");
  const head = await chain.getBlockNumber();
  return {
    receipt: r,
    confirmations: head - r.blockNumber + 1n,
    timestamp: new Date(Number(b.timestamp) * 1000),
  };
}
